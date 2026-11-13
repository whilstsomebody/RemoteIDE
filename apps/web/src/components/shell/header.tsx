"use client";

import React from "react";
import { Laptop, RefreshCw, Sparkles, Share2, Shield } from "lucide-react";
import { Button, StatusIndicator } from "@remote-ide/ui";

export interface HeaderProps {
  projectName?: string;
  connectionStatus: "connected" | "connecting" | "disconnected" | "error";
  hostName?: string;
  onRefresh?: () => void;
  isAgentOpen?: boolean;
  onToggleAgent?: () => void;
  onOpenShare?: () => void;
  onOpenSessions?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  projectName = "RemoteIDE Workspace",
  connectionStatus,
  hostName = "Local Host Agent",
  onRefresh,
  isAgentOpen = false,
  onToggleAgent,
  onOpenShare,
  onOpenSessions,
}) => {
  return (
    <header className="h-9 border-b border-ide-border bg-[#18181b] flex items-center justify-between px-3 text-xs select-none z-10 shrink-0">
      {/* Left: Logo without text (icon removed) + project name */}
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="RemoteIDE" className="h-5 w-5 object-contain select-none" />
        <span className="text-zinc-600">/</span>
        <span className="font-medium text-zinc-300 text-xs truncate max-w-xs">{projectName}</span>
      </div>

      {/* Right: Host info, Connection, Share, Sessions, Refresh load icon, Coding Agent open icon */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-zinc-900/90 px-2 py-0.5 rounded border border-zinc-800 text-[11px] text-zinc-400 font-mono">
          <Laptop className="w-3.5 h-3.5 text-zinc-400" />
          <span>{hostName}</span>
        </div>

        <StatusIndicator status={connectionStatus} />

        {/* Share Workspace link generator */}
        {onOpenShare && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenShare}
            title="Share Access (Temporary Links & Permissions)"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-sky-400" />
          </Button>
        )}

        {/* Session Control & Security Dashboard */}
        {onOpenSessions && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSessions}
            title="Session Control & Security Audit Dashboard"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
          </Button>
        )}

        {/* Load / Refresh connection icon */}
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            title="Refresh Host Connection"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        )}

        {/* Coding Agent open icon beside the load icon */}
        {onToggleAgent && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleAgent}
            title={isAgentOpen ? "Close Coding Agent" : "Open Coding Agent (Cmd+Shift+A)"}
            className={`h-6 w-6 transition-colors ${
              isAgentOpen
                ? "text-indigo-400 bg-indigo-950/60 hover:bg-indigo-900/50"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          </Button>
        )}
      </div>
    </header>
  );
};
