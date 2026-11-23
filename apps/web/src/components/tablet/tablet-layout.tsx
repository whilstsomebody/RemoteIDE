"use client";

import React, { useState, useEffect, useRef } from "react";
import { Terminal, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@remote-ide/ui";

export interface TabletLayoutProps {
  sidebarContent: React.ReactNode;
  editorContent: React.ReactNode;
  terminalContent: React.ReactNode;
  isPortrait?: boolean;
  onSave?: () => void;
  onQuickOpen?: () => void;
  onCommandPalette?: () => void;
}

export const TabletLayout: React.FC<TabletLayoutProps> = ({
  sidebarContent,
  editorContent,
  terminalContent,
  isPortrait = false,
  onSave,
  onQuickOpen,
  onCommandPalette,
}) => {
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeRightPanel, setActiveRightPanel] = useState<"terminal" | "hidden">("terminal");
  const [splitRatio, setSplitRatio] = useState<number>(0.5); // 50% split by default

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === "s") {
        e.preventDefault();
        onSave?.();
      } else if (isMeta && e.key === "p") {
        e.preventDefault();
        onQuickOpen?.();
      } else if (isMeta && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        onCommandPalette?.();
      } else if (isMeta && e.key === "b") {
        e.preventDefault();
        setShowSidebar((prev) => !prev);
      } else if (isMeta && e.key === "`") {
        e.preventDefault();
        setActiveRightPanel((prev) => (prev === "terminal" ? "hidden" : "terminal"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, onQuickOpen, onCommandPalette]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (isPortrait) {
        const relativeY = moveEvent.clientY - rect.top;
        const ratio = Math.max(0.2, Math.min(0.8, relativeY / rect.height));
        setSplitRatio(ratio);
      } else {
        const relativeX = moveEvent.clientX - rect.left;
        const ratio = Math.max(0.25, Math.min(0.75, relativeX / rect.width));
        setSplitRatio(ratio);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className="flex h-full w-full bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {showSidebar && (
        <aside className="w-64 border-r border-zinc-800 bg-zinc-900/60 flex flex-col shrink-0 overflow-hidden">
          <div className="h-9 px-3 border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400 shrink-0">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Explorer</span>
            <button
              onClick={() => setShowSidebar(false)}
              className="p-1 hover:text-zinc-200 transition-colors"
              title="Hide Sidebar (Cmd+B)"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{sidebarContent}</div>
        </aside>
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="h-8 px-2 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            {!showSidebar && (
              <button
                onClick={() => setShowSidebar(true)}
                className="p-1 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                title="Show Sidebar (Cmd+B)"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-[11px] font-mono text-zinc-500">
              Tablet Mode • {isPortrait ? "Portrait" : "Landscape"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setActiveRightPanel((prev) => (prev === "terminal" ? "hidden" : "terminal"))
              }
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors",
                activeRightPanel === "terminal"
                  ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Toggle Terminal Panel"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Terminal</span>
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className={cn(
            "flex flex-1 min-h-0 overflow-hidden relative",
            isPortrait ? "flex-col" : "flex-row"
          )}
        >
          <div
            style={{
              [isPortrait ? "height" : "width"]:
                activeRightPanel === "hidden" ? "100%" : `${splitRatio * 100}%`,
            }}
            className="flex-1 min-h-0 min-w-0 overflow-hidden relative"
          >
            {editorContent}
          </div>

          {activeRightPanel !== "hidden" && (
            <div
              onMouseDown={handleMouseDown}
              className={cn(
                "bg-zinc-800 hover:bg-zinc-600 transition-colors z-20 shrink-0",
                isPortrait
                  ? "h-1.5 w-full cursor-row-resize border-y border-zinc-900"
                  : "w-1.5 h-full cursor-col-resize border-x border-zinc-900"
              )}
            />
          )}

          {activeRightPanel !== "hidden" && (
            <div
              style={{
                [isPortrait ? "height" : "width"]: `${(1 - splitRatio) * 100}%`,
              }}
              className="flex-1 min-h-0 min-w-0 overflow-hidden relative bg-zinc-950"
            >
              {terminalContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
