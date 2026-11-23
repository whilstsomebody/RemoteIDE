import { WorkspaceEventRecord } from "./outbox.service.js";
import {
  CatchupSummary,
  NetChangeSummary,
  ActivityHistoryItem,
  FileCreatedChange,
  FileModifiedChange,
  FileRenamedChange,
  FileDeletedChange,
  GitChangelogItem,
  JobChangelogItem,
  ProcessChangelogItem,
  SessionChangelogItem,
  WorkspaceEventType,
  DurableWorkspaceEvent,
} from "@remote-ide/shared";

export type CompactableEvent = WorkspaceEventRecord | DurableWorkspaceEvent;

interface FileLifecycleState {
  originalPath: string;
  currentPath: string;
  isCreatedInWindow: boolean;
  isDeletedInWindow: boolean;
  modificationCount: number;
  firstRevision: number;
  lastRevision: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

export class EventCompactor {
  /**
   * Compacts raw workspace events into net changes and chronological activity history.
   */
  public static compact(
    params:
      | CompactableEvent[]
      | {
          deliveryId: string;
          workspaceId: string;
          workspaceName?: string;
          deviceId: string;
          fromRevision: number;
          toRevision: number;
          events: CompactableEvent[];
          allowedPrefixes?: string[]; // Allowed directory paths for security scoping
          historyExpired?: boolean;
        }
  ): CatchupSummary {
    const isArray = Array.isArray(params);
    const rawEvents = isArray ? params : params.events;
    const deliveryId = isArray ? "del_test" : params.deliveryId;
    const workspaceId = isArray ? rawEvents[0]?.workspaceId || "ws_test" : params.workspaceId;
    const workspaceName = isArray ? undefined : params.workspaceName;
    const deviceId = isArray ? "dev_test" : params.deviceId;
    const fromRevision = isArray
      ? rawEvents.length > 0
        ? Math.max(0, rawEvents[0]!.revision - 1)
        : 0
      : params.fromRevision;
    const toRevision = isArray
      ? rawEvents.length > 0
        ? rawEvents[rawEvents.length - 1]!.revision
        : 0
      : params.toRevision;
    const allowedPrefixes = isArray ? undefined : params.allowedPrefixes;
    const historyExpired = isArray ? false : (params.historyExpired ?? false);

    const seenEventIds = new Set<string>();
    const uniqueEvents: CompactableEvent[] = [];

    for (const ev of rawEvents) {
      if (!ev.id || seenEventIds.has(ev.id)) continue;
      seenEventIds.add(ev.id);
      uniqueEvents.push(ev);
    }

    uniqueEvents.sort((a, b) => a.revision - b.revision);

    const activityHistory: ActivityHistoryItem[] = [];

    // Map currentPath -> FileLifecycleState
    const fileStates = new Map<string, FileLifecycleState>();
    // Map initialPath -> currentPath for rename chain tracking
    const renameChains = new Map<string, string>();

    const gitChangesMap = new Map<string, GitChangelogItem>(); // key -> git item
    let latestBranch: string | undefined;

    // Jobs map (jobId -> final status item)
    const jobStates = new Map<string, JobChangelogItem>();

    // Process map (processId -> final status item)
    const processStates = new Map<string, ProcessChangelogItem>();

    const sessionEvents: SessionChangelogItem[] = [];

    let earliestTime: string | null = null;
    let latestTime: string | null = null;

    for (const ev of uniqueEvents) {
      const ts =
        ("createdAt" in ev && ev.createdAt) ||
        ("timestamp" in ev && ev.timestamp) ||
        new Date().toISOString();
      if (!earliestTime || ts < earliestTime) earliestTime = ts;
      if (!latestTime || ts > latestTime) latestTime = ts;

      const p = (ev.payload || {}) as Record<string, any>;
      const rawPath: string = p.relativePath || p.path || p.targetPath || p.toPath || "";
      const normalizedPath = rawPath ? rawPath.replace(/\\/g, "/").replace(/^\/+/, "") : "";

      // Security check: reject unauthorized paths or path traversal attempts
      if (normalizedPath) {
        if (
          normalizedPath.includes("../") ||
          normalizedPath.startsWith("../") ||
          normalizedPath.includes("/../")
        ) {
          continue; // Path traversal attempt; ignore
        }
        if (
          allowedPrefixes &&
          allowedPrefixes.length > 0 &&
          !allowedPrefixes.some((prefix) => normalizedPath.startsWith(prefix))
        ) {
          continue; // Path outside allowed workspace prefix
        }
      }

      const eventType = (ev.eventType || (ev as any).type || "").toString();
      if (!eventType) continue;

      let description = "";
      if (
        eventType === WorkspaceEventType.FILE_CREATED ||
        eventType === "workspace.file.created" ||
        eventType === "fs.create"
      ) {
        description = `Created file ${normalizedPath}`;
      } else if (
        eventType === WorkspaceEventType.FILE_UPDATED ||
        eventType === "workspace.file.updated" ||
        eventType === "fs.update" ||
        eventType === "remoteide.fs.file_changed"
      ) {
        description = `Modified file ${normalizedPath}`;
      } else if (
        eventType === WorkspaceEventType.FILE_DELETED ||
        eventType === "workspace.file.deleted" ||
        eventType === "fs.delete"
      ) {
        description = `Deleted file ${normalizedPath}`;
      } else if (
        eventType === "workspace.file.renamed" ||
        eventType === "workspace.file.moved" ||
        eventType === "fs.rename"
      ) {
        const from = (p.fromPath || p.oldPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
        description = `Renamed ${from} to ${normalizedPath}`;
      } else if (eventType.startsWith("git.")) {
        description = p.message ? `Git: ${p.message}` : `Git update on ${p.branch || "branch"}`;
      } else if (eventType.startsWith("job.")) {
        description = `Job "${p.jobName || p.jobId || "task"}": ${p.status || "updated"}`;
      } else if (eventType.startsWith("process.")) {
        description = `Process "${p.processName || p.processId || "service"}": ${p.status || "state changed"}`;
      } else if (eventType.startsWith("session.")) {
        description = p.description || `Session ${eventType.split(".").pop()}`;
      } else {
        description = `Workspace activity: ${eventType}`;
      }

      activityHistory.push({
        eventId: ev.id,
        revision: ev.revision,
        eventType,
        timestamp: ts,
        actorId: ev.actorId || "system",
        description,
        path: normalizedPath || undefined,
        details: {
          ...p,
          // Sanitize sensitive outputs
          stdout: undefined,
          stderr: undefined,
          rawEnv: undefined,
        },
      });

      // Filesystem Events
      if (
        eventType === WorkspaceEventType.FILE_CREATED ||
        eventType === "workspace.file.created" ||
        eventType === "fs.create"
      ) {
        if (normalizedPath) {
          const existing = fileStates.get(normalizedPath);
          if (existing && existing.isDeletedInWindow) {
            // Re-creation of a previously deleted file
            existing.isDeletedInWindow = false;
            existing.lastRevision = ev.revision;
            existing.lastTimestamp = ts;
            existing.modificationCount++;
          } else {
            fileStates.set(normalizedPath, {
              originalPath: normalizedPath,
              currentPath: normalizedPath,
              isCreatedInWindow: true,
              isDeletedInWindow: false,
              modificationCount: 0,
              firstRevision: ev.revision,
              lastRevision: ev.revision,
              firstTimestamp: ts,
              lastTimestamp: ts,
            });
          }
        }
      } else if (
        eventType === WorkspaceEventType.FILE_UPDATED ||
        eventType === "workspace.file.updated" ||
        eventType === "fs.update" ||
        eventType === "remoteide.fs.file_changed"
      ) {
        if (normalizedPath) {
          const state = fileStates.get(normalizedPath);
          if (state) {
            state.modificationCount++;
            state.lastRevision = ev.revision;
            state.lastTimestamp = ts;
          } else {
            fileStates.set(normalizedPath, {
              originalPath: normalizedPath,
              currentPath: normalizedPath,
              isCreatedInWindow: false,
              isDeletedInWindow: false,
              modificationCount: 1,
              firstRevision: ev.revision,
              lastRevision: ev.revision,
              firstTimestamp: ts,
              lastTimestamp: ts,
            });
          }
        }
      } else if (
        eventType === WorkspaceEventType.FILE_RENAMED ||
        eventType === "workspace.file.renamed" ||
        eventType === "workspace.file.moved" ||
        eventType === "fs.rename"
      ) {
        const fromPath = (p.fromPath || p.oldPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
        const toPath = (normalizedPath || p.toPath || "").replace(/\\/g, "/").replace(/^\/+/, "");

        if (fromPath && toPath) {
          let existingState: FileLifecycleState | undefined = fileStates.get(fromPath);
          if (!existingState) {
            for (const s of fileStates.values()) {
              if (s.currentPath === fromPath) {
                existingState = s;
                break;
              }
            }
          }

          if (existingState) {
            fileStates.delete(existingState.currentPath);
            existingState.currentPath = toPath;
            existingState.lastRevision = ev.revision;
            existingState.lastTimestamp = ts;
            fileStates.set(toPath, existingState);
          } else {
            fileStates.set(toPath, {
              originalPath: fromPath,
              currentPath: toPath,
              isCreatedInWindow: false,
              isDeletedInWindow: false,
              modificationCount: 0,
              firstRevision: ev.revision,
              lastRevision: ev.revision,
              firstTimestamp: ts,
              lastTimestamp: ts,
            });
          }
          const origin = [...renameChains.entries()].find(([, curr]) => curr === fromPath)?.[0];
          renameChains.set(origin || fromPath, toPath);
        }
      } else if (
        eventType === WorkspaceEventType.FILE_DELETED ||
        eventType === "workspace.file.deleted" ||
        eventType === "fs.delete"
      ) {
        if (normalizedPath) {
          const state = fileStates.get(normalizedPath);
          if (state) {
            state.isDeletedInWindow = true;
            state.lastRevision = ev.revision;
            state.lastTimestamp = ts;
          } else {
            fileStates.set(normalizedPath, {
              originalPath: normalizedPath,
              currentPath: normalizedPath,
              isCreatedInWindow: false,
              isDeletedInWindow: true,
              modificationCount: 0,
              firstRevision: ev.revision,
              lastRevision: ev.revision,
              firstTimestamp: ts,
              lastTimestamp: ts,
            });
          }
        }
      }

      // Git Events
      else if (eventType.startsWith("git.")) {
        if (p.branch) latestBranch = p.branch;
        const commitHash = p.commitHash || p.hash;
        if (commitHash) {
          gitChangesMap.set(commitHash, {
            commitHash,
            branch: p.branch || latestBranch,
            message: p.message || p.summary || "Git commit",
            author: p.author || ev.actorId,
            revision: ev.revision,
            timestamp: ts,
          });
        } else if (p.branch && !gitChangesMap.has(`branch_${p.branch}`)) {
          gitChangesMap.set(`branch_${p.branch}`, {
            branch: p.branch,
            message: `Switched or updated branch to ${p.branch}`,
            revision: ev.revision,
            timestamp: ts,
          });
        }
      }

      // Background Job Events
      else if (eventType.startsWith("job.")) {
        const jobId = p.jobId || ev.id;
        const jobName = p.jobName || p.name || `Job ${jobId.slice(0, 8)}`;
        let status: "running" | "completed" | "failed" | "stopped" = "running";
        if (eventType === "job.completed" || p.status === "completed") status = "completed";
        else if (eventType === "job.failed" || p.status === "failed") status = "failed";
        else if (eventType === "job.stopped" || p.status === "stopped") status = "stopped";

        const sanitizeCommand = (cmd?: string) => {
          if (!cmd) return undefined;
          return cmd
            .replace(/(--(?:token|key|password|secret|auth)\s+)[^\s]+/gi, "[REDACTED]")
            .replace(/(Bearer\s+)[^\s]+/gi, "[REDACTED]");
        };

        jobStates.set(jobId, {
          jobId,
          jobName,
          command: sanitizeCommand(p.command),
          finalStatus: status,
          exitCode: p.exitCode,
          revision: ev.revision,
          timestamp: ts,
        });
      }

      // Process Events
      else if (eventType.startsWith("process.")) {
        const processId = p.processId || ev.id;
        const processName = p.name || p.processName || `Process ${processId.slice(0, 8)}`;
        let status: "running" | "stopped" | "crashed" | "restarted" = "running";
        if (eventType === "process.crashed" || p.status === "crashed") status = "crashed";
        else if (eventType === "process.stopped" || p.status === "stopped") status = "stopped";
        else if (eventType === "process.restarted" || p.status === "restarted")
          status = "restarted";

        processStates.set(processId, {
          processId,
          processName,
          finalStatus: status,
          exitCode: p.exitCode,
          revision: ev.revision,
          timestamp: ts,
        });
      }

      // Session Events
      else if (eventType.startsWith("session.")) {
        sessionEvents.push({
          type: eventType,
          description,
          actorId: ev.actorId || "user",
          revision: ev.revision,
          timestamp: ts,
        });
      }
    }

    const filesCreated: FileCreatedChange[] = [];
    const filesModified: FileModifiedChange[] = [];
    const filesRenamed: FileRenamedChange[] = [];
    const filesDeleted: FileDeletedChange[] = [];

    const affectedFilesSet = new Set<string>();

    for (const [, state] of fileStates) {
      // Case A: Created and deleted within same window -> transient file (net change = 0)
      if (state.isCreatedInWindow && state.isDeletedInWindow) {
        continue;
      }

      // Case B: Created in window and still alive
      if (state.isCreatedInWindow && !state.isDeletedInWindow) {
        filesCreated.push({
          path: state.currentPath,
          revision: state.firstRevision,
          timestamp: state.firstTimestamp,
        });
        affectedFilesSet.add(state.currentPath);
        continue;
      }

      // Case C: Deleted in window (was created prior to window)
      if (!state.isCreatedInWindow && state.isDeletedInWindow) {
        filesDeleted.push({
          path: state.originalPath,
          revision: state.lastRevision,
          timestamp: state.lastTimestamp,
        });
        affectedFilesSet.add(state.originalPath);
        continue;
      }

      // Case D: Renamed in window
      if (state.originalPath !== state.currentPath) {
        filesRenamed.push({
          fromPath: state.originalPath,
          toPath: state.currentPath,
          revision: state.lastRevision,
          timestamp: state.lastTimestamp,
        });
        affectedFilesSet.add(state.originalPath);
        affectedFilesSet.add(state.currentPath);
      }

      // Case E: Modified in window
      if (state.modificationCount > 0) {
        filesModified.push({
          path: state.currentPath,
          count: state.modificationCount,
          firstRevision: state.firstRevision,
          lastRevision: state.lastRevision,
          firstTimestamp: state.firstTimestamp,
          lastTimestamp: state.lastTimestamp,
        });
        affectedFilesSet.add(state.currentPath);
      }
    }

    filesCreated.sort((a, b) => a.path.localeCompare(b.path));
    filesModified.sort((a, b) => a.path.localeCompare(b.path));
    filesRenamed.sort((a, b) => a.toPath.localeCompare(b.toPath));
    filesDeleted.sort((a, b) => a.path.localeCompare(b.path));

    const netChanges: NetChangeSummary = {
      filesCreated,
      filesModified,
      filesRenamed,
      filesDeleted,
      gitChanges: Array.from(gitChangesMap.values()),
      jobs: Array.from(jobStates.values()),
      processes: Array.from(processStates.values()),
      sessionEvents,
    };

    const now = new Date().toISOString();

    return {
      deliveryId,
      workspaceId,
      workspaceName: workspaceName || workspaceId,
      deviceId,
      fromRevision,
      toRevision,
      timeWindow: {
        from: earliestTime || now,
        to: latestTime || now,
      },
      totalEvents: uniqueEvents.length,
      totalFilesAffected: affectedFilesSet.size,
      historyExpired,
      netChanges,
      activityHistory,
    };
  }
}
