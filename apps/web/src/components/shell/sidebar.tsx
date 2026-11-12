"use client";

import React from "react";
import { ActivityTab } from "./activity-bar";
import { HardDrive, ShieldCheck, Cpu } from "lucide-react";
import { Badge } from "@remote-ide/ui";
import { Workspace, FileNode } from "@remote-ide/shared";
import { WorkspaceManager } from "../workspace/workspace-manager";
import { FileTree } from "../workspace/file-tree";

export interface SidebarProps {
  activeTab: ActivityTab | null;
  onClose?: () => void;
  hostStatus?: string;
  hostId?: string;
  hostName?: string;
  platform?: string;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  files: FileNode[];
  selectedPath: string | null;
  onSelectWorkspace: (id: string) => void;
  onRegisterWorkspace: (name: string, path: string) => Promise<void>;
  onRemoveWorkspace: (id: string) => Promise<void>;
  onSelectFile: (path: string) => void;
  onRefreshFiles: () => void;
  onDeleteFile?: (path: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  hostStatus = "ready",
  hostId = "local-host-agent",
  hostName = "Local Host",
  platform = "macOS",
  workspaces,
  activeWorkspace,
  files,
  selectedPath,
  onSelectWorkspace,
  onRegisterWorkspace,
  onRemoveWorkspace,
  onSelectFile,
  onRefreshFiles,
  onDeleteFile,
}) => {
  if (!activeTab) return null;

  return (
    <aside className="w-72 bg-ide-sidebar border-r border-ide-border flex flex-col h-full text-xs select-none shrink-0 transition-all">
      <div className="h-9 px-3 border-b border-ide-border flex items-center justify-between text-zinc-300 font-semibold uppercase tracking-wider text-[11px]">
        <span>
          {activeTab === "files"
            ? "Explorer & Workspaces"
            : activeTab === "terminal"
              ? "Terminals"
              : activeTab === "agent"
                ? "Host Agent"
                : "Settings"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-zinc-400">
        {activeTab === "files" && (
          <div className="flex flex-col gap-4 h-full">
            <WorkspaceManager
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onSelectWorkspace={onSelectWorkspace}
              onRegisterWorkspace={onRegisterWorkspace}
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
                  onSelectFile={onSelectFile}
                  onRefresh={onRefreshFiles}
                  onDeleteFile={onDeleteFile}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "terminal" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Host Terminal Session</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Interactive terminal sessions and PTY multiplexing will attach in Phase 2.
            </p>
          </div>
        )}

        {activeTab === "agent" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-zinc-300 font-medium">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <span>Host Agent</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {hostStatus}
              </Badge>
            </div>
            <div className="bg-zinc-950/80 p-2.5 rounded border border-zinc-800 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500">Host ID:</span>
                <span className="text-zinc-200 font-mono text-[10px] truncate max-w-[140px]">
                  {hostId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Platform:</span>
                <span className="text-zinc-200">{platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Interface:</span>
                <span className="text-emerald-400">127.0.0.1 (Loopback)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Journal:</span>
                <span className="text-emerald-400">SQLite Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Filesystem:</span>
                <span className="text-zinc-200">Enforced Jails</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Security & Preferences</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              RemoteIDE strictly isolates the host machine. Path traversal and symlink escapes are
              actively blocked.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
