"use client";

import React from "react";
import { ActivityTab } from "./activity-bar";
import { FolderGit2, HardDrive, ShieldCheck, Cpu } from "lucide-react";
import { Badge } from "@remote-ide/ui";

export interface SidebarProps {
  activeTab: ActivityTab | null;
  onClose?: () => void;
  hostStatus?: string;
  allowedRoot?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  hostStatus = "ready",
  allowedRoot = "/workspace",
}) => {
  if (!activeTab) return null;

  return (
    <aside className="w-64 bg-ide-sidebar border-r border-ide-border flex flex-col h-full text-xs select-none shrink-0 transition-all">
      <div className="h-9 px-3 border-b border-ide-border flex items-center justify-between text-zinc-300 font-semibold uppercase tracking-wider text-[11px]">
        <span>
          {activeTab === "files"
            ? "Explorer"
            : activeTab === "terminal"
              ? "Terminals"
              : activeTab === "agent"
                ? "Host Agent"
                : "Settings"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-zinc-400">
        {activeTab === "files" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <FolderGit2 className="w-4 h-4 text-indigo-400" />
              <span>Project Root</span>
            </div>
            <div className="bg-zinc-950/80 p-2 rounded border border-zinc-800 text-[11px] font-mono break-all text-zinc-400">
              {allowedRoot}
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Filesystem tree and operations will be mounted through the host agent in Phase 1.
            </p>
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
                <span className="text-zinc-500">Authority:</span>
                <span className="text-zinc-200">Local Host</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Journal:</span>
                <span className="text-emerald-400">SQLite Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Security:</span>
                <span className="text-zinc-200">Enforced</span>
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
              RemoteIDE strictly isolates the host machine. All operations require authenticated
              session tokens.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
