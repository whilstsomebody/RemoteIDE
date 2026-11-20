"use client";

import React from "react";
import { Laptop, RefreshCw, Sparkles, Share2, Shield, KeyRound, Clock } from "lucide-react";
import { Button, StatusIndicator, cn } from "@remote-ide/ui";

export interface HeaderProps {
  projectName?: string;
  connectionStatus: "connected" | "connecting" | "disconnected" | "error";
  hostName?: string;
  onRefresh?: () => void;
  isAgentOpen?: boolean;
  onToggleAgent?: () => void;
  onOpenShare?: () => void;
  onOpenSessions?: () => void;
  onOpenAuth?: () => void;
  isOwner?: boolean;
  onOpenCatchup?: () => void;
  unreadCatchupCount?: number;
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
  onOpenAuth,
  isOwner = false,
  onOpenCatchup,
  unreadCatchupCount = 0,
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

        {/* While You Were Away Catch-Up indicator & modal opener */}
        {onOpenCatchup && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenCatchup}
            title={
              unreadCatchupCount > 0
                ? `While You Were Away (${unreadCatchupCount} unread changes)`
                : "While You Were Away (Catch-Up Changelog)"
            }
            className={cn(
              "h-6 px-2 text-xs flex items-center gap-1.5 transition-colors",
              unreadCatchupCount > 0
                ? "bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            {unreadCatchupCount > 0 && (
              <span className="font-semibold text-[10px] text-zinc-300">
                {unreadCatchupCount} new
              </span>
            )}
          </Button>
        )}

        {/* Share Workspace link generator */}
        {onOpenShare && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenShare}
            title="Share Access (Temporary Links & Permissions)"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
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
            <Shield className="w-3.5 h-3.5" />
          </Button>
        )}

        {/* Owner Account & Bootstrap */}
        {onOpenAuth && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenAuth}
            title={isOwner ? "Owner Account Profile" : "Initialize / Sign In as Host Owner"}
            className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
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
            className={cn(
              "h-6 w-6 transition-colors",
              isAgentOpen
                ? "text-zinc-100 bg-zinc-800 hover:bg-zinc-700"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </header>
  );
};
