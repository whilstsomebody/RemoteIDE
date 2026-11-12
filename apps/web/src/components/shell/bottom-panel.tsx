"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Terminal as TerminalIcon,
  FileText,
  AlertCircle,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  Cpu,
} from "lucide-react";
import { cn } from "@remote-ide/ui";

export type BottomPanelTab = "terminal" | "output" | "problems";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  source?: string;
}

export interface ProblemEntry {
  id: string;
  filePath: string;
  line?: number;
  col?: number;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface BottomPanelProps {
  isOpen: boolean;
  activeTab: BottomPanelTab;
  onSelectTab: (tab: BottomPanelTab) => void;
  onClose: () => void;
  height: number;
  onHeightChange: (newHeight: number) => void;
  logs: LogEntry[];
  problems: ProblemEntry[];
  onClearLogs?: () => void;
  onSelectProblem?: (problem: ProblemEntry) => void;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  isOpen,
  activeTab,
  onSelectTab,
  onClose,
  height,
  onHeightChange,
  logs,
  problems,
  onClearLogs,
  onSelectProblem,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(height);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = startYRef.current - e.clientY;
      const newHeight = Math.max(
        120,
        Math.min(window.innerHeight - 150, startHeightRef.current + deltaY)
      );
      onHeightChange(newHeight);
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
  }, [onHeightChange]);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  };

  const panelHeight = isMaximized ? "calc(100vh - 120px)" : `${height}px`;

  return (
    <div
      style={{ height: panelHeight }}
      className="bg-zinc-950 border-t border-zinc-800 flex flex-col shrink-0 select-none overflow-hidden transition-all duration-75 relative z-20"
    >
      {/* Resizer Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1 bg-transparent hover:bg-indigo-500/80 cursor-row-resize transition-colors absolute top-0 left-0 right-0 z-30"
      />

      {/* Panel Header & Tabs */}
      <div className="h-9 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelectTab("terminal")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-xs font-mono",
              activeTab === "terminal"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <TerminalIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => onSelectTab("output")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-xs font-mono",
              activeTab === "output"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>Output</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px] text-zinc-400">
                {logs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectTab("problems")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-xs font-mono",
              activeTab === "problems"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Problems</span>
            {problems.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-950 text-rose-300 text-[10px] border border-rose-800/60 font-semibold">
                {problems.length}
              </span>
            )}
          </button>
        </div>

        {/* Panel Controls */}
        <div className="flex items-center gap-1">
          {activeTab === "output" && onClearLogs && (
            <button
              onClick={onClearLogs}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Clear Output"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title={isMaximized ? "Restore Panel" : "Maximize Panel"}
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Close Panel (Cmd+J)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-zinc-300 select-text bg-zinc-950">
        {activeTab === "terminal" && (
          <div className="h-full flex flex-col justify-between p-3 bg-zinc-900/60 rounded border border-zinc-800/80">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-zinc-400 text-xs">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-zinc-200">RemoteIDE Host Terminal Daemon</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
                Interactive pseudoterminal (PTY) multiplexing and WebSocket execution channels will
                stream live shell sessions in Phase 3.
              </p>
            </div>
            <div className="text-[11px] text-zinc-600 border-t border-zinc-800 pt-2 flex items-center justify-between">
              <span>Ready for PTY attachment</span>
              <span>127.0.0.1:4001</span>
            </div>
          </div>
        )}

        {activeTab === "output" && (
          <div className="space-y-1">
            {logs.length === 0 ? (
              <div className="text-zinc-600 italic py-4 text-center">No output logs recorded.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2.5 leading-5 text-[11px]">
                  <span className="text-zinc-600 select-none shrink-0">{log.timestamp}</span>
                  {log.source && (
                    <span className="text-indigo-400 select-none shrink-0">[{log.source}]</span>
                  )}
                  <span
                    className={
                      log.level === "error"
                        ? "text-rose-400"
                        : log.level === "warn"
                          ? "text-amber-400"
                          : log.level === "success"
                            ? "text-emerald-400"
                            : "text-zinc-300"
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "problems" && (
          <div className="space-y-1">
            {problems.length === 0 ? (
              <div className="text-zinc-500 italic py-4 text-center">
                No problems detected in open documents.
              </div>
            ) : (
              problems.map((prob) => (
                <div
                  key={prob.id}
                  onClick={() => onSelectProblem?.(prob)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-900 cursor-pointer transition-colors text-[11px]"
                >
                  <AlertCircle
                    className={cn(
                      "w-3.5 h-3.5 shrink-0",
                      prob.severity === "error" ? "text-rose-400" : "text-amber-400"
                    )}
                  />
                  <span className="text-zinc-400 font-medium shrink-0">{prob.filePath}</span>
                  {prob.line !== undefined && (
                    <span className="text-zinc-600 select-none">
                      ({prob.line}:{prob.col || 1})
                    </span>
                  )}
                  <span className="text-zinc-200 truncate flex-1">{prob.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
