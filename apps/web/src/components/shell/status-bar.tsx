"use client";

import React from "react";
import { GitBranch, Wifi, Check, Clock } from "lucide-react";
import { WS_PROTOCOL_VERSION } from "@remote-ide/shared";

export interface StatusBarProps {
  branch?: string;
  encoding?: string;
  lineEnding?: string;
  protocolVersion?: string;
  latencyMs?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  branch = "main",
  encoding = "UTF-8",
  lineEnding = "LF",
  protocolVersion = WS_PROTOCOL_VERSION,
  latencyMs = 12,
}) => {
  return (
    <footer className="h-6 bg-ide-status border-t border-ide-border flex items-center justify-between px-3 text-[11px] text-zinc-400 select-none z-10 font-mono">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 hover:text-zinc-200 cursor-pointer">
          <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
          <span>{branch}</span>
        </div>

        <div className="flex items-center gap-1.5 text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          <span>Host Synced</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-zinc-400">
          <Clock className="w-3 h-3" />
          <span>{latencyMs}ms</span>
        </div>

        <span>{encoding}</span>
        <span>{lineEnding}</span>

        <span className="text-zinc-500">v{protocolVersion}</span>

        <div className="flex items-center gap-1 text-indigo-400">
          <Wifi className="w-3.5 h-3.5" />
          <span>WS Gateway</span>
        </div>
      </div>
    </footer>
  );
};

