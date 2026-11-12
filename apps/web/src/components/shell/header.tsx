"use client";

import React from "react";
import { Terminal, Laptop, RefreshCw } from "lucide-react";
import { Button, StatusIndicator } from "@remote-ide/ui";

export interface HeaderProps {
  projectName?: string;
  connectionStatus: "connected" | "connecting" | "disconnected" | "error";
  hostName?: string;
  onRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  projectName = "RemoteIDE Workspace",
  connectionStatus,
  hostName = "Local Host Agent",
  onRefresh,
}) => {
  return (
    <header className="h-10 border-b border-ide-border bg-ide-header flex items-center justify-between px-3 text-xs select-none z-10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-bold tracking-tight text-indigo-400">
          <Terminal className="w-4 h-4 text-indigo-500" />
          <span>RemoteIDE</span>
        </div>
        <span className="text-zinc-600">/</span>
        <span className="font-medium text-zinc-200">{projectName}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
          <Laptop className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-300 font-mono text-[11px]">{hostName}</span>
        </div>

        <StatusIndicator status={connectionStatus} />

        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            title="Refresh Connection"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </header>
  );
};
