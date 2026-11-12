import fs from "node:fs";
import path from "node:path";
import { LocalJournalService } from "./local-journal.service.js";
import { Workspace } from "@remote-ide/shared";

export type WatcherCallback = (event: {
  workspaceId: string;
  eventType: "create" | "update" | "delete";
  relativePath: string;
  timestamp: string;
}) => void;

export class WatcherService {
  private journalService: LocalJournalService;
  private watchers: Map<string, fs.FSWatcher[]> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Set<WatcherCallback> = new Set();
  private ignoredPatterns: Set<string>;

  constructor(journalService: LocalJournalService) {
    this.journalService = journalService;
    this.ignoredPatterns = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db", ".turbo"]);
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

      try {
        const watcher = fs.watch(folder.path, { recursive: true }, (_event, filename) => {
          if (!filename) return;

          // Check if any path segment is ignored
          const segments = filename.split(path.sep);
          if (segments.some((seg) => this.ignoredPatterns.has(seg))) {
            return;
          }

          const relativePath = path.normalize(filename);
          const debounceKey = `${workspace.id}:${relativePath}`;

          const existingTimer = this.debounceTimers.get(debounceKey);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            this.debounceTimers.delete(debounceKey);
            this.handleFileChange(workspace.id, folder.path, relativePath);
          }, 150);

          this.debounceTimers.set(debounceKey, timer);
        });

        workspaceWatchers.push(watcher);
      } catch (err) {
        // Fallback or non-critical watch error
      }
    }

    this.watchers.set(workspace.id, workspaceWatchers);
  }

  public unwatchWorkspace(workspaceId: string): void {
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

  private handleFileChange(workspaceId: string, folderRoot: string, relativePath: string): void {
    const fullPath = path.join(folderRoot, relativePath);
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

    // Record in SQLite journal
    this.journalService.recordChange(workspaceId, relativePath, eventType, fileVersion, {
      source: "external_watcher",
    });

    // Notify listeners
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
