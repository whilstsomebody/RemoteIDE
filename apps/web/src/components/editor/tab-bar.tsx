"use client";

import React from "react";
import { X, Circle, Eye, FileCode, FileText, File, SplitSquareVertical } from "lucide-react";
import { cn } from "@remote-ide/ui";

export interface TabItem {
  path: string;
  isDirty?: boolean;
  deletedOnDisk?: boolean;
}

export interface TabBarProps {
  tabs: TabItem[];
  activeTab: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string, e: React.MouseEvent) => void;
  onSplitEditor?: () => void;
  isSplit?: boolean;
  isMarkdownPreview?: boolean;
  onToggleMarkdownPreview?: () => void;
  showSplitButton?: boolean;
  onNewUntitledFile?: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onSplitEditor,
  isSplit = false,
  isMarkdownPreview = false,
  onToggleMarkdownPreview,
  showSplitButton = true,
  onNewUntitledFile,
}) => {
  const getTabIcon = (path: string) => {
    if (
      path.endsWith(".ts") ||
      path.endsWith(".tsx") ||
      path.endsWith(".js") ||
      path.endsWith(".json")
    ) {
      return <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
    if (path.endsWith(".md") || path.endsWith(".txt")) {
      return <FileText className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    }
    return <File className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
  };

  const isCurrentMarkdown = activeTab?.endsWith(".md") || activeTab?.endsWith(".markdown");

  return (
    <div className="h-9 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between select-none shrink-0 overflow-x-auto text-xs">
      {/* Tabs List */}
      <div
        onDoubleClick={onNewUntitledFile}
        className="flex-1 flex items-center h-full overflow-x-auto no-scrollbar"
        title="Double-click to create new untitled file"
      >
        {tabs.map((tab) => {
          const isActive = tab.path === activeTab;
          const filename = tab.path.split("/").pop() || tab.path;

          return (
            <div
              key={tab.path}
              onClick={() => onSelectTab(tab.path)}
              onDoubleClick={(e) => e.stopPropagation()}
              className={cn(
                "group flex items-center gap-2 px-3 h-full border-r border-zinc-800 cursor-pointer text-xs font-mono transition-colors min-w-[120px] max-w-[200px]",
                isActive
                  ? "bg-zinc-900 text-zinc-100 border-t-2 border-t-indigo-500 font-medium"
                  : "bg-zinc-950/80 text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
              )}
              title={tab.path}
            >
              {getTabIcon(tab.path)}
              <span className="truncate flex-1">
                {filename}
                {tab.deletedOnDisk && (
                  <span className="text-[10px] text-rose-400 ml-1">(deleted)</span>
                )}
              </span>

              {/* Dirty indicator or close button */}
              <div className="flex items-center shrink-0">
                {tab.isDirty ? (
                  <div
                    onClick={(e) => onCloseTab(tab.path, e)}
                    className="w-4 h-4 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    title="Unsaved changes. Click to close."
                  >
                    <Circle className="w-2 h-2 fill-amber-400 text-amber-400 group-hover:hidden" />
                    <X className="w-3 h-3 hidden group-hover:block" />
                  </div>
                ) : (
                  <button
                    onClick={(e) => onCloseTab(tab.path, e)}
                    className="w-4 h-4 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Close file"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Editor Action Toolbar (Split & Markdown Preview) */}
      <div className="flex items-center gap-1 px-2 border-l border-zinc-800/80 shrink-0">
        {isCurrentMarkdown && onToggleMarkdownPreview && (
          <button
            onClick={onToggleMarkdownPreview}
            className={cn(
              "p-1.5 rounded transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
              isMarkdownPreview && "text-indigo-400 bg-indigo-950/50"
            )}
            title={isMarkdownPreview ? "Switch to Code Editor" : "Open Markdown Live Preview"}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}

        {showSplitButton && onSplitEditor && (
          <button
            onClick={onSplitEditor}
            className={cn(
              "p-1.5 rounded transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
              isSplit && "text-indigo-400 bg-indigo-950/50"
            )}
            title={isSplit ? "Close Split Editor" : "Split Editor Right (Cmd+\\)"}
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
