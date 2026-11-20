"use client";

import React, { useRef, useEffect } from "react";
import { ActivityTab } from "./activity-bar";
import { ShieldCheck, Cpu } from "lucide-react";
import { Badge } from "@remote-ide/ui";
import { Workspace, FileNode } from "@remote-ide/shared";
import { WorkspaceManager } from "../workspace/workspace-manager";
import { FileTree } from "../workspace/file-tree";
import { SearchPanel } from "../workspace/search-panel";
import { SettingsPanel } from "./settings-panel";
import { SourceControlPanel } from "../git/source-control-panel";
import { EditorSettings } from "../../lib/storage/settings-storage";
import { DebuggerPanel } from "../debug/debugger-panel";
import { TestExplorerPanel } from "../testing/test-explorer-panel";
import { LanguageSupportPanel } from "../lsp/language-support-panel";

export interface SidebarProps {
  activeTab: ActivityTab | null;
  width: number;
  onWidthChange: (newWidth: number) => void;
  onClose?: () => void;
  hostStatus?: string;
  hostId?: string;
  hostName?: string;
  platform?: string;
  agentUrl?: string;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  files: FileNode[];
  selectedPath: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenFolderModal: () => void;
  onCloneRepoModal: () => void;
  onRemoveWorkspace: (id: string) => Promise<void>;
  onSelectFile: (path: string, line?: number) => void;
  onOpenToSide?: (path: string) => void;
  onRefreshFiles: () => void;
  onCreateItem?: (parentPath: string, name: string, type: "file" | "directory") => Promise<void>;
  onRenameItem?: (oldPath: string, newPath: string) => Promise<void>;
  onDeleteFile?: (path: string) => Promise<void>;
  editorSettings: EditorSettings;
  onUpdateEditorSettings: (settings: Partial<EditorSettings>) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  width,
  onWidthChange,
  hostStatus = "ready",
  hostId = "local-host-agent",
  hostName = "Local Host",
  platform = "macOS",
  agentUrl = "http://localhost:4001",
  workspaces,
  activeWorkspace,
  files,
  selectedPath,
  onSelectWorkspace,
  onOpenFolderModal,
  onCloneRepoModal,
  onRemoveWorkspace,
  onSelectFile,
  onOpenToSide,
  onRefreshFiles,
  onCreateItem,
  onRenameItem,
  onDeleteFile,
  editorSettings,
  onUpdateEditorSettings,
}) => {
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - startXRef.current;
      const newWidth = Math.max(200, Math.min(600, startWidthRef.current + deltaX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onWidthChange]);

  if (!activeTab) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className="bg-ide-sidebar border-r border-ide-border flex flex-col h-full text-xs select-none shrink-0 relative transition-[width] duration-75"
    >
      {/* Resizer Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 bg-transparent hover:bg-indigo-500/80 cursor-col-resize transition-colors absolute top-0 bottom-0 right-0 z-30"
      />

      {/* Header */}
      <div className="h-9 px-3 border-b border-ide-border flex items-center justify-between text-zinc-300 font-semibold uppercase tracking-wider text-[11px]">
        <span>
          {activeTab === "files"
            ? "Explorer"
            : activeTab === "search"
              ? "Search"
              : activeTab === "git"
                ? "Source Control"
                : activeTab === "terminal"
                  ? "Terminals"
                  : activeTab === "agent"
                    ? "Host Agent"
                    : "Settings"}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 text-zinc-400">
        {activeTab === "files" && (
          <div className="flex flex-col gap-3 h-full">
            <WorkspaceManager
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onSelectWorkspace={onSelectWorkspace}
              onOpenFolderModal={onOpenFolderModal}
              onCloneRepoModal={onCloneRepoModal}
              onRemoveWorkspace={onRemoveWorkspace}
              hostId={hostId}
              hostName={hostName}
              platform={platform}
            />

            {activeWorkspace && (
              <div className="flex-1 border-t border-zinc-800/80 pt-2 min-h-[220px]">
                <FileTree
                  nodes={files}
                  selectedPath={selectedPath}
                  onSelectFile={(path) => onSelectFile(path)}
                  onOpenToSide={onOpenToSide}
                  onRefresh={onRefreshFiles}
                  onCreateItem={onCreateItem}
                  onRenameItem={onRenameItem}
                  onDeleteItem={onDeleteFile}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && (
          <SearchPanel
            workspaceId={activeWorkspace ? activeWorkspace.id : null}
            agentUrl={agentUrl}
            onOpenFile={onSelectFile}
          />
        )}

        {activeTab === "git" && (
          <SourceControlPanel
            gatewayUrl={agentUrl}
            workspacePath={activeWorkspace?.folders?.[0]?.path}
            onRefreshWorkspace={onRefreshFiles}
          />
        )}

        {activeTab === "debug" && (
          <DebuggerPanel
            gatewayUrl={agentUrl}
            workspaceId={activeWorkspace?.id || "default"}
            currentFilePath={selectedPath || ""}
            onNavigateToFile={onSelectFile}
          />
        )}

        {activeTab === "testing" && (
          <TestExplorerPanel
            gatewayUrl={agentUrl}
            workspacePath={activeWorkspace?.folders?.[0]?.path}
            workspaceId={activeWorkspace?.id || "default"}
            onNavigateToFile={onSelectFile}
          />
        )}

        {activeTab === "languages" && (
          <LanguageSupportPanel
            gatewayUrl={agentUrl}
            workspacePath={activeWorkspace?.folders?.[0]?.path}
            workspaceId={activeWorkspace?.id || "default"}
          />
        )}

        {activeTab === "settings" && (
          <SettingsPanel settings={editorSettings} onUpdateSettings={onUpdateEditorSettings} />
        )}

        {activeTab === "terminal" && (
          <div className="flex flex-col gap-2 p-2">
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Host Terminal Session</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
              Interactive terminal sessions and PTY multiplexing will attach in Phase 3.
            </p>
          </div>
        )}

        {activeTab === "agent" && (
          <div className="flex flex-col gap-3 p-2 font-mono text-[11px]">
            <div className="flex items-center gap-2 text-zinc-200 font-sans font-medium text-xs pb-2 border-b border-zinc-800">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Host Agent Info</span>
            </div>
            <div className="space-y-1.5 text-zinc-400">
              <div className="flex justify-between">
                <span>Agent Status:</span>
                <Badge variant="default" className="text-[10px] text-emerald-400">
                  {hostStatus}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Hostname:</span>
                <span className="text-zinc-200">{hostName}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform:</span>
                <span className="text-zinc-200">{platform}</span>
              </div>
              <div className="flex justify-between">
                <span>Host UUID:</span>
                <span className="text-zinc-400 truncate max-w-[120px]">{hostId}</span>
              </div>
              <div className="flex justify-between">
                <span>Binding:</span>
                <span className="text-zinc-300">127.0.0.1:4001 (Loopback)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
