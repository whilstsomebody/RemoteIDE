import * as Y from "yjs";
import {
  CollabParticipant,
  CollabRole,
  CollabConflictStatus,
  CollabComment,
  CollabProposedChange,
  WsMessageType,
  createWsMessage,
} from "@remote-ide/shared";
import { localCollabOrigin } from "./yjs-collab-extension";

export interface CollabClientConfig {
  workspaceId: string;
  filePath: string;
  currentUserId: string;
  currentUserName: string;
  role: CollabRole;
  ws?: WebSocket | null;
  onParticipantsChange?: (participants: CollabParticipant[]) => void;
  onConflictChange?: (conflict: CollabConflictStatus | null) => void;
  onCommentsChange?: (comments: CollabComment[]) => void;
  onProposalsChange?: (proposals: CollabProposedChange[]) => void;
  onFollowCursor?: (targetUserId: string, line: number, col: number) => void;
}

export class CollabClient {
  public doc: Y.Doc;
  public yText: Y.Text;
  public participants: CollabParticipant[] = [];
  public currentRole: CollabRole;
  public conflictStatus: CollabConflictStatus | null = null;
  public followingParticipantId: string | null = null;
  public comments: CollabComment[] = [];
  public proposals: CollabProposedChange[] = [];

  private config: CollabClientConfig;
  private ws: WebSocket | null = null;
  private cursorDebounceTimer?: NodeJS.Timeout;

  constructor(config: CollabClientConfig) {
    this.config = config;
    this.currentRole = config.role;
    this.doc = new Y.Doc();
    this.yText = this.doc.getText("contents");

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === localCollabOrigin && this.currentRole !== "viewer") {
        this.sendUpdate(update);
      }
    });

    if (config.ws) {
      this.attachWebSocket(config.ws);
    }
  }

  public attachWebSocket(ws: WebSocket): void {
    this.ws = ws;

    const stateVector = Y.encodeStateVector(this.doc);
    const stateVectorBase64 = Buffer.from(stateVector).toString("base64");

    this.sendWs(WsMessageType.COLLAB_JOIN, {
      workspaceId: this.config.workspaceId,
      filePath: this.config.filePath,
      clientStateVector: stateVectorBase64,
    });
  }

  public handleWsMessage(type: WsMessageType | string, payload: any): void {
    if (!payload) return;

    if (payload.filePath && payload.filePath !== this.config.filePath) {
      return; // Message is for another file
    }

    switch (type) {
      case WsMessageType.COLLAB_JOINED: {
        if (payload.syncUpdateBase64) {
          const updateBytes = Buffer.from(payload.syncUpdateBase64, "base64");
          Y.applyUpdate(this.doc, updateBytes, "remote-initial-sync");
        }
        if (payload.participants) {
          this.participants = payload.participants;
          this.config.onParticipantsChange?.(this.participants);
        }
        if (payload.conflictStatus) {
          this.conflictStatus = payload.conflictStatus;
          this.config.onConflictChange?.(this.conflictStatus);
        }
        break;
      }

      case WsMessageType.COLLAB_UPDATE: {
        if (payload.update && payload.userId !== this.config.currentUserId) {
          const updateBytes = Buffer.from(payload.update, "base64");
          Y.applyUpdate(this.doc, updateBytes, "remote-peer");
        }
        break;
      }

      case WsMessageType.COLLAB_AWARENESS: {
        if (payload.participants) {
          this.participants = payload.participants;
          this.config.onParticipantsChange?.(this.participants);
        } else if (payload.userId && payload.cursor) {
          const p = this.participants.find((x) => x.id === payload.userId);
          if (p) {
            p.cursor = payload.cursor;
            this.config.onParticipantsChange?.([...this.participants]);
          }

          if (this.followingParticipantId === payload.userId) {
            this.config.onFollowCursor?.(payload.userId, payload.cursor.line, payload.cursor.col);
          }
        }
        break;
      }

      case WsMessageType.COLLAB_ROLE_ASSIGNED: {
        if (payload.userId === this.config.currentUserId) {
          this.currentRole = payload.role;
        }
        const p = this.participants.find((x) => x.id === payload.userId);
        if (p) {
          p.role = payload.role;
          this.config.onParticipantsChange?.([...this.participants]);
        }
        break;
      }

      case WsMessageType.COLLAB_KICK: {
        this.participants = [];
        this.config.onParticipantsChange?.([]);
        break;
      }

      case WsMessageType.COLLAB_EXTERNAL_CHANGE: {
        this.conflictStatus = payload.conflictStatus;
        this.config.onConflictChange?.(this.conflictStatus);
        break;
      }

      case WsMessageType.COLLAB_CONFLICT_RESOLVED: {
        this.conflictStatus = null;
        this.config.onConflictChange?.(null);
        break;
      }
    }
  }

  public updateCursor(line: number, col: number, selectionLength?: number): void {
    if (this.cursorDebounceTimer) {
      clearTimeout(this.cursorDebounceTimer);
    }

    this.cursorDebounceTimer = setTimeout(() => {
      this.sendWs(WsMessageType.COLLAB_AWARENESS, {
        workspaceId: this.config.workspaceId,
        filePath: this.config.filePath,
        cursor: { line, col, selectionLength },
        followingParticipantId: this.followingParticipantId || undefined,
      });
    }, 50);
  }

  public followParticipant(targetUserId: string | null): void {
    this.followingParticipantId = targetUserId;
    this.sendWs(WsMessageType.COLLAB_AWARENESS, {
      workspaceId: this.config.workspaceId,
      filePath: this.config.filePath,
      followingParticipantId: targetUserId || undefined,
    });
  }

  public assignRole(targetUserId: string, newRole: CollabRole): void {
    this.sendWs(WsMessageType.COLLAB_ROLE_ASSIGNED, {
      workspaceId: this.config.workspaceId,
      filePath: this.config.filePath,
      targetUserId,
      newRole,
    });
  }

  public kickParticipant(targetUserId: string): void {
    this.sendWs(WsMessageType.COLLAB_KICK, {
      workspaceId: this.config.workspaceId,
      filePath: this.config.filePath,
      targetUserId,
    });
  }

  private sendUpdate(updateBytes: Uint8Array): void {
    const updateBase64 = Buffer.from(updateBytes).toString("base64");
    this.sendWs(WsMessageType.COLLAB_UPDATE, {
      workspaceId: this.config.workspaceId,
      filePath: this.config.filePath,
      update: updateBase64,
    });
  }

  private sendWs(type: WsMessageType, payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const msg = createWsMessage(type, payload);
        this.ws.send(JSON.stringify(msg));
      } catch {
        // Handle socket send error
      }
    }
  }

  public destroy(): void {
    if (this.cursorDebounceTimer) {
      clearTimeout(this.cursorDebounceTimer);
    }
    this.sendWs(WsMessageType.COLLAB_LEAVE, {
      workspaceId: this.config.workspaceId,
      filePath: this.config.filePath,
    });
    this.doc.destroy();
  }
}

