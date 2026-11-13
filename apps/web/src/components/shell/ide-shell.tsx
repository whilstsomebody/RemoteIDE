"use client";

import { gatewayFetch, GATEWAY_URL, GATEWAY_WS_URL, authenticatedWebSocketUrl } from "../../lib/api/client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "./header";
import { ActivityBar, ActivityTab } from "./activity-bar";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";
import { BottomPanel, LogEntry, ProblemEntry } from "./bottom-panel";
import { CommandPalette } from "./command-palette";
import { ConflictDialog } from "../editor/conflict-dialog";
import { EditorPane, FileBuffer } from "../editor/editor-pane";
import { WorkspaceCanvas } from "./workspace-canvas";
import { OpenFolderModal } from "../workspace/open-folder-modal";
import { CloneRepoModal } from "../workspace/clone-repo-modal";
import { AgentPanel } from "../agent/agent-panel";
import { ShareLinkModal } from "../sharing/share-link-modal";
import { SessionDashboardModal } from "../sharing/session-dashboard-modal";
import { OwnerAuthModal } from "../auth/owner-auth-modal";
import { Workspace, FileNode, UserRole } from "@remote-ide/shared";
import { getLanguageDefinition } from "../../lib/editor/language-registry";
import {
  SettingsStorage,
  EditorSettings,
  UiLayoutSettings,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_UI_LAYOUT,
} from "../../lib/storage/settings-storage";
import { applySaveResult } from "../../lib/editor/save-result";
import { DraftStorage } from "../../lib/storage/draft-storage";

const AGENT_BASE_URL = GATEWAY_URL;
const GATEWAY_HTTP_URL = GATEWAY_URL;

export const IdeShell: React.FC = () => {
  // 1. Layout & Settings state (loaded from LocalStorage)
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS);
  const [uiLayout, setUiLayout] = useState<UiLayoutSettings>(DEFAULT_UI_LAYOUT);
  const [activeTab, setActiveTab] = useState<ActivityTab | null>("files");
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "disconnected" | "error"
  >("connecting");

  // Host info
  const [hostId, setHostId] = useState<string>("local-host-agent");
  const [hostName, setHostName] = useState<string>("Local Host");
  const [platform, setPlatform] = useState<string>("macOS");

  // Workspaces & Files
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);

  // 2. Multi-Tab & Multi-Pane Buffer State
  const [buffers, setBuffers] = useState<Record<string, FileBuffer>>({});
  const [primaryTabs, setPrimaryTabs] = useState<string[]>([]);
  const [primaryActiveTab, setPrimaryActiveTab] = useState<string | null>(null);
  const [secondaryTabs, setSecondaryTabs] = useState<string[]>([]);
  const [secondaryActiveTab, setSecondaryActiveTab] = useState<string | null>(null);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  const workspaceIdRef = useRef<string | null>(null);
  const savingPaths = useRef(new Set<string>());
  const sessionToRestore = useRef<ReturnType<typeof SettingsStorage.getWorkspaceSession> | null>(null);
  const setActiveWorkspace = useCallback((workspace: Workspace | null) => {
    if (workspaceIdRef.current !== (workspace?.id ?? null)) {
      workspaceIdRef.current = workspace?.id ?? null;
      sessionToRestore.current = workspace ? SettingsStorage.getWorkspaceSession(workspace.id) : null;
      setBuffers({});
      setLoadingPaths(new Set());
      setPrimaryTabs([]);
      setPrimaryActiveTab(null);
      setSecondaryTabs([]);
      setSecondaryActiveTab(null);
    }
    setActiveWorkspaceState(workspace);
  }, []);

  // 3. Status Bar & Cursor Position
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, selLen: 0 });
  const [autosaveStatus, setAutosaveStatus] = useState<"saving" | "saved" | "idle">("idle");

  // 4. Bottom Panel & Output Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [problems, setProblems] = useState<ProblemEntry[]>([]);

  // 5. Dialogs
  const [conflictPath, setConflictPath] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // 6. Coding Agent & Modals State
  const [isAgentOpen, setIsAgentOpen] = useState<boolean>(false);
  const [agentWidth, setAgentWidth] = useState<number>(360);
  const [isOpenFolderModalOpen, setIsOpenFolderModalOpen] = useState<boolean>(false);
  const [isCloneRepoModalOpen, setIsCloneRepoModalOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isSessionDashboardOpen, setIsSessionDashboardOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("remote_ide_role");
      if (stored && Object.values(UserRole).includes(stored as UserRole)) {
        return stored as UserRole;
      }
    }
    return null;
  });
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("remote_ide_role");
      return stored === UserRole.OWNER;
    }
    return false;
  });
  const [untitledCount, setUntitledCount] = useState<number>(1);
  const [_workspaceRevision, setWorkspaceRevision] = useState<number>(0);

  // Derive granular role-based capabilities
  const canCreateShareLink =
    isOwnerAuthenticated ||
    currentUserRole === UserRole.OWNER ||
    currentUserRole === UserRole.OPERATOR;

  const canViewSessions =
    isOwnerAuthenticated ||
    currentUserRole === UserRole.OWNER ||
    currentUserRole === UserRole.OPERATOR ||
    currentUserRole === UserRole.DEVELOPER;

  const isReadOnly = currentUserRole === UserRole.VIEWER;

  // Helper: Append log entry
  const addLog = useCallback(
    (message: string, level: LogEntry["level"] = "info", source = "RemoteIDE") => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      const newLog: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: timeStr,
        level,
        message,
        source,
      };

      setLogs((prev) => [...prev.slice(-150), newLog]);
    },
    []
  );

  // Load preferences from localStorage on mount
  useEffect(() => {
    const storedSettings = SettingsStorage.getEditorSettings();
    const storedLayout = SettingsStorage.getUiLayout();
    setEditorSettings(storedSettings);
    setUiLayout(storedLayout);
  }, []);

  // Update preferences
  const updateEditorSettings = (updated: Partial<EditorSettings>) => {
    const next = SettingsStorage.saveEditorSettings(updated);
    setEditorSettings(next);
  };

  const updateUiLayout = (updated: Partial<UiLayoutSettings>) => {
    const next = SettingsStorage.saveUiLayout(updated);
    setUiLayout(next);
  };

  // Fetch verified user session profile from Gateway
  const fetchSessionProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await gatewayFetch(`${GATEWAY_HTTP_URL}/api/v1/auth/me`, {
        headers,
        credentials: "include",
      });

      if (res.ok) {
        const body = await res.json();
        if (body.success && body.data) {
          const role = body.data.role as UserRole;
          const isOwner = Boolean(body.data.isOwner);
          setCurrentUserRole(role);
          setIsOwnerAuthenticated(isOwner);
          if (role) {
            localStorage.setItem("remote_ide_role", role);
          }
        }
      } else if (res.status === 401) {
        setCurrentUserRole(null);
        setIsOwnerAuthenticated(false);
        localStorage.removeItem("remote_ide_role");
      }
    } catch {
      // Gateway offline or local dev fallback
    }
  }, []);

  useEffect(() => {
    void fetchSessionProfile();
  }, [fetchSessionProfile]);

  // Check agent health
  const checkAgentHealth = useCallback(async () => {
    try {
      const res = await gatewayFetch(`${AGENT_BASE_URL}/api/v1/health`);
      if (res.ok) {
        const body = await res.json();
        setConnectionStatus("connected");
        if (body.data?.components?.host?.details) {
          const host = body.data.components.host.details;
          setHostId(host.hostId || "local-host-agent");
          setHostName(host.hostname || "Local Host");
          setPlatform(host.platform || "macOS");
        }
      } else {
        setConnectionStatus("disconnected");
      }
    } catch {
      setConnectionStatus("disconnected");
    }
  }, []);

  // Fetch workspaces
  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await gatewayFetch(`${AGENT_BASE_URL}/api/v1/workspaces`);
      if (res.ok) {
        const body = await res.json();
        const wsList: Workspace[] = body.data || [];
        setWorkspaces(wsList);
        const active = wsList.find((w) => w.isActive) || wsList[0] || null;
        setActiveWorkspace(active);
      }
    } catch {
      // Offline
    }
  }, [setActiveWorkspace]);

  // Fetch file tree
  const fetchFiles = useCallback(async () => {
    if (!activeWorkspace) {
      setFiles([]);
      return;
    }
    try {
      const res = await gatewayFetch(
        `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files?depth=4`
      );
      if (res.ok) {
        const body = await res.json();
        setFiles(body.data || []);
      }
    } catch {
      setFiles([]);
    }
  }, [activeWorkspace]);

  // Initial load
  useEffect(() => {
    void checkAgentHealth();
    void fetchWorkspaces();
  }, [checkAgentHealth, fetchWorkspaces]);

  // When active workspace changes
  useEffect(() => {
    if (activeWorkspace) {
      void fetchFiles();
      addLog(`Connected to workspace "${activeWorkspace.name}"`, "success", "Workspace");

    }
  }, [activeWorkspace, fetchFiles, addLog]);

  // 7. Live Distributed Synchronization via Gateway WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const connectWs = () => {
      if (isDisposed) return;
      try {
        ws = new WebSocket(authenticatedWebSocketUrl(GATEWAY_WS_URL));

        ws.onopen = () => {
          setConnectionStatus("connected");
          addLog("Connected to distributed event synchronization relay", "info", "Sync");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "workspace.event" && data.payload) {
              const eventPayload = data.payload;
              if (eventPayload.revision) {
                setWorkspaceRevision(eventPayload.revision);
              }

              // Auto-refresh file tree when file changes occur
              if (
                !activeWorkspace ||
                !eventPayload.workspaceId ||
                eventPayload.workspaceId === activeWorkspace.id
              ) {
                void fetchFiles();
                addLog(
                  `Live sync: ${eventPayload.type} (rev ${eventPayload.revision || 1})`,
                  "info",
                  "Sync"
                );
              }
            }
          } catch {
            // Non-JSON frame
          }
        };

        ws.onerror = () => {
          setConnectionStatus("error");
        };

        ws.onclose = (event) => {
          setConnectionStatus("disconnected");
          if (event.code === 4401) {
            addLog("Remote session expired or revoked", "error", "Auth");
          } else if (!isDisposed) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };
      } catch {
        if (!isDisposed) {
          reconnectTimer = setTimeout(connectWs, 5000);
        }
      }
    };

    connectWs();

    return () => {
      isDisposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
      }
    };
  }, [activeWorkspace, fetchFiles, addLog]);

  // Open file into specified pane (defaults to primary)
  const openFile = useCallback(
    async (path: string, pane: "primary" | "secondary" = "primary", _targetLine?: number) => {
      if (!activeWorkspace || workspaceIdRef.current !== activeWorkspace.id) return;

      // Ensure tab is added to the specified pane
      if (pane === "primary") {
        setPrimaryTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
        setPrimaryActiveTab(path);
      } else {
        setSecondaryTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
        setSecondaryActiveTab(path);
      }

      // Check if buffer is already loaded in memory
      if (buffers[path]) {
        return;
      }

      // Load file from host agent
      setLoadingPaths((prev) => new Set([...prev, path]));

      try {
        const [readRes, statRes] = await Promise.all([
          gatewayFetch(
            `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/read?path=${encodeURIComponent(
              path
            )}`
          ),
          gatewayFetch(
            `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/stat?path=${encodeURIComponent(
              path
            )}`
          ),
        ]);

        if (!readRes.ok || !statRes.ok) {
          throw new Error("Failed to read file from host agent");
        }

        const readBody = await readRes.json();
        const statBody = await statRes.json();
        if (workspaceIdRef.current !== activeWorkspace.id) return;
        const readData = readBody.data;
        const statData = statBody.data;

        // Check for local unsaved draft restoration
        let content = readData.content;
        let isDirty = false;
        const savedDraft = DraftStorage.getDraft(activeWorkspace.id, path);

        if (savedDraft && savedDraft.content !== content) {
          content = savedDraft.content;
          isDirty = true;
          addLog(
            `Restored unsaved local draft for ${path} from ${new Date(
              savedDraft.timestamp
            ).toLocaleTimeString()}`,
            "warn",
            "Draft"
          );
        }

        const newBuffer: FileBuffer = {
          path,
          content,
          savedContent: readData.content,
          isDirty,
          eTag: isDirty && savedDraft ? savedDraft.originalETag : readData.eTag,
          hasExternalConflict: Boolean(isDirty && savedDraft && savedDraft.originalETag !== readData.eTag),
          mtime: statData.mtime,
          isBinary: readData.isBinary,
          encoding: readData.encoding,
          size: statData.size,
        };

        setBuffers((prev) => ({
          ...prev,
          [path]: newBuffer,
        }));

        addLog(`Opened file ${path} (${Math.round(statData.size / 1024)} KB)`, "info", "File");
      } catch (err: unknown) {
        addLog(`Error loading ${path}: ${(err as Error).message}`, "error", "File");
      } finally {
        if (workspaceIdRef.current === activeWorkspace.id) {
          setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
      }
    },
    [activeWorkspace, buffers, addLog]
  );

  useEffect(() => {
    const session = sessionToRestore.current;
    if (!activeWorkspace || !session) return;
    sessionToRestore.current = null;
    const workspaceId = activeWorkspace.id;
    void Promise.all([
      ...session.primaryTabs.map((path) => openFile(path, "primary")),
      ...session.secondaryTabs.map((path) => openFile(path, "secondary")),
    ]).then(() => {
      if (workspaceIdRef.current !== workspaceId) return;
      setPrimaryActiveTab(session.primaryActiveTab);
      setSecondaryActiveTab(session.secondaryActiveTab);
    });
  }, [activeWorkspace, openFile]);

  // Create a new untitled in-memory text file (VS Code style)
  const handleCreateUntitledFile = useCallback(() => {
    if (isReadOnly) return;
    const filename = `Untitled-${untitledCount}.txt`;
    setUntitledCount((prev) => prev + 1);

    const newBuffer: FileBuffer = {
      path: filename,
      content: "",
      savedContent: "",
      isDirty: true,
      eTag: "",
      mtime: Date.now(),
      isBinary: false,
      encoding: "utf-8",
      size: 0,
    };

    setBuffers((prev) => ({
      ...prev,
      [filename]: newBuffer,
    }));
    setPrimaryTabs((prev) => (prev.includes(filename) ? prev : [...prev, filename]));
    setPrimaryActiveTab(filename);
    addLog(`Created new file ${filename}`, "info", "Editor");
  }, [untitledCount, addLog, isReadOnly]);

  // Close tab in specified pane
  const closeTab = useCallback(
    (path: string, pane: "primary" | "secondary" = "primary") => {
      const buffer = buffers[path];
      if (buffer?.isDirty) {
        const discard = confirm(
          `"${path.split("/").pop()}" has unsaved changes. Do you want to close and discard changes?`
        );
        if (!discard) return;
        if (activeWorkspace) {
          DraftStorage.removeDraft(activeWorkspace.id, path);
        }
      }

      if (pane === "primary") {
        setPrimaryTabs((prev) => {
          const next = prev.filter((p) => p !== path);
          if (primaryActiveTab === path) {
            setPrimaryActiveTab(next[next.length - 1] || null);
          }
          return next;
        });
      } else {
        setSecondaryTabs((prev) => {
          const next = prev.filter((p) => p !== path);
          if (secondaryActiveTab === path) {
            setSecondaryActiveTab(next[next.length - 1] || null);
          }
          return next;
        });
      }
    },
    [buffers, primaryActiveTab, secondaryActiveTab, activeWorkspace]
  );

  // Update content of a buffer
  const updateBufferContent = useCallback(
    (path: string, newContent: string) => {
      if (isReadOnly) return;

      // Diagnostic check for JSON problems
      if (path.endsWith(".json")) {
        try {
          JSON.parse(newContent);
          setProblems((prev) => prev.filter((pr) => pr.filePath !== path));
        } catch (err: unknown) {
          const msg = (err as Error).message;
          setProblems((prev) => [
            ...prev.filter((pr) => pr.filePath !== path),
            {
              id: `${path}-json-err`,
              filePath: path,
              message: msg,
              severity: "error",
            },
          ]);
        }
      }

      setBuffers((prev) => {
        const current = prev[path];
        if (!current) return prev;
        const isDirty = newContent !== current.savedContent;

        if (activeWorkspace) {
          if (isDirty) {
            DraftStorage.saveDraft(activeWorkspace.id, path, newContent, current.eTag);
          } else {
            DraftStorage.removeDraft(activeWorkspace.id, path);
          }
        }

        return {
          ...prev,
          [path]: {
            ...current,
            content: newContent,
            isDirty,
          },
        };
      });
    },
    [activeWorkspace, isReadOnly]
  );

  // Save file to host agent atomically
  const saveFile = useCallback(
    async (path: string, forceOverwrite = false): Promise<void> => {
      if (isReadOnly || !activeWorkspace) return;
      const buffer = buffers[path];
      if (!buffer || workspaceIdRef.current !== activeWorkspace.id) return;
      const saveKey = `${activeWorkspace.id}:${path}`;
      if (savingPaths.current.has(saveKey)) return;
      savingPaths.current.add(saveKey);

      try {
        const res = await gatewayFetch(
          `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/write`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path,
              content: buffer.content,
              expectedETag: forceOverwrite ? undefined : buffer.eTag,
            }),
          }
        );

        if (workspaceIdRef.current !== activeWorkspace.id) return;
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          if (res.status === 409 || errorBody.error?.code === "CONCURRENCY_CONFLICT") {
            setConflictPath(path);
            addLog(
              `Concurrency conflict saving ${path}: modified externally on host`,
              "warn",
              "Save"
            );
            return;
          }
          throw new Error(errorBody.error?.message || "Failed to save file");
        }

        const body = await res.json();
        const updatedETag = body.data.eTag;
        const updatedMtime = body.data.mtime;

        setBuffers((prev) => {
          const current = prev[path];
          if (!current || workspaceIdRef.current !== activeWorkspace.id) return prev;
          const updated = applySaveResult(current, buffer, updatedETag, updatedMtime);
          if (updated.isDirty) DraftStorage.saveDraft(activeWorkspace.id, path, updated.content, updatedETag);
          else DraftStorage.removeDraft(activeWorkspace.id, path);
          return { ...prev, [path]: updated };
        });

        addLog(`Saved ${path} successfully to host`, "success", "Save");
      } catch (err: unknown) {
        addLog(`Error saving ${path}: ${(err as Error).message}`, "error", "Save");
      } finally {
        savingPaths.current.delete(saveKey);
      }
    },
    [activeWorkspace, buffers, addLog, isReadOnly]
  );

  // Save all dirty files
  const saveAll = useCallback(async () => {
    if (isReadOnly) return;
    const dirtyPaths = Object.values(buffers)
      .filter((b) => b.isDirty)
      .map((b) => b.path);

    if (dirtyPaths.length === 0) return;

    for (const p of dirtyPaths) {
      await saveFile(p);
    }
  }, [buffers, saveFile, isReadOnly]);

  // Periodic external change detection & stat polling
  useEffect(() => {
    if (!activeWorkspace) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      const openPaths = Array.from(new Set([...primaryTabs, ...secondaryTabs]));
      if (openPaths.length === 0) return;

      for (const p of openPaths) {
        const buffer = buffers[p];
        if (!buffer) continue;

        try {
          const res = await gatewayFetch(
            `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/stat?path=${encodeURIComponent(
              p
            )}`
          );

          if (cancelled || workspaceIdRef.current !== activeWorkspace.id) return;
          if (res.status === 404) {
            if (!buffer.deletedOnDisk) {
              setBuffers((prev) => {
                const current = prev[p];
                if (!current) return prev;
                return {
                  ...prev,
                  [p]: { ...current, deletedOnDisk: true },
                };
              });
              addLog(`Notice: File ${p} was deleted on host computer`, "warn", "Host");
            }
            continue;
          }

          if (res.ok) {
            const body = await res.json();
            const hostETag = body.data.eTag;

            if (hostETag && hostETag !== buffer.eTag) {
              if (!buffer.isDirty) {
                // Not modified locally: automatically reload fresh content
                const readRes = await gatewayFetch(
                  `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/read?path=${encodeURIComponent(
                    p
                  )}`
                );
                if (readRes.ok) {
                  const readBody = await readRes.json();
                  setBuffers((prev) => {
                    const current = prev[p];
                    if (!current || cancelled || current.isDirty || current.eTag !== buffer.eTag || workspaceIdRef.current !== activeWorkspace.id) return prev;
                    return {
                      ...prev,
                      [p]: {
                        ...current,
                        content: readBody.data.content,
                        savedContent: readBody.data.content,
                        eTag: readBody.data.eTag,
                        mtime: body.data.mtime,
                        hasExternalConflict: false,
                      },
                    };
                  });
                  addLog(`Reloaded external changes for ${p}`, "info", "Sync");
                }
              } else {
                // Modified locally: mark conflict and notify
                setBuffers((prev) => {
                  const current = prev[p];
                  if (!current) return prev;
                  return {
                    ...prev,
                    [p]: {
                      ...current,
                      hasExternalConflict: true,
                    },
                  };
                });
              }
            }
          }
        } catch {
          // Network or agent temporarily unreachable
        }
      }
    }, 5000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [activeWorkspace, primaryTabs, secondaryTabs, buffers, addLog]);

  // Autosave delay effect
  useEffect(() => {
    if (isReadOnly || editorSettings.autosave !== "delay") return;

    const dirtyBuffers = Object.values(buffers).filter((b) => b.isDirty);
    if (dirtyBuffers.length === 0) return;

    const timer = setTimeout(async () => {
      setAutosaveStatus("saving");
      for (const b of dirtyBuffers) {
        await saveFile(b.path);
      }
      setAutosaveStatus("saved");
      setTimeout(() => setAutosaveStatus("idle"), 1500);
    }, editorSettings.autosaveDelayMs || 2000);

    return () => clearTimeout(timer);
  }, [buffers, editorSettings.autosave, editorSettings.autosaveDelayMs, saveFile, isReadOnly]);

  // Autosave on window blur
  useEffect(() => {
    if (isReadOnly || editorSettings.autosave !== "focus") return;
    const handleBlur = () => {
      void saveAll();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [editorSettings.autosave, saveAll, isReadOnly]);

  // Save session state to localStorage on tab change
  useEffect(() => {
    if (activeWorkspace && workspaceIdRef.current === activeWorkspace.id) {
      SettingsStorage.saveWorkspaceSession(activeWorkspace.id, {
        primaryTabs,
        primaryActiveTab,
        secondaryTabs,
        secondaryActiveTab,
      });
    }
  }, [activeWorkspace, primaryTabs, primaryActiveTab, secondaryTabs, secondaryActiveTab]);

  // Keyboard shortcuts (Cmd+S, Cmd+Shift+S, Cmd+K, Cmd+P, Cmd+\, Cmd+J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          void saveAll();
        } else if (primaryActiveTab) {
          void saveFile(primaryActiveTab);
        }
      } else if (isMod && (e.key.toLowerCase() === "k" || e.key.toLowerCase() === "p")) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (isMod && e.key === "\\") {
        e.preventDefault();
        updateUiLayout({ isSplit: !uiLayout.isSplit });
      } else if (isMod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        updateUiLayout({ bottomPanelOpen: !uiLayout.bottomPanelOpen });
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setIsAgentOpen((prev) => !prev);
      } else if (isMod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleCreateUntitledFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    primaryActiveTab,
    saveFile,
    saveAll,
    uiLayout.isSplit,
    uiLayout.bottomPanelOpen,
    handleCreateUntitledFile,
  ]);

  // Filesystem CRUD handlers
  const handleCreateItem = async (
    parentPath: string,
    name: string,
    type: "file" | "directory"
  ): Promise<void> => {
    if (isReadOnly || !activeWorkspace) return;
    const targetPath = parentPath ? `${parentPath}/${name}` : name;

    const res = await gatewayFetch(
      `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/create`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: targetPath,
          type,
          initialContent: "",
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to create item");
    }

    addLog(`Created ${type} ${targetPath}`, "success", "Explorer");
    void fetchFiles();
    if (type === "file") {
      void openFile(targetPath);
    }
  };

  const handleRenameItem = async (oldPath: string, newPath: string): Promise<void> => {
    if (isReadOnly || !activeWorkspace) return;

    const res = await gatewayFetch(
      `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/move`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromPath: oldPath,
          toPath: newPath,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to rename item");
    }

    addLog(`Renamed ${oldPath} to ${newPath}`, "success", "Explorer");

    // Update open tabs
    setPrimaryTabs((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
    setSecondaryTabs((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
    if (primaryActiveTab === oldPath) setPrimaryActiveTab(newPath);
    if (secondaryActiveTab === oldPath) setSecondaryActiveTab(newPath);

    // Update buffer key
    if (buffers[oldPath]) {
      setBuffers((prev) => {
        const oldBuf = prev[oldPath];
        if (!oldBuf) return prev;
        const next = { ...prev };
        next[newPath] = { ...oldBuf, path: newPath };
        delete next[oldPath];
        return next;
      });
    }

    void fetchFiles();
  };

  const handleDeleteItem = async (path: string): Promise<void> => {
    if (isReadOnly || !activeWorkspace) return;

    const res = await gatewayFetch(
      `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files?path=${encodeURIComponent(
        path
      )}&recursive=true`,
      { method: "DELETE" }
    );

    if (res.ok) {
      addLog(`Deleted ${path}`, "info", "Explorer");
      closeTab(path, "primary");
      closeTab(path, "secondary");
      void fetchFiles();
    }
  };

  const handleRegisterWorkspace = async (name: string, folderPath: string) => {
    const res = await gatewayFetch(`${AGENT_BASE_URL}/api/v1/workspaces/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, paths: [folderPath] }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to register workspace");
    }

    const body = await res.json();
    await fetchWorkspaces();
    setActiveWorkspace(body.data);
  };

  const handleSelectWorkspace = async (id: string) => {
    const res = await gatewayFetch(`${AGENT_BASE_URL}/api/v1/workspaces/${id}/open`, {
      method: "POST",
    });
    if (res.ok) {
      const body = await res.json();
      setActiveWorkspace(body.data);
      setPrimaryTabs([]);
      setPrimaryActiveTab(null);
      setSecondaryTabs([]);
      setSecondaryActiveTab(null);
      setBuffers({});
    }
  };

  const handleRemoveWorkspace = async (id: string) => {
    if (isReadOnly) return;
    await gatewayFetch(`${AGENT_BASE_URL}/api/v1/workspaces/${id}`, { method: "DELETE" });
    await fetchWorkspaces();
  };

  // Conflict resolution actions
  const handleOverwriteHost = async () => {
    if (conflictPath) {
      await saveFile(conflictPath, true);
      setConflictPath(null);
    }
  };

  const handleReloadFromHost = async () => {
    if (conflictPath && activeWorkspace) {
      DraftStorage.removeDraft(activeWorkspace.id, conflictPath);
      // Re-read file
      const res = await gatewayFetch(
        `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/read?path=${encodeURIComponent(
          conflictPath
        )}`
      );
      const statRes = await gatewayFetch(
        `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/stat?path=${encodeURIComponent(
          conflictPath
        )}`
      );

      if (res.ok && statRes.ok) {
        const readBody = await res.json();
        const statBody = await statRes.json();
        setBuffers((prev) => {
          const current = prev[conflictPath];
          if (!current) return prev;
          return {
            ...prev,
            [conflictPath]: {
              ...current,
              content: readBody.data.content,
              savedContent: readBody.data.content,
              isDirty: false,
              eTag: statBody.data.eTag,
              mtime: statBody.data.mtime,
              hasExternalConflict: false,
            },
          };
        });
        addLog(`Reloaded ${conflictPath} from host. Local edits discarded.`, "info", "Conflict");
      }
      setConflictPath(null);
    }
  };

  const activeBuffer = primaryActiveTab ? buffers[primaryActiveTab] : null;
  const activeLanguage = primaryActiveTab
    ? getLanguageDefinition(primaryActiveTab).name
    : "Plain Text";

  return (
    <div className="h-screen w-screen flex flex-col bg-ide-bg text-zinc-100 select-none overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        projectName={activeWorkspace ? activeWorkspace.name : "RemoteIDE Workspace"}
        connectionStatus={connectionStatus}
        hostName={hostName}
        onRefresh={() => {
          void checkAgentHealth();
          void fetchWorkspaces();
          void fetchFiles();
        }}
        isAgentOpen={isAgentOpen}
        onToggleAgent={() => setIsAgentOpen((prev) => !prev)}
        onOpenShare={canCreateShareLink ? () => setIsShareModalOpen(true) : undefined}
        onOpenSessions={canViewSessions ? () => setIsSessionDashboardOpen(true) : undefined}
        onOpenAuth={
          isOwnerAuthenticated || currentUserRole === UserRole.OWNER || !currentUserRole
            ? () => setIsAuthModalOpen(true)
            : undefined
        }
        isOwner={isOwnerAuthenticated}
      />

      {/* Main Middle Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Activity Bar */}
        <ActivityBar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (tab === "terminal" || tab === "preview" || tab === "apiclient") {
              updateUiLayout({
                bottomPanelOpen: true,
                bottomPanelTab: tab,
              });
            } else {
              setActiveTab((prev) => (prev === tab ? null : tab));
            }
          }}
        />

        {/* Resizable Sidebar */}
        <Sidebar
          activeTab={activeTab}
          width={uiLayout.sidebarWidth}
          onWidthChange={(w) => updateUiLayout({ sidebarWidth: w })}
          hostStatus={connectionStatus}
          hostId={hostId}
          hostName={hostName}
          platform={platform}
          agentUrl={AGENT_BASE_URL}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          files={files}
          selectedPath={primaryActiveTab}
          onSelectWorkspace={handleSelectWorkspace}
          onOpenFolderModal={() => {
            if (!isReadOnly) setIsOpenFolderModalOpen(true);
          }}
          onCloneRepoModal={() => {
            if (!isReadOnly) setIsCloneRepoModalOpen(true);
          }}
          onRemoveWorkspace={handleRemoveWorkspace}
          onSelectFile={(path) => void openFile(path, "primary")}
          onOpenToSide={(path) => {
            updateUiLayout({ isSplit: true });
            void openFile(path, "secondary");
          }}
          onRefreshFiles={fetchFiles}
          onCreateItem={isReadOnly ? undefined : handleCreateItem}
          onRenameItem={isReadOnly ? undefined : handleRenameItem}
          onDeleteFile={isReadOnly ? undefined : handleDeleteItem}
          editorSettings={editorSettings}
          onUpdateEditorSettings={updateEditorSettings}
        />

        {/* Center Editor Area (Single or Split) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {primaryTabs.length === 0 && !uiLayout.isSplit ? (
            <WorkspaceCanvas
              onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile}
            />
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Primary Editor Pane */}
              <EditorPane
                paneId="primary"
                tabs={primaryTabs}
                activeTab={primaryActiveTab}
                buffers={buffers}
                loadingPaths={loadingPaths}
                settings={editorSettings}
                agentUrl={AGENT_BASE_URL}
                activeWorkspaceId={activeWorkspace ? activeWorkspace.id : null}
                readOnly={isReadOnly}
                onSelectTab={(path) => setPrimaryActiveTab(path)}
                onCloseTab={(path) => closeTab(path, "primary")}
                onUpdateContent={updateBufferContent}
                onCursorChange={(line, col, selLen) => setCursorPos({ line, col, selLen })}
                onSaveFile={saveFile}
                onSaveAll={saveAll}
                onSplitEditor={() => updateUiLayout({ isSplit: !uiLayout.isSplit })}
                isSplit={uiLayout.isSplit}
                showSplitButton={true}
                onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile}
              />

              {/* Secondary Editor Pane (Split View) */}
              {uiLayout.isSplit && (
                <EditorPane
                  paneId="secondary"
                  tabs={secondaryTabs}
                  activeTab={secondaryActiveTab}
                  buffers={buffers}
                  loadingPaths={loadingPaths}
                  settings={editorSettings}
                  agentUrl={AGENT_BASE_URL}
                  activeWorkspaceId={activeWorkspace ? activeWorkspace.id : null}
                  readOnly={isReadOnly}
                  onSelectTab={(path) => setSecondaryActiveTab(path)}
                  onCloseTab={(path) => closeTab(path, "secondary")}
                  onUpdateContent={updateBufferContent}
                  onSaveFile={saveFile}
                  onSaveAll={saveAll}
                  onSplitEditor={() => updateUiLayout({ isSplit: false })}
                  isSplit={true}
                  showSplitButton={false}
                  onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile}
                />
              )}
            </div>
          )}

          {/* Bottom Panel (Terminal, Tasks, Output, Problems) */}
          <BottomPanel
            isOpen={uiLayout.bottomPanelOpen}
            activeTab={uiLayout.bottomPanelTab}
            onSelectTab={(t) => updateUiLayout({ bottomPanelTab: t })}
            onClose={() => updateUiLayout({ bottomPanelOpen: false })}
            height={uiLayout.bottomPanelHeight}
            onHeightChange={(h) => updateUiLayout({ bottomPanelHeight: h })}
            logs={logs}
            problems={problems}
            onClearLogs={() => setLogs([])}
            onSelectProblem={(prob) => {
              void openFile(prob.filePath, "primary", prob.line);
            }}
            gatewayUrl={GATEWAY_URL}
            workspacePath={activeWorkspace?.folders?.[0]?.path}
          />
        </div>

        {/* Coding Agent Sidebar (VS Code style right panel) */}
        <AgentPanel
          isOpen={isAgentOpen}
          onClose={() => setIsAgentOpen(false)}
          width={agentWidth}
          onWidthChange={setAgentWidth}
          activeFilePath={primaryActiveTab}
          cursorLine={cursorPos.line}
          workspaceName={activeWorkspace ? activeWorkspace.name : "RemoteIDE"}
          hostName={hostName}
        />
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        branch={activeWorkspace ? activeWorkspace.name.toLowerCase().replace(/\s+/g, "-") : "main"}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        selectionLength={cursorPos.selLen}
        language={activeLanguage}
        tabSize={editorSettings.tabSize}
        isDirty={activeBuffer?.isDirty}
        autosaveStatus={autosaveStatus}
        onToggleBottomPanel={() => updateUiLayout({ bottomPanelOpen: !uiLayout.bottomPanelOpen })}
        bottomPanelOpen={uiLayout.bottomPanelOpen}
        problemCount={problems.length}
      />

      {/* Command Palette Modal (Cmd+K / Cmd+P) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        files={files}
        workspaces={workspaces}
        onOpenFile={(path) => void openFile(path, "primary")}
        onSaveFile={() => {
          if (primaryActiveTab) void saveFile(primaryActiveTab);
        }}
        onSaveAll={() => void saveAll()}
        onToggleSplit={() => updateUiLayout({ isSplit: !uiLayout.isSplit })}
        onToggleBottomPanel={() => updateUiLayout({ bottomPanelOpen: !uiLayout.bottomPanelOpen })}
        onToggleWordWrap={() => updateEditorSettings({ wordWrap: !editorSettings.wordWrap })}
        onChangeTheme={(theme) => updateEditorSettings({ theme })}
        onChangeFontSize={(fontSize) => updateEditorSettings({ fontSize })}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateFilePrompt={() => {
          const name = prompt("Enter new file path:");
          if (name) void handleCreateItem("", name, "file");
        }}
        onCreateFolderPrompt={() => {
          const name = prompt("Enter new folder path:");
          if (name) void handleCreateItem("", name, "directory");
        }}
      />

      {/* Concurrency Conflict Dialog */}
      <ConflictDialog
        isOpen={conflictPath !== null && !isReadOnly}
        filePath={conflictPath || ""}
        onOverwriteHost={handleOverwriteHost}
        onReloadFromHost={handleReloadFromHost}
        onCancel={() => setConflictPath(null)}
      />

      {/* Open Folder Modal */}
      <OpenFolderModal
        isOpen={isOpenFolderModalOpen && !isReadOnly}
        onClose={() => setIsOpenFolderModalOpen(false)}
        onOpenFolder={async (name, path) => {
          await handleRegisterWorkspace(name, path);
        }}
        defaultPath={activeWorkspace?.folders?.[0]?.path}
      />

      {/* Clone Repository Modal */}
      <CloneRepoModal
        isOpen={isCloneRepoModalOpen && !isReadOnly}
        onClose={() => setIsCloneRepoModalOpen(false)}
        onCloneRepo={async (repoUrl, targetName) => {
          const targetPath = `/Users/aman/Documents/Project/${targetName}`;
          await handleRegisterWorkspace(targetName, targetPath);
          addLog(`Cloned repository "${targetName}" from ${repoUrl}`, "success", "Git");
        }}
      />

      {/* Share Link Modal */}
      {canCreateShareLink && (
        <ShareLinkModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
          currentWorkspaceId={activeWorkspace?.id}
          gatewayUrl={GATEWAY_HTTP_URL}
        />
      )}

      {/* Session Control Dashboard Modal */}
      {canViewSessions && (
        <SessionDashboardModal
          isOpen={isSessionDashboardOpen}
          onClose={() => setIsSessionDashboardOpen(false)}
          gatewayUrl={GATEWAY_HTTP_URL}
        />
      )}

      {/* Owner Auth & Bootstrap Modal */}
      <OwnerAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        gatewayUrl={GATEWAY_HTTP_URL}
        onAuthSuccess={(_token, user) => {
          setIsOwnerAuthenticated(true);
          setCurrentUserRole(UserRole.OWNER);
          localStorage.setItem("remote_ide_role", UserRole.OWNER);
          addLog(`Authenticated as Host Owner (${user?.email || "Owner"}).`, "success", "Auth");
        }}
      />
    </div>
  );
};
