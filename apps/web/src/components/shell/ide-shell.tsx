"use client";

import {
  gatewayFetch,
  GATEWAY_URL,
  GATEWAY_WS_URL,
  authenticatedWebSocketUrl,
} from "../../lib/api/client";

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
import { CatchupModal } from "../catchup/catchup-modal";
import { DiffViewerModal } from "../catchup/diff-viewer-modal";
import { TerminalContainer } from "../terminal/terminal-container";
import { useViewport } from "../../lib/hooks/use-viewport";
import { usePwa } from "../../lib/pwa/pwa-manager";
import { ConnectionRecoveryManager } from "../../lib/network/connection-recovery";
import { MobileNavBar, MobileTab } from "../mobile/mobile-nav-bar";
import { MobileKeyboardToolbar } from "../mobile/mobile-keyboard-toolbar";
import { MobileHeader } from "../mobile/mobile-header";
import { MobileFileExplorer } from "../mobile/mobile-file-explorer";
import { MobileTerminalView } from "../mobile/mobile-terminal-view";
import { MobileGitView } from "../mobile/mobile-git-view";
import { TabletLayout } from "../tablet/tablet-layout";
import { DeviceHandoffModal } from "../handoff/device-handoff-modal";
import { CollabClient } from "../../lib/collab/collab-client";
import {
  Workspace,
  FileNode,
  UserRole,
  CatchupSummary,
  HandoffPayload,
  CollabParticipant,
  CollabConflictStatus,
  CollabRole,
  AiMessageContext,
} from "@remote-ide/shared";
import * as Y from "yjs";
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
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS);
  const [uiLayout, setUiLayout] = useState<UiLayoutSettings>(DEFAULT_UI_LAYOUT);
  const [activeTab, setActiveTab] = useState<ActivityTab | null>("files");
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "disconnected" | "error"
  >("connecting");

  const [hostId, setHostId] = useState<string>("local-host-agent");
  const [hostName, setHostName] = useState<string>("Local Host");
  const [platform, setPlatform] = useState<string>("macOS");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);

  const [buffers, setBuffers] = useState<Record<string, FileBuffer>>({});
  const [primaryTabs, setPrimaryTabs] = useState<string[]>([]);
  const [primaryActiveTab, setPrimaryActiveTab] = useState<string | null>(null);
  const [secondaryTabs, setSecondaryTabs] = useState<string[]>([]);
  const [secondaryActiveTab, setSecondaryActiveTab] = useState<string | null>(null);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  const workspaceIdRef = useRef<string | null>(null);
  const savingPaths = useRef(new Set<string>());
  const sessionToRestore = useRef<ReturnType<typeof SettingsStorage.getWorkspaceSession> | null>(
    null
  );
  const setActiveWorkspace = useCallback((workspace: Workspace | null) => {
    if (workspaceIdRef.current !== (workspace?.id ?? null)) {
      workspaceIdRef.current = workspace?.id ?? null;
      sessionToRestore.current = workspace
        ? SettingsStorage.getWorkspaceSession(workspace.id)
        : null;
      setBuffers({});
      setLoadingPaths(new Set());
      setPrimaryTabs([]);
      setPrimaryActiveTab(null);
      setSecondaryTabs([]);
      setSecondaryActiveTab(null);
    }
    setActiveWorkspaceState(workspace);
  }, []);

  const [cursorPos, setCursorPos] = useState<{
    line: number;
    col: number;
    selLen: number;
    selectedText?: string;
  }>({ line: 1, col: 1, selLen: 0, selectedText: "" });
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);
  const [aiInitialContext, setAiInitialContext] = useState<AiMessageContext | undefined>(undefined);
  const [autosaveStatus, setAutosaveStatus] = useState<"saving" | "saved" | "idle">("idle");
  const [hostMetrics, setHostMetrics] = useState<{
    cpuPercent: number;
    memoryPercent: number;
    batteryPercent: number | null;
    isCharging: boolean | null;
  } | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [problems, setProblems] = useState<ProblemEntry[]>([]);

  const handleTriggerAiAction = useCallback(
    (action: string) => {
      setIsAgentOpen(true);
      if (action === "explain_code") {
        setAiInitialPrompt(
          "Explain this selected code in detail, highlighting purpose, logic, and potential edge cases."
        );
        setAiInitialContext({
          type: "selection",
          filePath: primaryActiveTab || undefined,
          startLine: cursorPos.line,
          codeSnippet: cursorPos.selectedText || undefined,
        });
      } else if (action === "suggest_fix") {
        setAiInitialPrompt("Suggest a fix for the active error or selected code snippet.");
        setAiInitialContext({
          type: "fix",
          filePath: primaryActiveTab || undefined,
          errorMessage: problems.length > 0 ? problems[0]?.message : undefined,
          codeSnippet: cursorPos.selectedText || undefined,
        });
      } else if (action === "example_code") {
        setAiInitialPrompt("Generate example code demonstrating standard patterns and usage.");
        setAiInitialContext({
          type: "example",
          filePath: primaryActiveTab || undefined,
          codeSnippet: cursorPos.selectedText || undefined,
        });
      } else if (action === "explain_terminal") {
        setAiInitialPrompt("Explain this terminal output and suggest next steps.");
        setAiInitialContext({
          type: "terminal",
          terminalOutput: "Terminal session logs and output",
        });
      } else if (action === "ask_selection") {
        setAiInitialPrompt("How does this code work and how can it be optimized?");
        setAiInitialContext({
          type: "selection",
          filePath: primaryActiveTab || undefined,
          startLine: cursorPos.line,
          codeSnippet: cursorPos.selectedText || undefined,
        });
      }
    },
    [cursorPos, primaryActiveTab, problems]
  );

  const [conflictPath, setConflictPath] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

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

  const [deviceId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("remote_ide_device_id");
      if (!id) {
        id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("remote_ide_device_id", id);
      }
      return id;
    }
    return "dev_default";
  });
  const [catchupSummary, setCatchupSummary] = useState<CatchupSummary | null>(null);
  const [isCatchupModalOpen, setIsCatchupModalOpen] = useState<boolean>(false);
  const [unreadCatchupCount, setUnreadCatchupCount] = useState<number>(0);
  const [diffFilePath, setDiffFilePath] = useState<string | null>(null);

  const [collabParticipants, setCollabParticipants] = useState<CollabParticipant[]>([]);
  const [collabConflict, setCollabConflict] = useState<CollabConflictStatus | null>(null);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  const [collabDoc, setCollabDoc] = useState<Y.Doc | null>(null);
  const collabClientRef = useRef<CollabClient | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const viewport = useViewport();
  const pwa = usePwa();
  const [mobileTab, setMobileTab] = useState<MobileTab>("editor");
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);
  const [pendingHandoffBanner, setPendingHandoffBanner] = useState<{ id: string } | null>(null);
  const recoveryManager = useRef(
    new ConnectionRecoveryManager({ initialDelayMs: 1000, maxDelayMs: 30000, jitter: true })
  );

  const canCreateShareLink =
    isOwnerAuthenticated ||
    currentUserRole === UserRole.OWNER ||
    currentUserRole === UserRole.OPERATOR;

  const canViewSessions =
    isOwnerAuthenticated ||
    currentUserRole === UserRole.OWNER ||
    currentUserRole === UserRole.OPERATOR ||
    currentUserRole === UserRole.DEVELOPER;

  const isOwner =
    isOwnerAuthenticated || currentUserRole === UserRole.OWNER || !currentUserRole;
  const isReadOnly = currentUserRole === UserRole.VIEWER;

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

  useEffect(() => {
    const storedSettings = SettingsStorage.getEditorSettings();
    const storedLayout = SettingsStorage.getUiLayout();
    setEditorSettings(storedSettings);
    setUiLayout(storedLayout);
  }, []);

  const updateEditorSettings = (updated: Partial<EditorSettings>) => {
    const next = SettingsStorage.saveEditorSettings(updated);
    setEditorSettings(next);
  };

  const updateUiLayout = (updated: Partial<UiLayoutSettings>) => {
    const next = SettingsStorage.saveUiLayout(updated);
    setUiLayout(next);
  };

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

  useEffect(() => {
    void checkAgentHealth();
    void fetchWorkspaces();

    const fetchMetrics = async () => {
      try {
        const res = await gatewayFetch(`${AGENT_BASE_URL}/api/v1/host/metrics`);
        if (res.ok) {
          const body = await res.json();
          if (body.data) {
            setHostMetrics({
              cpuPercent: body.data.cpu?.usagePercent ?? 0,
              memoryPercent: body.data.memory?.usedPercent ?? 0,
              batteryPercent: body.data.battery?.percent ?? null,
              isCharging: body.data.battery?.isCharging ?? null,
            });
          }
        }
      } catch {
        // Offline
      }
    };

    void fetchMetrics();
    const metricsInterval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(metricsInterval);
  }, [checkAgentHealth, fetchWorkspaces]);

  const fetchCatchupSummary = useCallback(
    async (autoOpen = true) => {
      if (!activeWorkspace) return;
      try {
        const res = await gatewayFetch(
          `/api/v1/catchup/summary?workspaceId=${encodeURIComponent(
            activeWorkspace.id
          )}&deviceId=${encodeURIComponent(deviceId)}&workspaceName=${encodeURIComponent(
            activeWorkspace.name
          )}`
        );
        if (!res.ok) return;
        const body = await res.json();
        if (body.success && body.data) {
          const summary: CatchupSummary = body.data;
          if (summary.totalEvents > 0 || summary.historyExpired) {
            setCatchupSummary(summary);
            setUnreadCatchupCount(summary.totalEvents);
            if (autoOpen) {
              setIsCatchupModalOpen(true);
            }
          } else {
            setCatchupSummary(null);
            setUnreadCatchupCount(0);
          }
        }
      } catch {
        // Network or gateway offline
      }
    },
    [activeWorkspace, deviceId]
  );

  const handleAcknowledgeCatchup = useCallback(async () => {
    if (!catchupSummary || !activeWorkspace) return;
    try {
      const res = await gatewayFetch("/api/v1/catchup/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryId: catchupSummary.deliveryId,
          workspaceId: activeWorkspace.id,
          deviceId,
        }),
      });
      if (res.ok) {
        setUnreadCatchupCount(0);
        setCatchupSummary(null);
        addLog("Catch-up changelog acknowledged", "info", "CatchUp");
      }
    } catch {
      // Offline
    }
  }, [catchupSummary, activeWorkspace, deviceId, addLog]);

  useEffect(() => {
    if (!activeWorkspace) return;

    void fetchCatchupSummary(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchCatchupSummary(true);
        void gatewayFetch("/api/v1/catchup/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId,
            workspaceId: activeWorkspace.id,
            state: "active",
          }),
        }).catch(() => {});
      } else {
        void gatewayFetch("/api/v1/catchup/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId,
            workspaceId: activeWorkspace.id,
            state: "background",
          }),
        }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [activeWorkspace, fetchCatchupSummary, deviceId]);

  useEffect(() => {
    if (activeWorkspace) {
      void fetchFiles();
      addLog(`Connected to workspace "${activeWorkspace.name}"`, "success", "Workspace");
    }
  }, [activeWorkspace, fetchFiles, addLog]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const connectWs = () => {
      if (isDisposed) return;
      try {
        const wsUrl = new URL(authenticatedWebSocketUrl(GATEWAY_WS_URL));
        wsUrl.searchParams.set("deviceId", deviceId);
        ws = new WebSocket(wsUrl.toString());
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDisposed) return;
          wsRef.current = ws;
          setConnectionStatus("connected");
          addLog("Connected to distributed event synchronization relay", "info", "Sync");
          void fetchCatchupSummary(true);
          if (collabClientRef.current && ws) {
            collabClientRef.current.attachWebSocket(ws);
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (typeof data.type === "string" && data.type.startsWith("collab:")) {
              collabClientRef.current?.handleWsMessage(data.type, data.payload);
            }
            if (data.type === "workspace.event" && data.payload) {
              const eventPayload = data.payload;
              if (eventPayload.revision) {
                setWorkspaceRevision(eventPayload.revision);
                if (ws && ws.readyState === WebSocket.OPEN && activeWorkspace) {
                  ws.send(
                    JSON.stringify({
                      type: "device:sync_cursor",
                      payload: {
                        workspaceId: activeWorkspace.id,
                        revision: eventPayload.revision,
                      },
                    })
                  );
                }
              }

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
          if (isDisposed) return;
          setConnectionStatus("error");
        };

        ws.onclose = (event) => {
          // A socket closed by effect cleanup must not clobber the replacement socket's ref/status.
          if (isDisposed) return;
          wsRef.current = null;
          setConnectionStatus("disconnected");
          if (event.code === 4401) {
            addLog("Remote session expired or revoked", "error", "Auth");
          } else if (!isDisposed) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };
      } catch {
        wsRef.current = null;
        if (!isDisposed) {
          reconnectTimer = setTimeout(connectWs, 5000);
        }
      }
    };

    connectWs();

    return () => {
      isDisposed = true;
      wsRef.current = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
      }
    };
  }, [activeWorkspace, fetchFiles, addLog, deviceId, fetchCatchupSummary]);

  useEffect(() => {
    if (!primaryActiveTab || !activeWorkspace) {
      if (collabClientRef.current) {
        collabClientRef.current.destroy();
        collabClientRef.current = null;
        setCollabDoc(null);
        setCollabParticipants([]);
        setCollabConflict(null);
      }
      return;
    }

    const client = new CollabClient({
      workspaceId: activeWorkspace.id,
      filePath: primaryActiveTab,
      currentUserId: deviceId,
      currentUserName: hostName || "Collaborator",
      role: (isOwner ? "owner" : isReadOnly ? "viewer" : "editor") as CollabRole,
      ws: wsRef.current,
      onParticipantsChange: (p) => setCollabParticipants(p),
      onConflictChange: (c) => setCollabConflict(c),
      onFollowCursor: (_userId, line, _col) => {
        addLog(`Following collaborator cursor to line ${line}`, "info", "Collab");
      },
    });

    collabClientRef.current = client;
    setCollabDoc(client.doc);

    return () => {
      client.destroy();
      collabClientRef.current = null;
      setCollabDoc(null);
      setCollabParticipants([]);
      setCollabConflict(null);
    };
  }, [primaryActiveTab, activeWorkspace, deviceId, hostName, isOwner, isReadOnly, addLog]);

  const openFile = useCallback(
    async (path: string, pane: "primary" | "secondary" = "primary", targetLine?: number) => {
      if (!activeWorkspace || workspaceIdRef.current !== activeWorkspace.id) return;

      if (pane === "primary") {
        setPrimaryTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
        setPrimaryActiveTab(path);
      } else {
        setSecondaryTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
        setSecondaryActiveTab(path);
      }

      if (targetLine !== undefined) {
        setCursorPos({ line: targetLine, col: 1, selLen: 0 });
      }

      if (buffers[path]) {
        return;
      }

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
          hasExternalConflict: Boolean(
            isDirty && savedDraft && savedDraft.originalETag !== readData.eTag
          ),
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

  const updateBufferContent = useCallback(
    (path: string, newContent: string) => {
      if (isReadOnly) return;

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

  const handleDiagnostics = useCallback((filePath: string, diags: any[]) => {
    if (!filePath) return;
    setProblems((prev) => {
      const withoutCurrent = prev.filter((p) => p.filePath !== filePath);
      const mapped = (diags || []).map((d, i) => ({
        id: `${filePath}-${d.from || i}-${i}`,
        filePath,
        line: d.line || 1,
        col: d.col || 1,
        message: d.message,
        severity:
          d.severity === "error"
            ? ("error" as const)
            : d.severity === "warning"
              ? ("warning" as const)
              : ("info" as const),
      }));
      return [...withoutCurrent, ...mapped];
    });
  }, []);

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
          if (updated.isDirty)
            DraftStorage.saveDraft(activeWorkspace.id, path, updated.content, updatedETag);
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
                    if (
                      !current ||
                      cancelled ||
                      current.isDirty ||
                      current.eTag !== buffer.eTag ||
                      workspaceIdRef.current !== activeWorkspace.id
                    )
                      return prev;
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

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeWorkspace, primaryTabs, secondaryTabs, buffers, addLog]);

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

  useEffect(() => {
    if (isReadOnly || editorSettings.autosave !== "focus") return;
    const handleBlur = () => {
      void saveAll();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [editorSettings.autosave, saveAll, isReadOnly]);

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

    setPrimaryTabs((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
    setSecondaryTabs((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
    if (primaryActiveTab === oldPath) setPrimaryActiveTab(newPath);
    if (secondaryActiveTab === oldPath) setSecondaryActiveTab(newPath);

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

  const handleOverwriteHost = async () => {
    if (conflictPath) {
      await saveFile(conflictPath, true);
      setConflictPath(null);
    }
  };

  const handleReloadFromHost = async () => {
    if (conflictPath && activeWorkspace) {
      DraftStorage.removeDraft(activeWorkspace.id, conflictPath);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const handoffId = urlParams.get("handoff");
    if (handoffId) {
      setPendingHandoffBanner({ id: handoffId });
    }
  }, []);

  useEffect(() => {
    const recovery = recoveryManager.current;
    if (connectionStatus === "disconnected") {
      recovery.scheduleReconnect(async () => {
        await checkAgentHealth();
        if (activeWorkspace) {
          await fetchFiles();
          void fetchCatchupSummary(true);
        }
      });
    } else if (connectionStatus === "connected") {
      recovery.reset();
    }
    return () => {
      recovery.cancelScheduled();
    };
  }, [connectionStatus, checkAgentHealth, activeWorkspace, fetchFiles, fetchCatchupSummary]);

  const handleInsertSymbol = (symbol: string) => {
    if (!primaryActiveTab || isReadOnly) return;
    const buf = buffers[primaryActiveTab];
    if (!buf) return;
    updateBufferContent(primaryActiveTab, buf.content + symbol);
  };

  const handleIndent = () => {
    if (!primaryActiveTab || isReadOnly) return;
    const buf = buffers[primaryActiveTab];
    if (!buf) return;
    updateBufferContent(primaryActiveTab, buf.content + "  ");
  };

  const handleOutdent = () => {
    if (!primaryActiveTab || isReadOnly) return;
    const buf = buffers[primaryActiveTab];
    if (!buf) return;
    if (buf.content.endsWith("  ")) {
      updateBufferContent(primaryActiveTab, buf.content.slice(0, -2));
    }
  };

  const handleConsumeHandoff = useCallback(
    async (handoffId: string) => {
      try {
        const res = await gatewayFetch(`${GATEWAY_HTTP_URL}/api/v1/handoff/${encodeURIComponent(handoffId)}/consume`, {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || "Failed to consume handoff");
        }
        const handoff: HandoffPayload = data.data;
        const { layout } = handoff;

        if (layout.openFilePaths && layout.openFilePaths.length > 0) {
          for (const filePath of layout.openFilePaths) {
            void openFile(filePath, "primary");
          }
        }

        if (layout.activeFilePath) {
          const line = layout.cursorPosition?.line;
          void openFile(layout.activeFilePath, "primary", line);
        }

        addLog(
          `Session resumed from device handoff (${handoff.sourceDeviceName || "remote device"}).`,
          "success",
          "Handoff"
        );
        setPendingHandoffBanner(null);

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("handoff");
          window.history.replaceState({}, document.title, url.toString());
        }
      } catch (err: any) {
        addLog(`Handoff error: ${err.message}`, "error", "Handoff");
      }
    },
    [addLog, openFile]
  );

  const activeBuffer = primaryActiveTab ? buffers[primaryActiveTab] : null;
  const activeLanguage = primaryActiveTab
    ? getLanguageDefinition(primaryActiveTab).name
    : "Plain Text";

  return (
    <div className="h-screen w-screen flex flex-col bg-ide-bg text-zinc-100 select-none overflow-hidden font-sans">
      {viewport.isPhone ? (
        <>
          <MobileHeader
            projectName={activeWorkspace ? activeWorkspace.name : "RemoteIDE"}
            connectionStatus={connectionStatus}
            isOnline={pwa.isOnline}
            isInstallable={pwa.isInstallable}
            onInstallPwa={pwa.promptInstall}
            onOpenHandoff={() => setIsHandoffModalOpen(true)}
          />

          {pendingHandoffBanner && (
            <div className="bg-zinc-800 border-b border-zinc-700 px-3 py-2 flex items-center justify-between text-xs z-30 shrink-0">
              <span className="text-zinc-200 font-mono">Workspace handoff available!</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleConsumeHandoff(pendingHandoffBanner.id)}
                  className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded text-[11px] font-mono font-medium"
                >
                  Resume Here
                </button>
                <button
                  onClick={() => setPendingHandoffBanner(null)}
                  className="text-zinc-400 hover:text-zinc-200 text-[11px]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-hidden relative">
            {mobileTab === "files" && (
              <MobileFileExplorer
                files={files}
                activeFilePath={primaryActiveTab}
                onOpenFile={(path) => {
                  void openFile(path, "primary");
                  setMobileTab("editor");
                }}
                onCreateFile={isReadOnly ? undefined : (parent, name) => handleCreateItem(parent, name, "file")}
                onCreateFolder={isReadOnly ? undefined : (parent, name) => handleCreateItem(parent, name, "directory")}
                onDeleteFile={isReadOnly ? undefined : (path) => handleDeleteItem(path)}
              />
            )}

            {mobileTab === "editor" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-hidden">
                  {primaryTabs.length === 0 ? (
                    <WorkspaceCanvas onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile} />
                  ) : (
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
                      onCursorChange={(line, col, selLen, selectedText) =>
                        setCursorPos({ line, col, selLen, selectedText })
                      }
                      onSaveFile={saveFile}
                      onSaveAll={saveAll}
                      showSplitButton={false}
                      onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile}
                      onDiagnostics={(diags) => handleDiagnostics(primaryActiveTab || "", diags)}
                      onNavigateDefinition={(targetPath, line) =>
                        void openFile(targetPath, "primary", line)
                      }
                    />
                  )}
                </div>
                <MobileKeyboardToolbar
                  onInsertSymbol={handleInsertSymbol}
                  onIndent={handleIndent}
                  onOutdent={handleOutdent}
                  onSave={() => {
                    if (primaryActiveTab) void saveFile(primaryActiveTab);
                  }}
                  isDirty={activeBuffer?.isDirty}
                  onOpenQuickLauncher={() => setIsCommandPaletteOpen(true)}
                />
              </div>
            )}

            {mobileTab === "terminal" && (
              <MobileTerminalView gatewayUrl={GATEWAY_URL} />
            )}

            {mobileTab === "git" && (
              <MobileGitView
                gatewayUrl={GATEWAY_URL}
                workspacePath={activeWorkspace?.folders?.[0]?.path}
                onRefreshWorkspace={fetchFiles}
              />
            )}

            {mobileTab === "dashboard" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <h3 className="font-semibold text-zinc-200 mb-2">Host Overview</h3>
                  <div className="space-y-1 text-zinc-400">
                    <div>Host: {hostName} ({platform})</div>
                    <div>Status: {connectionStatus}</div>
                    <div>CPU: {hostMetrics?.cpuPercent ? `${hostMetrics.cpuPercent}%` : "N/A"}</div>
                    <div>Memory: {hostMetrics?.memoryPercent ? `${hostMetrics.memoryPercent}%` : "N/A"}</div>
                    <div>Battery: {hostMetrics?.batteryPercent !== null && hostMetrics?.batteryPercent !== undefined ? `${hostMetrics.batteryPercent}%` : "N/A"}</div>
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <h3 className="font-semibold text-zinc-200 mb-2">Problems ({problems.length})</h3>
                  {problems.length === 0 ? (
                    <div className="text-zinc-500">No problems detected</div>
                  ) : (
                    <div className="space-y-1">
                      {problems.map((p) => (
                        <div key={p.id} className="text-rose-400">{p.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <MobileNavBar
            activeTab={mobileTab}
            onSelectTab={setMobileTab}
            hasDirtyFiles={activeBuffer?.isDirty}
            activeFileName={primaryActiveTab}
          />
        </>
      ) : viewport.isTablet ? (
        /* 2. Tablet Experience Layout */
        <>
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
            onOpenCatchup={() => setIsCatchupModalOpen(true)}
            unreadCatchupCount={unreadCatchupCount}
            onOpenHandoff={() => setIsHandoffModalOpen(true)}
          />

          <TabletLayout
            isPortrait={viewport.isPortrait}
            onSave={() => {
              if (primaryActiveTab) void saveFile(primaryActiveTab);
            }}
            onQuickOpen={() => setIsCommandPaletteOpen(true)}
            onCommandPalette={() => setIsCommandPaletteOpen(true)}
            sidebarContent={
              <Sidebar
                activeTab={activeTab}
                width={250}
                onWidthChange={() => {}}
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
                onSelectFile={(path, line) => void openFile(path, "primary", line)}
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
            }
            editorContent={
              primaryTabs.length === 0 ? (
                <WorkspaceCanvas onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile} />
              ) : (
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
                  onCursorChange={(line, col, selLen, selectedText) =>
                    setCursorPos({ line, col, selLen, selectedText })
                  }
                  onSaveFile={saveFile}
                  onSaveAll={saveAll}
                  showSplitButton={false}
                  onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile}
                  onDiagnostics={(diags) => handleDiagnostics(primaryActiveTab || "", diags)}
                  onNavigateDefinition={(targetPath, line) =>
                    void openFile(targetPath, "primary", line)
                  }
                />
              )
            }
            terminalContent={<TerminalContainer gatewayUrl={GATEWAY_URL} />}
          />

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
            cpuUsagePercent={hostMetrics?.cpuPercent}
            memoryUsagePercent={hostMetrics?.memoryPercent}
            batteryPercent={hostMetrics?.batteryPercent}
            isCharging={hostMetrics?.isCharging}
          />
        </>
      ) : (
        /* 3. Desktop Experience Layout */
        <>
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
            onOpenCatchup={() => setIsCatchupModalOpen(true)}
            unreadCatchupCount={unreadCatchupCount}
            onOpenHandoff={() => setIsHandoffModalOpen(true)}
          />

      <div className="flex-1 flex overflow-hidden">
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
          onSelectFile={(path, line) => void openFile(path, "primary", line)}
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

        <div className="flex-1 flex flex-col overflow-hidden">
          {primaryTabs.length === 0 && !uiLayout.isSplit ? (
            <WorkspaceCanvas
              onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile}
            />
          ) : (
            <div className="flex-1 flex overflow-hidden">
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
                onCursorChange={(line, col, selLen, selectedText) => {
                  setCursorPos({ line, col, selLen, selectedText });
                  collabClientRef.current?.updateCursor(line, col, selLen);
                }}
                onSaveFile={saveFile}
                onSaveAll={saveAll}
                onSplitEditor={() => updateUiLayout({ isSplit: !uiLayout.isSplit })}
                isSplit={uiLayout.isSplit}
                showSplitButton={true}
                onNewUntitledFile={isReadOnly ? undefined : handleCreateUntitledFile}
                onDiagnostics={(diags) => handleDiagnostics(primaryActiveTab || "", diags)}
                onNavigateDefinition={(targetPath, line) =>
                  void openFile(targetPath, "primary", line)
                }
                collabDoc={collabDoc || undefined}
                collabParticipants={collabParticipants}
                currentUserId={deviceId}
                currentRole={(isOwner ? "owner" : isReadOnly ? "viewer" : "editor") as CollabRole}
                collabConflict={collabConflict}
                followingUserId={followingUserId}
                onFollowUser={(targetId) => {
                  setFollowingUserId(targetId);
                  collabClientRef.current?.followParticipant(targetId);
                }}
                onAssignRole={(targetId, role) => collabClientRef.current?.assignRole(targetId, role)}
                onKickParticipant={(targetId) => collabClientRef.current?.kickParticipant(targetId)}
                onRequestEditControl={() => {
                  addLog("Requested edit control from session owner", "info", "Collab");
                }}
                onResolveConflict={(res) => {
                  if (activeWorkspace && primaryActiveTab) {
                    void gatewayFetch(
                      `/api/v1/workspaces/${activeWorkspace.id}/collab/resolve-conflict`,
                      {
                        method: "POST",
                        body: JSON.stringify({ path: primaryActiveTab, resolution: res }),
                      }
                    ).then(() => {
                      setCollabConflict(null);
                      void fetchFiles();
                    });
                  }
                }}
              />

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
                  onDiagnostics={(diags) => handleDiagnostics(secondaryActiveTab || "", diags)}
                />
              )}
            </div>
          )}

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

        <AgentPanel
          isOpen={isAgentOpen}
          onClose={() => setIsAgentOpen(false)}
          width={agentWidth}
          onWidthChange={setAgentWidth}
          workspaceId={activeWorkspace ? activeWorkspace.id : "default"}
          workspaceName={activeWorkspace ? activeWorkspace.name : "RemoteIDE"}
          hostName={hostName}
          gatewayUrl={GATEWAY_URL}
          token={typeof window !== "undefined" ? localStorage.getItem("remote_ide_token") || undefined : undefined}
          activeFilePath={primaryActiveTab}
          cursorLine={cursorPos.line}
          selectedText={cursorPos.selectedText}
          activeError={problems.length > 0 ? problems[0]?.message : undefined}
          activeTerminalOutput={undefined}
          initialPrompt={aiInitialPrompt}
          initialContext={aiInitialContext}
        />
      </div>

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
        cpuUsagePercent={hostMetrics?.cpuPercent}
        memoryUsagePercent={hostMetrics?.memoryPercent}
        batteryPercent={hostMetrics?.batteryPercent}
        isCharging={hostMetrics?.isCharging}
      />
        </>
      )}

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
        onTriggerAiAction={handleTriggerAiAction}
      />

      <ConflictDialog
        isOpen={conflictPath !== null && !isReadOnly}
        filePath={conflictPath || ""}
        onOverwriteHost={handleOverwriteHost}
        onReloadFromHost={handleReloadFromHost}
        onCancel={() => setConflictPath(null)}
      />

      <OpenFolderModal
        isOpen={isOpenFolderModalOpen && !isReadOnly}
        onClose={() => setIsOpenFolderModalOpen(false)}
        onOpenFolder={async (name, path) => {
          await handleRegisterWorkspace(name, path);
        }}
        defaultPath={activeWorkspace?.folders?.[0]?.path}
      />

      <CloneRepoModal
        isOpen={isCloneRepoModalOpen && !isReadOnly}
        onClose={() => setIsCloneRepoModalOpen(false)}
        onCloneRepo={async (repoUrl, targetName) => {
          const targetPath = `/Users/aman/Documents/Project/${targetName}`;
          await handleRegisterWorkspace(targetName, targetPath);
          addLog(`Cloned repository "${targetName}" from ${repoUrl}`, "success", "Git");
        }}
      />

      {canCreateShareLink && (
        <ShareLinkModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
          currentWorkspaceId={activeWorkspace?.id}
          gatewayUrl={GATEWAY_HTTP_URL}
        />
      )}

      {canViewSessions && (
        <SessionDashboardModal
          isOpen={isSessionDashboardOpen}
          onClose={() => setIsSessionDashboardOpen(false)}
          gatewayUrl={GATEWAY_HTTP_URL}
        />
      )}

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

      <CatchupModal
        isOpen={isCatchupModalOpen}
        onClose={() => setIsCatchupModalOpen(false)}
        summary={catchupSummary}
        onAcknowledge={handleAcknowledgeCatchup}
        onViewDiff={(filePath) => setDiffFilePath(filePath)}
        onOpenFile={(filePath) => void openFile(filePath, "primary")}
      />

      {diffFilePath && activeWorkspace && (
        <DiffViewerModal
          isOpen={diffFilePath !== null}
          onClose={() => setDiffFilePath(null)}
          workspaceId={activeWorkspace.id}
          filePath={diffFilePath}
          fromRevision={catchupSummary?.fromRevision}
          toRevision={catchupSummary?.toRevision}
        />
      )}

      <DeviceHandoffModal
        isOpen={isHandoffModalOpen}
        onClose={() => setIsHandoffModalOpen(false)}
        gatewayUrl={GATEWAY_HTTP_URL}
        currentWorkspaceId={activeWorkspace?.id}
        activeFilePath={primaryActiveTab}
        cursorPosition={{ line: cursorPos.line, col: cursorPos.col }}
        openFiles={primaryTabs}
      />
    </div>
  );
};
