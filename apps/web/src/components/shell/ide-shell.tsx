"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./header";
import { ActivityBar, ActivityTab } from "./activity-bar";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";
import { BottomPanel, LogEntry, ProblemEntry } from "./bottom-panel";
import { CommandPalette } from "./command-palette";
import { ConflictDialog } from "../editor/conflict-dialog";
import { EditorPane, FileBuffer } from "../editor/editor-pane";
import { WorkspaceCanvas } from "./workspace-canvas";
import { Workspace, FileNode } from "@remote-ide/shared";
import { getLanguageDefinition } from "../../lib/editor/language-registry";
import {
  SettingsStorage,
  EditorSettings,
  UiLayoutSettings,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_UI_LAYOUT,
} from "../../lib/storage/settings-storage";
import { DraftStorage } from "../../lib/storage/draft-storage";

const AGENT_BASE_URL = process.env.NEXT_PUBLIC_AGENT_HTTP_URL || "http://localhost:4001";

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
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);

  // 2. Multi-Tab & Multi-Pane Buffer State
  const [buffers, setBuffers] = useState<Record<string, FileBuffer>>({});
  const [primaryTabs, setPrimaryTabs] = useState<string[]>([]);
  const [primaryActiveTab, setPrimaryActiveTab] = useState<string | null>(null);
  const [secondaryTabs, setSecondaryTabs] = useState<string[]>([]);
  const [secondaryActiveTab, setSecondaryActiveTab] = useState<string | null>(null);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  // 3. Status Bar & Cursor Position
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, selLen: 0 });
  const [autosaveStatus, setAutosaveStatus] = useState<"saving" | "saved" | "idle">("idle");

  // 4. Bottom Panel & Output Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [problems, setProblems] = useState<ProblemEntry[]>([]);

  // 5. Dialogs
  const [conflictPath, setConflictPath] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

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

  // Check agent health
  const checkAgentHealth = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_BASE_URL}/api/v1/health`);
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
      const res = await fetch(`${AGENT_BASE_URL}/api/v1/workspaces`);
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
  }, []);

  // Fetch file tree
  const fetchFiles = useCallback(async () => {
    if (!activeWorkspace) {
      setFiles([]);
      return;
    }
    try {
      const res = await fetch(
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

      // Restore session tabs for this workspace
      const session = SettingsStorage.getWorkspaceSession(activeWorkspace.id);
      if (session.primaryTabs.length > 0) {
        setPrimaryTabs(session.primaryTabs);
        setPrimaryActiveTab(session.primaryActiveTab);
      }
    }
  }, [activeWorkspace, fetchFiles, addLog]);

  // Open file into specified pane (defaults to primary)
  const openFile = useCallback(
    async (path: string, pane: "primary" | "secondary" = "primary", _targetLine?: number) => {
      if (!activeWorkspace) return;

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
          fetch(
            `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/read?path=${encodeURIComponent(
              path
            )}`
          ),
          fetch(
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
          eTag: statData.eTag,
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
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [activeWorkspace, buffers, addLog]
  );

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
    [activeWorkspace]
  );

  // Save file to host agent atomically
  const saveFile = useCallback(
    async (path: string, forceOverwrite = false): Promise<void> => {
      if (!activeWorkspace) return;
      const buffer = buffers[path];
      if (!buffer) return;

      try {
        const res = await fetch(
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

        setBuffers((prev) => ({
          ...prev,
          [path]: {
            ...buffer,
            savedContent: buffer.content,
            isDirty: false,
            eTag: updatedETag,
            mtime: updatedMtime,
            hasExternalConflict: false,
            deletedOnDisk: false,
          },
        }));

        DraftStorage.removeDraft(activeWorkspace.id, path);
        addLog(`Saved ${path} successfully to host`, "success", "Save");
      } catch (err: unknown) {
        addLog(`Error saving ${path}: ${(err as Error).message}`, "error", "Save");
      }
    },
    [activeWorkspace, buffers, addLog]
  );

  // Save all dirty files
  const saveAll = useCallback(async () => {
    const dirtyPaths = Object.values(buffers)
      .filter((b) => b.isDirty)
      .map((b) => b.path);

    if (dirtyPaths.length === 0) return;

    for (const p of dirtyPaths) {
      await saveFile(p);
    }
  }, [buffers, saveFile]);

  // Periodic external change detection & stat polling
  useEffect(() => {
    if (!activeWorkspace) return;

    const interval = setInterval(async () => {
      const openPaths = Array.from(new Set([...primaryTabs, ...secondaryTabs]));
      if (openPaths.length === 0) return;

      for (const p of openPaths) {
        const buffer = buffers[p];
        if (!buffer) continue;

        try {
          const res = await fetch(
            `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/stat?path=${encodeURIComponent(
              p
            )}`
          );

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
                const readRes = await fetch(
                  `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/read?path=${encodeURIComponent(
                    p
                  )}`
                );
                if (readRes.ok) {
                  const readBody = await readRes.json();
                  setBuffers((prev) => {
                    const current = prev[p];
                    if (!current) return prev;
                    return {
                      ...prev,
                      [p]: {
                        ...current,
                        content: readBody.data.content,
                        savedContent: readBody.data.content,
                        eTag: hostETag,
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

    return () => clearInterval(interval);
  }, [activeWorkspace, primaryTabs, secondaryTabs, buffers, addLog]);

  // Autosave delay effect
  useEffect(() => {
    if (editorSettings.autosave !== "delay") return;

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
  }, [buffers, editorSettings.autosave, editorSettings.autosaveDelayMs, saveFile]);

  // Autosave on window blur
  useEffect(() => {
    if (editorSettings.autosave !== "focus") return;
    const handleBlur = () => {
      void saveAll();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [editorSettings.autosave, saveAll]);

  // Save session state to localStorage on tab change
  useEffect(() => {
    if (activeWorkspace) {
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [primaryActiveTab, saveFile, saveAll, uiLayout.isSplit, uiLayout.bottomPanelOpen]);

  // Filesystem CRUD handlers
  const handleCreateItem = async (
    parentPath: string,
    name: string,
    type: "file" | "directory"
  ): Promise<void> => {
    if (!activeWorkspace) return;
    const targetPath = parentPath ? `${parentPath}/${name}` : name;

    const res = await fetch(
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
    if (!activeWorkspace) return;

    const res = await fetch(
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
    if (!activeWorkspace) return;

    const res = await fetch(
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
    const res = await fetch(`${AGENT_BASE_URL}/api/v1/workspaces/register`, {
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
    const res = await fetch(`${AGENT_BASE_URL}/api/v1/workspaces/${id}/open`, {
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
    await fetch(`${AGENT_BASE_URL}/api/v1/workspaces/${id}`, { method: "DELETE" });
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
      const res = await fetch(
        `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/read?path=${encodeURIComponent(
          conflictPath
        )}`
      );
      const statRes = await fetch(
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
      />

      {/* Main Middle Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Activity Bar */}
        <ActivityBar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab((prev) => (prev === tab ? null : tab))}
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
          onRegisterWorkspace={handleRegisterWorkspace}
          onRemoveWorkspace={handleRemoveWorkspace}
          onSelectFile={(path) => void openFile(path, "primary")}
          onOpenToSide={(path) => {
            updateUiLayout({ isSplit: true });
            void openFile(path, "secondary");
          }}
          onRefreshFiles={fetchFiles}
          onCreateItem={handleCreateItem}
          onRenameItem={handleRenameItem}
          onDeleteFile={handleDeleteItem}
          editorSettings={editorSettings}
          onUpdateEditorSettings={updateEditorSettings}
        />

        {/* Center Editor Area (Single or Split) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {primaryTabs.length === 0 && !uiLayout.isSplit ? (
            <WorkspaceCanvas agentUrl={AGENT_BASE_URL} />
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
                onSelectTab={(path) => setPrimaryActiveTab(path)}
                onCloseTab={(path) => closeTab(path, "primary")}
                onUpdateContent={updateBufferContent}
                onCursorChange={(line, col, selLen) => setCursorPos({ line, col, selLen })}
                onSaveFile={saveFile}
                onSaveAll={saveAll}
                onSplitEditor={() => updateUiLayout({ isSplit: !uiLayout.isSplit })}
                isSplit={uiLayout.isSplit}
                showSplitButton={true}
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
                  onSelectTab={(path) => setSecondaryActiveTab(path)}
                  onCloseTab={(path) => closeTab(path, "secondary")}
                  onUpdateContent={updateBufferContent}
                  onSaveFile={saveFile}
                  onSaveAll={saveAll}
                  onSplitEditor={() => updateUiLayout({ isSplit: false })}
                  isSplit={true}
                  showSplitButton={false}
                />
              )}
            </div>
          )}

          {/* Bottom Panel (Terminal, Output, Problems) */}
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
          />
        </div>
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
        isOpen={conflictPath !== null}
        filePath={conflictPath || ""}
        onOverwriteHost={handleOverwriteHost}
        onReloadFromHost={handleReloadFromHost}
        onCancel={() => setConflictPath(null)}
      />
    </div>
  );
};
