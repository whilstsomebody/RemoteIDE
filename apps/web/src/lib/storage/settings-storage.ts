export interface EditorSettings {
  theme: "remoteide-dark" | "one-dark" | "high-contrast";
  fontSize: number; // 12, 14, 16, 18, 20
  tabSize: number; // 2, 4
  insertSpaces: boolean;
  wordWrap: boolean;
  autosave: "off" | "delay" | "focus";
  autosaveDelayMs: number;
}

export interface UiLayoutSettings {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  isSplit: boolean;
  splitRatio: number; // 0.1 to 0.9 (default 0.5)
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
  bottomPanelTab: "terminal" | "tasks" | "output" | "problems";
}

export interface WorkspaceSessionState {
  recentFiles: string[];
  primaryTabs: string[];
  primaryActiveTab: string | null;
  secondaryTabs: string[];
  secondaryActiveTab: string | null;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: "remoteide-dark",
  fontSize: 14,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: true,
  autosave: "delay",
  autosaveDelayMs: 2000,
};

export const DEFAULT_UI_LAYOUT: UiLayoutSettings = {
  sidebarWidth: 280,
  sidebarCollapsed: false,
  isSplit: false,
  splitRatio: 0.5,
  bottomPanelOpen: false,
  bottomPanelHeight: 220,
  bottomPanelTab: "terminal",
};

const SETTINGS_KEY = "remoteide:settings:editor";
const LAYOUT_KEY = "remoteide:settings:layout";
const SESSION_PREFIX = "remoteide:session:";

function isStorageAvailable(): boolean {
  return typeof globalThis.localStorage !== "undefined";
}

export class SettingsStorage {
  static getEditorSettings(): EditorSettings {
    if (!isStorageAvailable()) return DEFAULT_EDITOR_SETTINGS;
    try {
      const stored = globalThis.localStorage.getItem(SETTINGS_KEY);
      if (!stored) return DEFAULT_EDITOR_SETTINGS;
      return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_EDITOR_SETTINGS;
    }
  }

  static saveEditorSettings(settings: Partial<EditorSettings>): EditorSettings {
    if (!isStorageAvailable()) return DEFAULT_EDITOR_SETTINGS;
    const current = this.getEditorSettings();
    const updated = { ...current, ...settings };
    try {
      globalThis.localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {
      // Storage unavailable or quota exceeded
    }
    return updated;
  }

  static getUiLayout(): UiLayoutSettings {
    if (!isStorageAvailable()) return DEFAULT_UI_LAYOUT;
    try {
      const stored = globalThis.localStorage.getItem(LAYOUT_KEY);
      if (!stored) return DEFAULT_UI_LAYOUT;
      return { ...DEFAULT_UI_LAYOUT, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_UI_LAYOUT;
    }
  }

  static saveUiLayout(layout: Partial<UiLayoutSettings>): UiLayoutSettings {
    if (!isStorageAvailable()) return DEFAULT_UI_LAYOUT;
    const current = this.getUiLayout();
    const updated = { ...current, ...layout };
    try {
      globalThis.localStorage.setItem(LAYOUT_KEY, JSON.stringify(updated));
    } catch {
      // Storage unavailable
    }
    return updated;
  }

  static getWorkspaceSession(workspaceId: string): WorkspaceSessionState {
    const defaultSession: WorkspaceSessionState = {
      recentFiles: [],
      primaryTabs: [],
      primaryActiveTab: null,
      secondaryTabs: [],
      secondaryActiveTab: null,
    };
    if (!isStorageAvailable() || !workspaceId) return defaultSession;
    try {
      const stored = globalThis.localStorage.getItem(`${SESSION_PREFIX}${workspaceId}`);
      if (!stored) return defaultSession;
      return { ...defaultSession, ...JSON.parse(stored) };
    } catch {
      return defaultSession;
    }
  }

  static saveWorkspaceSession(
    workspaceId: string,
    session: Partial<WorkspaceSessionState>
  ): WorkspaceSessionState {
    const current = this.getWorkspaceSession(workspaceId);
    const updated = { ...current, ...session };
    if (isStorageAvailable() && workspaceId) {
      try {
        globalThis.localStorage.setItem(`${SESSION_PREFIX}${workspaceId}`, JSON.stringify(updated));
      } catch {
        // Storage unavailable
      }
    }
    return updated;
  }
}
