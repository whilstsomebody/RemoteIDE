"use client";

import React from "react";

export interface WorkspaceCanvasProps {
  hasOpenFolder?: boolean;
  onOpenFolder?: () => void;
  onCloneRepo?: () => void;
  onNewUntitledFile?: () => void;
  agentUrl?: string;
}

export const WorkspaceCanvas: React.FC<WorkspaceCanvasProps> = ({ onNewUntitledFile }) => {
  return (
    <main
      onDoubleClick={onNewUntitledFile}
      className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center p-6 select-none overflow-hidden relative cursor-default"
    >
      {/* Center 40% area containing the logo, RemoteIDE title, and subtle shortcuts */}
      <div className="w-full max-w-md flex flex-col items-center text-center space-y-6">
        {/* Logo covering the center visual focal point */}
        <div className="flex flex-col items-center space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="RemoteIDE Logo"
            className="w-28 h-28 md:w-32 md:h-32 object-contain select-none pointer-events-none drop-shadow-[0_10px_20px_rgba(255,255,255,0.06)]"
          />
          <h1 className="text-2xl md:text-3xl font-semibold tracking-wider text-zinc-100 font-sans">
            RemoteIDE
          </h1>
          <p className="text-xs text-zinc-400 font-sans tracking-normal">
            Local-First Browser Remote Development
          </p>
        </div>

        {/* Subtle VS Code Keyboard Shortcuts Watermark */}
        <div className="pt-2 border-t border-zinc-800/80 w-full max-w-xs space-y-2 text-[11px] text-zinc-400 font-sans">
          <div className="flex items-center justify-between">
            <span>Show All Commands</span>
            <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-mono text-[10px] text-zinc-300">
              ⌘K
            </kbd>
          </div>
          <div className="flex items-center justify-between">
            <span>Go to File</span>
            <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-mono text-[10px] text-zinc-300">
              ⌘P
            </kbd>
          </div>
          <div className="flex items-center justify-between">
            <span>New File</span>
            <span className="text-zinc-400 text-[10px]">Double-click anywhere</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Toggle Terminal</span>
            <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-mono text-[10px] text-zinc-300">
              ⌘J
            </kbd>
          </div>
        </div>
      </div>
    </main>
  );
};
