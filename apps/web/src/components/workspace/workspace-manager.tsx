"use client";

import React, { useState } from "react";
import { FolderOpen, GitFork, ChevronDown, Check, FolderPlus } from "lucide-react";
import { Workspace } from "@remote-ide/shared";

export interface WorkspaceManagerProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (id: string) => void;
  onOpenFolderModal: () => void;
  onCloneRepoModal: () => void;
  onRemoveWorkspace: (id: string) => Promise<void>;
  hostId?: string;
  hostName?: string;
  platform?: string;
}

export const WorkspaceManager: React.FC<WorkspaceManagerProps> = ({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onOpenFolderModal,
  onCloneRepoModal,
}) => {
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  // If no folder/workspace is open, show VS Code's standard "No Folder Opened" panel
  if (!activeWorkspace || workspaces.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 text-xs select-none">
        <div>
          <h4 className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase mb-2">
            No Folder Opened
          </h4>
          <p className="text-zinc-400 text-xs leading-relaxed mb-4">
            You have not yet opened a folder in RemoteIDE.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onOpenFolderModal}
            className="w-full h-8 px-3 bg-[#0e639c] hover:bg-[#1177bb] text-white rounded text-xs font-medium flex items-center justify-center gap-2 shadow transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open Folder</span>
          </button>

          <button
            onClick={onCloneRepoModal}
            className="w-full h-8 px-3 bg-[#2d2d2d] hover:bg-[#383838] text-zinc-200 rounded text-xs font-medium flex items-center justify-center gap-2 border border-zinc-700/60 shadow-sm transition-colors"
          >
            <GitFork className="w-3.5 h-3.5 text-zinc-400" />
            <span>Clone Repository</span>
          </button>
        </div>
      </div>
    );
  }

  // When a folder IS open: VS Code style workspace header with quick switcher
  return (
    <div className="flex flex-col text-xs select-none relative">
      <div
        onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
        className="flex items-center justify-between px-2 py-1.5 bg-[#1f1f23] hover:bg-[#27272a] rounded cursor-pointer transition-colors text-zinc-200 font-semibold uppercase tracking-wider text-[11px] border border-zinc-800/80"
        title="Click to switch workspace or open another folder"
      >
        <div className="flex items-center gap-1.5 truncate">
          <FolderOpen className="w-3.5 h-3.5 text-[#0e639c] shrink-0" />
          <span className="truncate">{activeWorkspace.name}</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
            isSwitcherOpen ? "rotate-180" : ""
          }`}
        />
      </div>

      {/* Dropdown Menu for Workspaces */}
      {isSwitcherOpen && (
        <div className="absolute top-8 left-0 right-0 z-40 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl py-1 text-xs text-zinc-200 animate-in fade-in-0">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold border-b border-zinc-800">
            Registered Host Workspaces
          </div>

          <div className="max-h-48 overflow-y-auto">
            {workspaces.map((ws) => {
              const isSelected = ws.id === activeWorkspace.id;
              return (
                <div
                  key={ws.id}
                  onClick={() => {
                    onSelectWorkspace(ws.id);
                    setIsSwitcherOpen(false);
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs transition-colors ${
                    isSelected
                      ? "bg-[#0e639c]/30 text-white font-medium"
                      : "text-zinc-300 hover:bg-[#2d2d2d]"
                  }`}
                >
                  <span className="truncate">{ws.name}</span>
                  {isSelected && <Check className="w-3 h-3 text-indigo-400 shrink-0" />}
                </div>
              );
            })}
          </div>

          <div className="border-t border-[#3c3c3c] mt-1 pt-1">
            <button
              onClick={() => {
                setIsSwitcherOpen(false);
                onOpenFolderModal();
              }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#0e639c] text-zinc-200 hover:text-white"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Open Another Folder...</span>
            </button>
            <button
              onClick={() => {
                setIsSwitcherOpen(false);
                onCloneRepoModal();
              }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#0e639c] text-zinc-200 hover:text-white"
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>Clone Repository...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
