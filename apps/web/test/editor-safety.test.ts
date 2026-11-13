import { describe, it, expect, beforeEach } from "vitest";
import { DraftStorage } from "../src/lib/storage/draft-storage";
import {
  SettingsStorage,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_UI_LAYOUT,
} from "../src/lib/storage/settings-storage";

describe("Editor Safety & UI Persistence", () => {
  // In-memory mock localStorage
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const mockLocalStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };

    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  describe("DraftStorage", () => {
    it("saves and retrieves unsaved drafts per workspace and path", () => {
      const wsId = "ws-123";
      const path = "src/index.ts";
      const content = "const draft = true;";
      const originalETag = "etag-1";

      DraftStorage.saveDraft(wsId, path, content, originalETag);

      const retrieved = DraftStorage.getDraft(wsId, path);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.workspaceId).toBe(wsId);
      expect(retrieved?.path).toBe(path);
      expect(retrieved?.content).toBe(content);
      expect(retrieved?.originalETag).toBe(originalETag);
      expect(retrieved?.timestamp).toBeGreaterThan(0);
    });

    it("removes draft after file is saved", () => {
      const wsId = "ws-123";
      const path = "src/index.ts";

      DraftStorage.saveDraft(wsId, path, "content", "etag-1");
      expect(DraftStorage.getDraft(wsId, path)).not.toBeNull();

      DraftStorage.removeDraft(wsId, path);
      expect(DraftStorage.getDraft(wsId, path)).toBeNull();
    });

    it("clears all drafts for a specific workspace", () => {
      DraftStorage.saveDraft("ws-1", "fileA.ts", "a", "etag-a");
      DraftStorage.saveDraft("ws-1", "fileB.ts", "b", "etag-b");
      DraftStorage.saveDraft("ws-2", "fileC.ts", "c", "etag-c");

      DraftStorage.clearWorkspaceDrafts("ws-1");

      expect(DraftStorage.getDraft("ws-1", "fileA.ts")).toBeNull();
      expect(DraftStorage.getDraft("ws-1", "fileB.ts")).toBeNull();
      expect(DraftStorage.getDraft("ws-2", "fileC.ts")).not.toBeNull();
    });
  });

  describe("SettingsStorage", () => {
    it("returns default editor settings when storage is empty", () => {
      const settings = SettingsStorage.getEditorSettings();
      expect(settings).toEqual(DEFAULT_EDITOR_SETTINGS);
      expect(settings.theme).toBe("remoteide-dark");
      expect(settings.fontSize).toBe(14);
      expect(settings.tabSize).toBe(2);
      expect(settings.wordWrap).toBe(true);
      expect(settings.autosave).toBe("delay");
    });

    it("saves and updates editor settings", () => {
      SettingsStorage.saveEditorSettings({
        fontSize: 16,
        tabSize: 4,
        theme: "one-dark",
        autosave: "focus",
      });

      const updated = SettingsStorage.getEditorSettings();
      expect(updated.fontSize).toBe(16);
      expect(updated.tabSize).toBe(4);
      expect(updated.theme).toBe("one-dark");
      expect(updated.autosave).toBe("focus");
      // Other defaults preserved
      expect(updated.wordWrap).toBe(true);
    });

    it("saves and restores UI layout settings", () => {
      const layout = SettingsStorage.getUiLayout();
      expect(layout).toEqual(DEFAULT_UI_LAYOUT);

      SettingsStorage.saveUiLayout({
        sidebarWidth: 320,
        isSplit: true,
        bottomPanelOpen: true,
      });

      const updatedLayout = SettingsStorage.getUiLayout();
      expect(updatedLayout.sidebarWidth).toBe(320);
      expect(updatedLayout.isSplit).toBe(true);
      expect(updatedLayout.bottomPanelOpen).toBe(true);
    });

    it("saves and restores workspace sessions (open tabs, active tab)", () => {
      const wsId = "ws-test";
      const session = SettingsStorage.getWorkspaceSession(wsId);
      expect(session.primaryTabs).toEqual([]);

      SettingsStorage.saveWorkspaceSession(wsId, {
        primaryTabs: ["src/app.ts", "package.json"],
        primaryActiveTab: "src/app.ts",
        secondaryTabs: ["README.md"],
        secondaryActiveTab: "README.md",
      });

      const restored = SettingsStorage.getWorkspaceSession(wsId);
      expect(restored.primaryTabs).toEqual(["src/app.ts", "package.json"]);
      expect(restored.primaryActiveTab).toBe("src/app.ts");
      expect(restored.secondaryTabs).toEqual(["README.md"]);
      expect(restored.secondaryActiveTab).toBe("README.md");
    });
  });
});

import { applySaveResult } from "../src/lib/editor/save-result";
import type { FileBuffer } from "../src/components/editor/editor-pane";

it("retains edits typed while a save is in flight", () => {
  const submitted: FileBuffer = { path: "a.ts", content: "sent", savedContent: "old", isDirty: true, eTag: "old-tag", mtime: 0, isBinary: false, encoding: "utf-8", size: 4 };
  const current = { ...submitted, content: "newer typing" };
  const result = applySaveResult(current, submitted, "new-tag", 1);
  expect(result.content).toBe("newer typing");
  expect(result.savedContent).toBe("sent");
  expect(result.isDirty).toBe(true);
  expect(result.eTag).toBe("new-tag");
  expect(applySaveResult(submitted, submitted, "new-tag", 1).isDirty).toBe(false);
});
