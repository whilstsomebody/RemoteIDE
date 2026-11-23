"use client";

import React from "react";
import { GitBranch, Check, Clock, Terminal, AlertCircle } from "lucide-react";
import { WS_PROTOCOL_VERSION } from "@remote-ide/shared";

export interface StatusBarProps {
  branch?: string;
  cursorLine?: number;
  cursorCol?: number;
  selectionLength?: number;
  language?: string;
  tabSize?: number;
  encoding?: string;
  lineEnding?: string;
  protocolVersion?: string;
  latencyMs?: number;
  isDirty?: boolean;
  autosaveStatus?: "saving" | "saved" | "idle";
  onToggleBottomPanel?: () => void;
  bottomPanelOpen?: boolean;
  problemCount?: number;
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  batteryPercent?: number | null;
  isCharging?: boolean | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  branch = "main",
  cursorLine = 1,
  cursorCol = 1,
  selectionLength = 0,
  language = "Plain Text",
  tabSize = 2,
  encoding = "UTF-8",
  lineEnding = "LF",
  protocolVersion = WS_PROTOCOL_VERSION,
  latencyMs = 4,
  isDirty = false,
  autosaveStatus = "idle",
  onToggleBottomPanel,
  bottomPanelOpen = false,
  problemCount = 0,
  cpuUsagePercent,
  memoryUsagePercent,
  batteryPercent,
  isCharging,
}) => {
  return (
    <footer className="h-6 bg-ide-status border-t border-ide-border flex items-center justify-between px-3 text-[11px] text-zinc-400 select-none z-30 font-mono shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 hover:text-zinc-200 cursor-pointer">
          <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
          <span>{branch}</span>
        </div>

        <div className="flex items-center gap-1.5 text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          <span>Host Synced</span>
        </div>

        {cpuUsagePercent !== undefined && (
          <div className="flex items-center gap-1.5 text-zinc-300" title="Host CPU & RAM Usage">
            <span className="text-indigo-400">CPU:</span>
            <span>{cpuUsagePercent}%</span>
            {memoryUsagePercent !== undefined && (
              <>
                <span className="text-zinc-600">|</span>
                <span className="text-emerald-400">RAM:</span>
                <span>{memoryUsagePercent}%</span>
              </>
            )}
            {batteryPercent != null && (
              <>
                <span className="text-zinc-600">|</span>
                <span className={isCharging ? "text-emerald-400" : "text-zinc-300"}>
                  {batteryPercent}%
                </span>
              </>
            )}
          </div>
        )}

        {onToggleBottomPanel && (
          <button
            onClick={onToggleBottomPanel}
            className={`flex items-center gap-1.5 transition-colors ${
              problemCount > 0
                ? "text-rose-400 hover:text-rose-300"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle Panel & Problems"
          >
            <AlertCircle className="w-3 h-3" />
            <span>{problemCount}</span>
          </button>
        )}

        {isDirty && <span className="text-amber-400 font-sans text-[10px]">● Unsaved changes</span>}

        {autosaveStatus === "saving" && (
          <span className="text-indigo-400 font-sans text-[10px]">Autosaving...</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-zinc-300">
          <span>
            Ln {cursorLine}, Col {cursorCol}
          </span>
          {selectionLength > 0 && (
            <span className="text-zinc-500">({selectionLength} selected)</span>
          )}
        </div>

        <span>Spaces: {tabSize}</span>
        <span>{encoding}</span>
        <span>{lineEnding}</span>
        <span className="text-zinc-500">v{protocolVersion}</span>
        <span className="text-indigo-300 font-medium">{language}</span>

        {onToggleBottomPanel && (
          <button
            onClick={onToggleBottomPanel}
            className={`flex items-center gap-1 transition-colors px-1 rounded ${
              bottomPanelOpen
                ? "text-indigo-300 bg-indigo-950/60"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle Terminal Panel (Cmd+J)"
          >
            <Terminal className="w-3 h-3" />
            <span>Terminal</span>
          </button>
        )}

        <div className="flex items-center gap-1 text-zinc-500">
          <Clock className="w-3 h-3" />
          <span>{latencyMs}ms</span>
        </div>
      </div>
    </footer>
  );
};
