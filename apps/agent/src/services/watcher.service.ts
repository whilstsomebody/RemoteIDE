import fs from "node:fs";
import path from "node:path";
import { LocalJournalService } from "./local-journal.service.js";
import { Workspace } from "@remote-ide/shared";

// Matches the sibling temp files FilesystemService.writeFile creates for atomic saves.
const ATOMIC_WRITE_TEMP_FILE = /^\..+\.tmp\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WatcherCallback = (event: {
  workspaceId: string;
  eventType: "create" | "update" | "delete";
  relativePath: string;
  timestamp: string;
}) => void;

export class WatcherService {
  private journalService: LocalJournalService;
  private watchers: Map<string, fs.FSWatcher[]> = new Map();
  private pollingTimers = new Map<string, NodeJS.Timeout[]>();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Set<WatcherCallback> = new Set();
  private ignoredPatterns: Set<string>;
  private recentInternalSaves: Map<string, number> = new Map();

  constructor(journalService: LocalJournalService) {
    this.journalService = journalService;
    this.ignoredPatterns = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db", ".turbo"]);
  }

  /**
   * Mark a file operation initiated internally by RemoteIDE to prevent
   * echo loops when the local filesystem watcher observes the same change.
   */
  public markInternalSave(workspaceId: string, relativePath: string, ttlMs = 2000): void {
    const key = `${workspaceId}:${path.normalize(relativePath)}`;
    this.recentInternalSaves.set(key, Date.now() + ttlMs);
  }

  public isInternalSave(workspaceId: string, relativePath: string): boolean {
    const key = `${workspaceId}:${path.normalize(relativePath)}`;
    const expiresAt = this.recentInternalSaves.get(key);
    if (!expiresAt) return false;
    if (expiresAt < Date.now()) {
      this.recentInternalSaves.delete(key);
      return false;
    }
    this.recentInternalSaves.delete(key);
    return true;
  }

  public subscribe(callback: WatcherCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public watchWorkspace(workspace: Workspace): void {
    this.unwatchWorkspace(workspace.id);
    const workspaceWatchers: fs.FSWatcher[] = [];

    for (const folder of workspace.folders) {
      if (!fs.existsSync(folder.path)) continue;
      // Report paths the way FilesystemService names them (folder-prefixed in multi-root
      // workspaces) so internal-save suppression and journal entries line up.
      const toWorkspacePath = (relativePath: string) =>
        workspace.folders.length > 1 ? path.join(folder.name, relativePath) : relativePath;

      let snapshot = this.scanFolder(folder.path);
      let polling = false;
      const startPolling = () => {
        if (polling) return;
        polling = true;
        const timer = setInterval(() => {
          const next = this.scanFolder(folder.path);
          for (const relativePath of new Set([...snapshot.keys(), ...next.keys()])) {
            if (snapshot.get(relativePath) !== next.get(relativePath)) {
              if (ATOMIC_WRITE_TEMP_FILE.test(path.basename(relativePath))) continue;
              this.handleFileChange(workspace.id, path.join(folder.path, relativePath), toWorkspacePath(relativePath));
            }
          }
          snapshot = next;
        }, 500);
        const timers = this.pollingTimers.get(workspace.id) || [];
        timers.push(timer);
        this.pollingTimers.set(workspace.id, timers);
      };
      try {
        const watcher = fs.watch(folder.path, { recursive: true }, (_event, filename) => {
          if (!filename) return;

          const segments = filename.split(path.sep);
          if (segments.some((seg) => this.ignoredPatterns.has(seg))) {
            return;
          }
          if (ATOMIC_WRITE_TEMP_FILE.test(path.basename(filename))) return;

          const folderRelativePath = path.normalize(filename);
          const relativePath = toWorkspacePath(folderRelativePath);
          const debounceKey = `${workspace.id}:${relativePath}`;

          const existingTimer = this.debounceTimers.get(debounceKey);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            this.debounceTimers.delete(debounceKey);
            this.handleFileChange(workspace.id, path.join(folder.path, folderRelativePath), relativePath);
          }, 150);

          this.debounceTimers.set(debounceKey, timer);
        });

        watcher.on("error", () => {
          watcher.close();
          startPolling();
        });
        workspaceWatchers.push(watcher);
      } catch {
        startPolling();
      }
    }

    this.watchers.set(workspace.id, workspaceWatchers);
  }

  private scanFolder(root: string): Map<string, string> {
    const snapshot = new Map<string, string>();
    const visit = (directory: string) => {
      try {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (this.ignoredPatterns.has(entry.name) || entry.isSymbolicLink()) continue;
          const fullPath = path.join(directory, entry.name);
          const stat = fs.statSync(fullPath);
          snapshot.set(path.relative(root, fullPath), `${stat.mtimeMs}:${stat.size}`);
          if (entry.isDirectory()) visit(fullPath);
        }
      } catch { /* Directory may be removed during traversal. */ }
    };
    visit(root);
    return snapshot;
  }

  public unwatchWorkspace(workspaceId: string): void {
    for (const timer of this.pollingTimers.get(workspaceId) || []) clearInterval(timer);
    this.pollingTimers.delete(workspaceId);
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(`${workspaceId}:`)) { clearTimeout(timer); this.debounceTimers.delete(key); }
    }
    const existing = this.watchers.get(workspaceId);
    if (existing) {
      for (const w of existing) {
        try {
          w.close();
        } catch {}
      }
      this.watchers.delete(workspaceId);
    }
  }

  private handleFileChange(workspaceId: string, fullPath: string, relativePath: string): void {
    // Saves made through RemoteIDE are already journaled; skip the watcher echo.
    if (this.isInternalSave(workspaceId, relativePath)) {
      return;
    }

    const exists = fs.existsSync(fullPath);

    let eventType: "create" | "update" | "delete" = "update";
    let fileVersion: string | undefined;

    if (!exists) {
      eventType = "delete";
    } else {
      try {
        const stat = fs.statSync(fullPath);
        fileVersion = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      } catch {
        return;
      }
    }

    this.journalService.recordChange(workspaceId, relativePath, eventType, fileVersion, {
      source: "external_watcher",
    });

    const payload = {
      workspaceId,
      eventType,
      relativePath,
      timestamp: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {}
    }
  }

  public stopAll(): void {
    for (const timers of this.pollingTimers.values()) for (const timer of timers) clearInterval(timer);
    this.pollingTimers.clear();
    this.recentInternalSaves.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const watcherList of this.watchers.values()) {
      for (const w of watcherList) {
        try {
          w.close();
        } catch {}
      }
    }
    this.watchers.clear();
  }
}
