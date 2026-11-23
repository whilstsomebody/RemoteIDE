import * as Y from "yjs";
import path from "node:path";
import {
  AppError,
  ErrorCode,
  CollabRole,
  CollabParticipant,
  CollabComment,
  CollabProposedChange,
  CollabConflictStatus,
  getParticipantColor,
} from "@remote-ide/shared";
import { FilesystemService } from "../filesystem.service.js";
import type { WatcherService } from "../watcher.service.js";
import { logger } from "@remote-ide/shared";

export interface CollabSessionRecord {
  workspaceId: string;
  relativePath: string;
  doc: Y.Doc;
  text: Y.Text;
  initialETag: string;
  lastPersistedMtime: string;
  isDirty: boolean;
  participants: Map<string, CollabParticipant>;
  comments: CollabComment[];
  proposals: CollabProposedChange[];
  conflictStatus?: CollabConflictStatus;
  writeTimer?: NodeJS.Timeout;
  inactivityTimer?: NodeJS.Timeout;
  snapshots: { timestamp: string; update: Uint8Array }[];
}

export interface CollabDocManagerOptions {
  batchWriteDelayMs?: number;
  inactivityTtlMs?: number;
  maxSnapshots?: number;
}

export class CollabDocManagerService {
  private sessions = new Map<string, CollabSessionRecord>();
  private fsService: FilesystemService;
  private watcherService?: WatcherService;
  private batchWriteDelayMs: number;
  private inactivityTtlMs: number;
  private maxSnapshots: number;
  private eventListeners = new Set<(event: { type: string; payload: any }) => void>();

  constructor(
    fsService: FilesystemService,
    watcherService?: WatcherService,
    options?: CollabDocManagerOptions
  ) {
    this.fsService = fsService;
    this.watcherService = watcherService;
    this.batchWriteDelayMs = options?.batchWriteDelayMs ?? 300;
    this.inactivityTtlMs = options?.inactivityTtlMs ?? 300000; // 5 minutes default
    this.maxSnapshots = options?.maxSnapshots ?? 10;

    if (this.watcherService) {
      this.watcherService.subscribe((evt) => {
        if (evt.eventType === "update") {
          this.handleExternalFileChange(evt.workspaceId, evt.relativePath);
        }
      });
    }
  }

  public subscribeEvents(cb: (event: { type: string; payload: any }) => void): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  private emit(type: string, payload: any): void {
    for (const listener of this.eventListeners) {
      try {
        listener({ type, payload });
      } catch (err) {
        logger.error({ err, type }, "Error in collab event listener");
      }
    }
  }

  public getSessionKey(workspaceId: string, relativePath: string): string {
    return `${workspaceId}:${path.normalize(relativePath)}`;
  }

  /**
   * Loads or retrieves an active authoritative collaborative session.
   * Loads initial text from the host filesystem if not already active in memory.
   */
  public async getOrCreateSession(
    workspaceId: string,
    relativePath: string
  ): Promise<CollabSessionRecord> {
    const key = this.getSessionKey(workspaceId, relativePath);
    let session = this.sessions.get(key);

    if (session) {
      if (session.inactivityTimer) {
        clearTimeout(session.inactivityTimer);
        session.inactivityTimer = undefined;
      }
      return session;
    }

    const fileData = this.fsService.readFile(workspaceId, relativePath, "utf-8");
    const stat = this.fsService.getFileStat(workspaceId, relativePath);

    const doc = new Y.Doc();
    const text = doc.getText("contents");

    doc.transact(() => {
      text.insert(0, fileData.content);
    });

    session = {
      workspaceId,
      relativePath: path.normalize(relativePath),
      doc,
      text,
      initialETag: fileData.eTag,
      lastPersistedMtime: stat.mtime,
      isDirty: false,
      participants: new Map(),
      comments: [],
      proposals: [],
      snapshots: [
        {
          timestamp: new Date().toISOString(),
          update: Y.encodeStateAsUpdate(doc),
        },
      ],
    };

    this.sessions.set(key, session);

    doc.on("update", () => {
      session.isDirty = true;
    });

    this.emit("collab.session.started", { workspaceId, relativePath, key });

    return session;
  }

  public getSession(workspaceId: string, relativePath: string): CollabSessionRecord | undefined {
    return this.sessions.get(this.getSessionKey(workspaceId, relativePath));
  }

  public async join(
    workspaceId: string,
    relativePath: string,
    user: { id: string; name: string; role: CollabRole; deviceId?: string }
  ): Promise<{
    participant: CollabParticipant;
    session: CollabSessionRecord;
    syncUpdateBase64: string;
  }> {
    const session = await this.getOrCreateSession(workspaceId, relativePath);

    const participant: CollabParticipant = {
      id: user.id,
      name: user.name || "Collaborator",
      color: getParticipantColor(user.id),
      role: user.role,
      deviceId: user.deviceId,
      joinedAt: new Date().toISOString(),
    };

    session.participants.set(user.id, participant);

    const syncUpdate = Y.encodeStateAsUpdate(session.doc);
    const syncUpdateBase64 = Buffer.from(syncUpdate).toString("base64");

    this.emit("collab.participant.joined", {
      workspaceId,
      relativePath,
      participant,
      participantCount: session.participants.size,
    });

    return { participant, session, syncUpdateBase64 };
  }

  /**
   * Registers a participant leaving.
   * If no participants remain, starts the inactivity timer to flush and clean up.
   */
  public leave(
    workspaceId: string,
    relativePath: string,
    participantId: string
  ): { participantCount: number } {
    const session = this.getSession(workspaceId, relativePath);
    if (!session) return { participantCount: 0 };

    const participant = session.participants.get(participantId);
    session.participants.delete(participantId);

    if (participant) {
      this.emit("collab.participant.left", {
        workspaceId,
        relativePath,
        participantId,
        participantCount: session.participants.size,
      });
    }

    this.scheduleInactivityCleanup(session);

    return { participantCount: session.participants.size };
  }

  private scheduleInactivityCleanup(session: CollabSessionRecord): void {
    if (session.participants.size > 0 || session.inactivityTimer) return;
    session.inactivityTimer = setTimeout(() => {
      void this.cleanupSession(session.workspaceId, session.relativePath);
    }, this.inactivityTtlMs);
  }

  /**
   * Ingests a Yjs CRDT update.
   * STRICT ENFORCEMENT: Viewers cannot submit updates.
   */
  public applyClientUpdate(
    workspaceId: string,
    relativePath: string,
    updateBase64: string,
    user: { id: string; role: CollabRole }
  ): { applied: boolean; content: string } {
    const session = this.getSession(workspaceId, relativePath);
    // The registered participant role wins over the caller-claimed one, so a participant
    // demoted to viewer via assignRole() cannot keep writing by claiming "editor".
    const registeredRole = session?.participants.get(user.id)?.role;
    if (user.role === "viewer" || registeredRole === "viewer") {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        "Viewers are not permitted to submit document modifications"
      );
    }

    if (!session) {
      throw new AppError(ErrorCode.BAD_REQUEST, "No active collaborative session for file");
    }

    const updateBytes = Buffer.from(updateBase64, "base64");
    Y.applyUpdate(session.doc, updateBytes, user.id);

    session.isDirty = true;
    this.scheduleBatchWrite(session);

    return {
      applied: true,
      content: session.text.toString(),
    };
  }

  /**
   * Returns Yjs Step 2 sync payload given a client state vector.
   */
  public getSyncStep2(
    workspaceId: string,
    relativePath: string,
    clientStateVectorBase64?: string
  ): { updateBase64: string; participants: CollabParticipant[] } {
    const session = this.getSession(workspaceId, relativePath);
    if (!session) {
      throw new AppError(ErrorCode.BAD_REQUEST, "No active collaborative session for file");
    }

    let updateBytes: Uint8Array;
    if (clientStateVectorBase64) {
      const stateVector = Buffer.from(clientStateVectorBase64, "base64");
      updateBytes = Y.encodeStateAsUpdate(session.doc, stateVector);
    } else {
      updateBytes = Y.encodeStateAsUpdate(session.doc);
    }

    return {
      updateBase64: Buffer.from(updateBytes).toString("base64"),
      participants: Array.from(session.participants.values()),
    };
  }

  private scheduleBatchWrite(session: CollabSessionRecord): void {
    if (session.writeTimer) return; // Debounce timer already active

    session.writeTimer = setTimeout(() => {
      session.writeTimer = undefined;
      void this.flushSession(session);
    }, this.batchWriteDelayMs);
  }

  public async flush(workspaceId: string, relativePath: string): Promise<void> {
    const session = this.getSession(workspaceId, relativePath);
    if (session) {
      if (session.writeTimer) {
        clearTimeout(session.writeTimer);
        session.writeTimer = undefined;
      }
      await this.flushSession(session);
    }
  }

  private async flushSession(session: CollabSessionRecord): Promise<void> {
    if (!session.isDirty) return;

    const currentContent = session.text.toString();

    // Mark as internal save to avoid echo conflict from WatcherService
    if (this.watcherService) {
      this.watcherService.markInternalSave(session.workspaceId, session.relativePath);
    }

    try {
      this.fsService.writeFile(session.workspaceId, session.relativePath, currentContent);
      session.isDirty = false;
      session.lastPersistedMtime = new Date().toISOString();

      if (session.snapshots.length >= this.maxSnapshots) {
        session.snapshots.shift();
      }
      session.snapshots.push({
        timestamp: new Date().toISOString(),
        update: Y.encodeStateAsUpdate(session.doc),
      });

      this.emit("collab.doc.persisted", {
        workspaceId: session.workspaceId,
        relativePath: session.relativePath,
        length: currentContent.length,
      });
    } catch (err) {
      logger.error({ err, file: session.relativePath }, "Failed to flush collaborative document to host");
    }
  }

  public async cleanupSession(workspaceId: string, relativePath: string): Promise<void> {
    const key = this.getSessionKey(workspaceId, relativePath);
    const session = this.sessions.get(key);
    if (!session) return;

    if (session.writeTimer) {
      clearTimeout(session.writeTimer);
      session.writeTimer = undefined;
    }
    if (session.inactivityTimer) {
      clearTimeout(session.inactivityTimer);
      session.inactivityTimer = undefined;
    }

    await this.flushSession(session);
    session.doc.destroy();
    this.sessions.delete(key);
  }

  /**
   * Flushes all active documents (e.g. before shutdown).
   */
  public async flushAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.writeTimer) {
        clearTimeout(session.writeTimer);
        session.writeTimer = undefined;
      }
      await this.flushSession(session);
    }
  }

  /**
   * External change detection.
   * Triggered when an external tool (git checkout, external editor, formatter) writes to the file.
   */
  public handleExternalFileChange(workspaceId: string, relativePath: string): void {
    const session = this.getSession(workspaceId, relativePath);
    if (!session) return;

    try {
      const diskData = this.fsService.readFile(workspaceId, relativePath, "utf-8");
      const crdtText = session.text.toString();

      if (diskData.content === crdtText) {
        session.conflictStatus = undefined;
        return;
      }

      session.conflictStatus = {
        workspaceId,
        filePath: relativePath,
        conflictDetected: true,
        diskMtime: diskData.mtime,
        crdtMtime: session.lastPersistedMtime,
        diskContent: diskData.content,
        crdtContent: crdtText,
      };

      this.emit("collab.external_conflict", {
        workspaceId,
        relativePath,
        conflictStatus: session.conflictStatus,
      });
    } catch (err) {
      logger.warn({ err, relativePath }, "Failed to inspect external file change for conflict");
    }
  }

  /**
   * Resolves a detected conflict between external filesystem changes and collaborative CRDT state.
   */
  public resolveConflict(
    workspaceId: string,
    relativePath: string,
    resolution: "reload_disk" | "force_crdt" | "merge"
  ): { content: string; updateBase64: string } {
    const session = this.getSession(workspaceId, relativePath);
    if (!session) {
      throw new AppError(ErrorCode.BAD_REQUEST, "No active collaborative session for file");
    }

    if (resolution === "reload_disk") {
      const diskData = this.fsService.readFile(workspaceId, relativePath, "utf-8");
      session.doc.transact(() => {
        session.text.delete(0, session.text.length);
        session.text.insert(0, diskData.content);
      }, "reload_disk");

      session.isDirty = false;
      session.conflictStatus = undefined;
    } else if (resolution === "force_crdt") {
      session.conflictStatus = undefined;
      session.isDirty = true;
      void this.flushSession(session);
    } else if (resolution === "merge") {
      const diskData = this.fsService.readFile(workspaceId, relativePath, "utf-8");
      const diskLines = diskData.content.split("\n");
      const crdtLines = session.text.toString().split("\n");

      // Simple 3-way line union merge preserving both non-duplicate segments
      const mergedLines: string[] = [];
      const maxLen = Math.max(diskLines.length, crdtLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < crdtLines.length && i < diskLines.length) {
          if (crdtLines[i] === diskLines[i]) {
            mergedLines.push(crdtLines[i]!);
          } else {
            mergedLines.push(crdtLines[i]!);
            mergedLines.push(diskLines[i]!);
          }
        } else if (i < crdtLines.length) {
          mergedLines.push(crdtLines[i]!);
        } else {
          mergedLines.push(diskLines[i]!);
        }
      }

      const mergedContent = mergedLines.join("\n");
      session.doc.transact(() => {
        session.text.delete(0, session.text.length);
        session.text.insert(0, mergedContent);
      }, "merge");

      session.conflictStatus = undefined;
      session.isDirty = true;
      void this.flushSession(session);
    }

    const updateBytes = Y.encodeStateAsUpdate(session.doc);
    const updateBase64 = Buffer.from(updateBytes).toString("base64");

    this.emit("collab.conflict_resolved", {
      workspaceId,
      relativePath,
      resolution,
    });

    return {
      content: session.text.toString(),
      updateBase64,
    };
  }

  /**
   * Updates participant awareness (cursor, selection, following).
   */
  public updateAwareness(
    workspaceId: string,
    relativePath: string,
    participantId: string,
    cursor?: {
      line: number;
      col: number;
      selectionLength?: number;
      anchor?: number;
      head?: number;
    },
    followingParticipantId?: string
  ): CollabParticipant | undefined {
    const session = this.getSession(workspaceId, relativePath);
    if (!session) return undefined;

    const participant = session.participants.get(participantId);
    if (!participant) return undefined;

    if (cursor !== undefined) {
      participant.cursor = cursor;
    }
    if (followingParticipantId !== undefined) {
      participant.followingParticipantId = followingParticipantId || undefined;
    }

    return participant;
  }

  /**
   * Assigns or updates a participant's role.
   * Only document owners can assign roles.
   */
  public assignRole(
    workspaceId: string,
    relativePath: string,
    assignerRole: CollabRole,
    targetUserId: string,
    newRole: CollabRole
  ): CollabParticipant {
    if (assignerRole !== "owner") {
      throw new AppError(ErrorCode.FORBIDDEN, "Only the document owner can change roles");
    }

    const session = this.getSession(workspaceId, relativePath);
    if (!session) {
      throw new AppError(ErrorCode.BAD_REQUEST, "No active collaborative session");
    }

    const participant = session.participants.get(targetUserId);
    if (!participant) {
      throw new AppError(ErrorCode.NOT_FOUND, "Participant not found in session");
    }

    participant.role = newRole;
    this.emit("collab.role.changed", {
      workspaceId,
      relativePath,
      targetUserId,
      newRole,
    });

    return participant;
  }

  /**
   * Kicks/removes a participant from the collaborative session.
   * Only document owners can kick participants.
   */
  public kick(
    workspaceId: string,
    relativePath: string,
    kickerRole: CollabRole,
    targetUserId: string
  ): void {
    if (kickerRole !== "owner") {
      throw new AppError(ErrorCode.FORBIDDEN, "Only the document owner can remove participants");
    }

    const session = this.getSession(workspaceId, relativePath);
    if (!session) return;

    session.participants.delete(targetUserId);
    this.emit("collab.participant.kicked", {
      workspaceId,
      relativePath,
      targetUserId,
    });
    this.scheduleInactivityCleanup(session);
  }

  public addComment(
    workspaceId: string,
    relativePath: string,
    author: { id: string; name: string },
    line: number,
    text: string
  ): CollabComment {
    const session = this.getSession(workspaceId, relativePath);
    if (!session) {
      throw new AppError(ErrorCode.BAD_REQUEST, "No active collaborative session");
    }

    const comment: CollabComment = {
      id: "comment-" + Math.random().toString(36).slice(2, 10),
      workspaceId,
      filePath: relativePath,
      line,
      authorId: author.id,
      authorName: author.name,
      text,
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    session.comments.push(comment);
    this.emit("collab.comment.added", { workspaceId, relativePath, comment });
    return comment;
  }

  public listComments(workspaceId: string, relativePath: string): CollabComment[] {
    const session = this.getSession(workspaceId, relativePath);
    return session ? session.comments : [];
  }

  public resolveComment(workspaceId: string, relativePath: string, commentId: string): boolean {
    const session = this.getSession(workspaceId, relativePath);
    if (!session) return false;

    const comment = session.comments.find((c) => c.id === commentId);
    if (comment) {
      comment.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Proposes a change (e.g. from a viewer).
   */
  public addProposal(
    workspaceId: string,
    relativePath: string,
    author: { id: string; name: string },
    originalText: string,
    proposedText: string
  ): CollabProposedChange {
    const session = this.getSession(workspaceId, relativePath);
    if (!session) {
      throw new AppError(ErrorCode.BAD_REQUEST, "No active collaborative session");
    }

    const proposal: CollabProposedChange = {
      id: "proposal-" + Math.random().toString(36).slice(2, 10),
      workspaceId,
      filePath: relativePath,
      authorId: author.id,
      authorName: author.name,
      originalText,
      proposedText,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    session.proposals.push(proposal);
    return proposal;
  }

  public applyProposal(
    workspaceId: string,
    relativePath: string,
    proposalId: string,
    userRole: CollabRole
  ): { applied: boolean; content: string } {
    if (userRole === "viewer") {
      throw new AppError(ErrorCode.FORBIDDEN, "Viewers cannot apply proposals");
    }

    const session = this.getSession(workspaceId, relativePath);
    if (!session) {
      throw new AppError(ErrorCode.BAD_REQUEST, "No active collaborative session");
    }

    const proposal = session.proposals.find((p) => p.id === proposalId);
    if (!proposal || proposal.status !== "pending") {
      throw new AppError(ErrorCode.NOT_FOUND, "Pending proposal not found");
    }

    const currentText = session.text.toString();
    const index = currentText.indexOf(proposal.originalText);
    if (index !== -1) {
      session.doc.transact(() => {
        session.text.delete(index, proposal.originalText.length);
        session.text.insert(index, proposal.proposedText);
      });
      proposal.status = "applied";
      session.isDirty = true;
      this.scheduleBatchWrite(session);
      return { applied: true, content: session.text.toString() };
    }

    throw new AppError(ErrorCode.BAD_REQUEST, "Original text no longer matches document content");
  }

  public getActiveSessions(): { workspaceId: string; filePath: string; participantCount: number }[] {
    const list: { workspaceId: string; filePath: string; participantCount: number }[] = [];
    for (const session of this.sessions.values()) {
      list.push({
        workspaceId: session.workspaceId,
        filePath: session.relativePath,
        participantCount: session.participants.size,
      });
    }
    return list;
  }
}
