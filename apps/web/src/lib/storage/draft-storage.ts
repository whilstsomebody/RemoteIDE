export interface LocalDraft {
  workspaceId: string;
  path: string;
  content: string;
  originalETag: string;
  timestamp: number;
}

const DRAFT_PREFIX = "remoteide:draft:";

function isStorageAvailable(): boolean {
  return typeof globalThis.localStorage !== "undefined";
}

export class DraftStorage {
  private static getKey(workspaceId: string, path: string): string {
    return `${DRAFT_PREFIX}${workspaceId}:${path}`;
  }

  static saveDraft(workspaceId: string, path: string, content: string, originalETag: string): void {
    if (!isStorageAvailable() || !workspaceId || !path) return;
    try {
      const draft: LocalDraft = {
        workspaceId,
        path,
        content,
        originalETag,
        timestamp: Date.now(),
      };
      globalThis.localStorage.setItem(this.getKey(workspaceId, path), JSON.stringify(draft));
    } catch {
      // Ignore quota errors
    }
  }

  static getDraft(workspaceId: string, path: string): LocalDraft | null {
    if (!isStorageAvailable() || !workspaceId || !path) return null;
    try {
      const stored = globalThis.localStorage.getItem(this.getKey(workspaceId, path));
      if (!stored) return null;
      return JSON.parse(stored) as LocalDraft;
    } catch {
      return null;
    }
  }

  static removeDraft(workspaceId: string, path: string): void {
    if (!isStorageAvailable() || !workspaceId || !path) return;
    try {
      globalThis.localStorage.removeItem(this.getKey(workspaceId, path));
    } catch {
      // Ignore
    }
  }

  static clearWorkspaceDrafts(workspaceId: string): void {
    if (!isStorageAvailable() || !workspaceId) return;
    try {
      const prefix = `${DRAFT_PREFIX}${workspaceId}:`;
      const keysToRemove: string[] = [];
      const storage = globalThis.localStorage;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) {
        storage.removeItem(k);
      }
    } catch {
      // Ignore
    }
  }
}
