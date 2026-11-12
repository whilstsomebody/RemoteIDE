"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./header";
import { ActivityBar, ActivityTab } from "./activity-bar";
import { Sidebar } from "./sidebar";
import { WorkspaceCanvas } from "./workspace-canvas";
import { StatusBar } from "./status-bar";
import { FileViewer } from "../workspace/file-viewer";
import { Workspace, FileNode, ReadFileResponse, FileStat } from "@remote-ide/shared";

const AGENT_BASE_URL = process.env.NEXT_PUBLIC_AGENT_HTTP_URL || "http://localhost:4001";

export const IdeShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActivityTab | null>("files");
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "disconnected" | "error"
  >("connecting");

  // Host info
  const [hostId, setHostId] = useState<string>("local-host-agent");
  const [hostName, setHostName] = useState<string>("Local Host");
  const [platform, setPlatform] = useState<string>("macOS");

  // Workspace & Filesystem state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ReadFileResponse | null>(null);
  const [selectedFileStat, setSelectedFileStat] = useState<FileStat | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);

  // Check agent health & host info
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
      // Agent offline
    }
  }, []);

  // Fetch files for active workspace
  const fetchFiles = useCallback(async () => {
    if (!activeWorkspace) {
      setFiles([]);
      return;
    }
    try {
      const res = await fetch(
        `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files?depth=3`
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

  // When active workspace changes, reload file tree
  useEffect(() => {
    if (activeWorkspace) {
      void fetchFiles();
      setSelectedPath(null);
      setSelectedFile(null);
      setSelectedFileStat(null);
    }
  }, [activeWorkspace, fetchFiles]);

  // Open file
  const handleSelectFile = async (path: string) => {
    if (!activeWorkspace) return;
    setSelectedPath(path);
    setIsLoadingFile(true);

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

      if (readRes.ok) {
        const readBody = await readRes.json();
        setSelectedFile(readBody.data);
      }

      if (statRes.ok) {
        const statBody = await statRes.json();
        setSelectedFileStat(statBody.data);
      }
    } catch (err) {
      console.error("Error loading file:", err);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Save file atomically with ETag
  const handleSaveFile = async (
    path: string,
    content: string,
    expectedETag: string
  ): Promise<void> => {
    if (!activeWorkspace) return;

    const res = await fetch(
      `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files/write`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          content,
          expectedETag,
        }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const errorMsg = errorBody.error?.message || "Failed to save file";
      const error = new Error(errorMsg);
      (error as { code?: string }).code = errorBody.error?.code;
      throw error;
    }

    const body = await res.json();
    // Update local ETag so subsequent saves work seamlessly
    if (selectedFile) {
      setSelectedFile({
        ...selectedFile,
        content,
        eTag: body.data.eTag,
        mtime: body.data.mtime,
      });
    }

    void fetchFiles();
  };

  // Register workspace
  const handleRegisterWorkspace = async (name: string, folderPath: string) => {
    const res = await fetch(`${AGENT_BASE_URL}/api/v1/workspaces/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        paths: [folderPath],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to register workspace");
    }

    const body = await res.json();
    await fetchWorkspaces();
    setActiveWorkspace(body.data);
  };

  // Switch workspace
  const handleSelectWorkspace = async (id: string) => {
    const res = await fetch(`${AGENT_BASE_URL}/api/v1/workspaces/${id}/open`, {
      method: "POST",
    });
    if (res.ok) {
      const body = await res.json();
      setActiveWorkspace(body.data);
    }
  };

  // Remove workspace
  const handleRemoveWorkspace = async (id: string) => {
    await fetch(`${AGENT_BASE_URL}/api/v1/workspaces/${id}`, {
      method: "DELETE",
    });
    await fetchWorkspaces();
  };

  // Delete file
  const handleDeleteFile = async (path: string) => {
    if (!activeWorkspace) return;
    const res = await fetch(
      `${AGENT_BASE_URL}/api/v1/workspaces/${activeWorkspace.id}/files?path=${encodeURIComponent(
        path
      )}&recursive=true`,
      { method: "DELETE" }
    );
    if (res.ok) {
      if (selectedPath === path) {
        setSelectedPath(null);
        setSelectedFile(null);
      }
      void fetchFiles();
    }
  };

  const handleSelectTab = (tab: ActivityTab) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const handleRefresh = () => {
    setConnectionStatus("connecting");
    void checkAgentHealth();
    void fetchWorkspaces();
    void fetchFiles();
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-ide-bg text-zinc-100 select-none overflow-hidden">
      <Header
        projectName={activeWorkspace ? activeWorkspace.name : "RemoteIDE Workspace"}
        connectionStatus={connectionStatus}
        hostName={hostName}
        onRefresh={handleRefresh}
      />

      <div className="flex-1 flex overflow-hidden">
        <ActivityBar activeTab={activeTab} onSelectTab={handleSelectTab} />
        <Sidebar
          activeTab={activeTab}
          hostStatus={connectionStatus}
          hostId={hostId}
          hostName={hostName}
          platform={platform}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          files={files}
          selectedPath={selectedPath}
          onSelectWorkspace={handleSelectWorkspace}
          onRegisterWorkspace={handleRegisterWorkspace}
          onRemoveWorkspace={handleRemoveWorkspace}
          onSelectFile={handleSelectFile}
          onRefreshFiles={fetchFiles}
          onDeleteFile={handleDeleteFile}
        />

        {selectedFile ? (
          <FileViewer
            file={selectedFile}
            stat={selectedFileStat}
            onSave={handleSaveFile}
            isLoading={isLoadingFile}
          />
        ) : (
          <WorkspaceCanvas agentUrl={AGENT_BASE_URL} />
        )}
      </div>

      <StatusBar
        branch={activeWorkspace ? activeWorkspace.name.toLowerCase().replace(/\s+/g, "-") : "main"}
        latencyMs={connectionStatus === "connected" ? 4 : 0}
      />
    </div>
  );
};
