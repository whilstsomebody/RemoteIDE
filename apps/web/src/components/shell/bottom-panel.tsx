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
  Activity,
  Layers,
  Globe,
  Send,
  ExternalLink,
} from "lucide-react";
import { cn } from "@remote-ide/ui";
import { TerminalContainer } from "../terminal/terminal-container";
import { QuickLauncher } from "../tasks/quick-launcher";
import { ProcessPanel } from "../processes/process-panel";
import { PortsPanel } from "../preview/ports-panel";
import { PreviewTab } from "../preview/preview-tab";
import { ApiClientPanel } from "../api-client/api-client-panel";
import { ProblemsPanel } from "../problems/problems-panel";

export type BottomPanelTab =
  "terminal" | "tasks" | "processes" | "ports" | "preview" | "apiclient" | "output" | "problems";

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
  gatewayUrl?: string;
  workspacePath?: string;
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
  gatewayUrl,
  workspacePath,
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
      <div
        onMouseDown={handleMouseDown}
        className="h-1 bg-transparent hover:bg-zinc-600 cursor-row-resize transition-colors absolute top-0 left-0 right-0 z-30"
      />

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
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => onSelectTab("tasks")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-xs font-mono",
              activeTab === "tasks"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Tasks</span>
          </button>

          <button
            onClick={() => onSelectTab("processes")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-xs font-mono",
              activeTab === "processes"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Processes</span>
          </button>

          <button
            onClick={() => onSelectTab("ports")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-xs font-mono",
              activeTab === "ports"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Ports</span>
          </button>

          <button
            onClick={() => onSelectTab("preview")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-xs font-mono",
              activeTab === "preview"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>

          <button
            onClick={() => onSelectTab("apiclient")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-xs font-mono",
              activeTab === "apiclient"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Send className="w-3.5 h-3.5" />
            <span>API Client</span>
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
            <FileText className="w-3.5 h-3.5" />
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
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Problems</span>
            {problems.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 text-[10px] border border-zinc-700/60 font-medium">
                {problems.length}
              </span>
            )}
          </button>
        </div>

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

      <div className="flex-1 overflow-hidden font-mono text-xs text-zinc-300 select-text bg-[#09090b]">
        {activeTab === "terminal" && (
          <div className="h-full w-full">
            <TerminalContainer gatewayUrl={gatewayUrl} />
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="h-full w-full">
            <QuickLauncher gatewayUrl={gatewayUrl} workspacePath={workspacePath} />
          </div>
        )}

        {activeTab === "processes" && (
          <div className="h-full w-full">
            <ProcessPanel
              gatewayUrl={gatewayUrl}
              workspaceId="default"
              workspacePath={workspacePath}
            />
          </div>
        )}

        {activeTab === "ports" && (
          <div className="h-full w-full">
            <PortsPanel gatewayUrl={gatewayUrl} onOpenPreview={() => onSelectTab("preview")} />
          </div>
        )}

        {activeTab === "preview" && (
          <div className="h-full w-full">
            <PreviewTab gatewayUrl={gatewayUrl} />
          </div>
        )}

        {activeTab === "apiclient" && (
          <div className="h-full w-full">
            <ApiClientPanel gatewayUrl={gatewayUrl} />
          </div>
        )}

        {activeTab === "output" && (
          <div className="h-full overflow-y-auto p-3 space-y-1">
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
          <div className="h-full w-full">
            <ProblemsPanel
              problems={problems.map((p) => ({
                id: p.id,
                workspaceId: "default",
                filePath: p.filePath,
                line: p.line || 1,
                col: p.col || 1,
                message: p.message,
                severity: p.severity,
                source: (p as any).source || "lsp",
                code: (p as any).code,
              }))}
              onSelectProblem={(p) =>
                onSelectProblem?.({
                  id: p.id,
                  filePath: p.filePath,
                  line: p.line,
                  col: p.col,
                  message: p.message,
                  severity: p.severity === "hint" ? "info" : p.severity,
                })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};
