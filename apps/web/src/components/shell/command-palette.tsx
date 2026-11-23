"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  FileText,
  Save,
  Columns,
  Terminal,
  Type,
  Palette,
  FolderPlus,
  FilePlus,
  ArrowRight,
  Sparkles,
  Bot,
  AlertTriangle,
} from "lucide-react";
import { FileNode, Workspace } from "@remote-ide/shared";

export interface CommandItem {
  id: string;
  title: string;
  category: "File" | "Editor" | "View" | "Workspace" | "Preferences" | "AI";
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileNode[];
  workspaces: Workspace[];
  onOpenFile: (path: string) => void;
  onSaveFile: () => void;
  onSaveAll: () => void;
  onToggleSplit: () => void;
  onToggleBottomPanel: () => void;
  onToggleWordWrap: () => void;
  onChangeTheme: (theme: "remoteide-dark" | "one-dark" | "high-contrast") => void;
  onChangeFontSize: (size: number) => void;
  onSelectWorkspace: (id: string) => void;
  onCreateFilePrompt: () => void;
  onCreateFolderPrompt: () => void;
  onTriggerAiAction?: (action: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  files,
  workspaces,
  onOpenFile,
  onSaveFile,
  onSaveAll,
  onToggleSplit,
  onToggleBottomPanel,
  onToggleWordWrap,
  onChangeTheme,
  onChangeFontSize,
  onSelectWorkspace,
  onCreateFilePrompt,
  onCreateFolderPrompt,
  onTriggerAiAction,
}) => {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Flatten file nodes
  const flattenedFiles = useMemo(() => {
    const list: string[] = [];
    const traverse = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === "file") list.push(node.path);
        if (node.children) traverse(node.children);
      }
    };
    traverse(files);
    return list;
  }, [files]);

  // Built-in commands
  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "save-file",
        title: "File: Save",
        category: "File",
        shortcut: "Cmd+S",
        icon: Save,
        action: onSaveFile,
      },
      {
        id: "save-all",
        title: "File: Save All",
        category: "File",
        shortcut: "Cmd+Shift+S",
        icon: Save,
        action: onSaveAll,
      },
      {
        id: "new-file",
        title: "File: New File",
        category: "File",
        icon: FilePlus,
        action: onCreateFilePrompt,
      },
      {
        id: "new-folder",
        title: "File: New Folder",
        category: "File",
        icon: FolderPlus,
        action: onCreateFolderPrompt,
      },
      {
        id: "toggle-split",
        title: "View: Toggle Split Editor",
        category: "View",
        shortcut: "Cmd+\\",
        icon: Columns,
        action: onToggleSplit,
      },
      {
        id: "toggle-terminal",
        title: "View: Toggle Bottom Panel",
        category: "View",
        shortcut: "Cmd+J",
        icon: Terminal,
        action: onToggleBottomPanel,
      },
      {
        id: "toggle-wrap",
        title: "Editor: Toggle Word Wrap",
        category: "Editor",
        icon: Type,
        action: onToggleWordWrap,
      },
      {
        id: "theme-remoteide",
        title: "Preferences: Theme - RemoteIDE Dark",
        category: "Preferences",
        icon: Palette,
        action: () => onChangeTheme("remoteide-dark"),
      },
      {
        id: "theme-onedark",
        title: "Preferences: Theme - One Dark",
        category: "Preferences",
        icon: Palette,
        action: () => onChangeTheme("one-dark"),
      },
      {
        id: "theme-contrast",
        title: "Preferences: Theme - High Contrast Dark",
        category: "Preferences",
        icon: Palette,
        action: () => onChangeTheme("high-contrast"),
      },
      {
        id: "font-12",
        title: "Preferences: Font Size - 12px",
        category: "Preferences",
        icon: Type,
        action: () => onChangeFontSize(12),
      },
      {
        id: "font-14",
        title: "Preferences: Font Size - 14px",
        category: "Preferences",
        icon: Type,
        action: () => onChangeFontSize(14),
      },
      {
        id: "font-16",
        title: "Preferences: Font Size - 16px",
        category: "Preferences",
        icon: Type,
        action: () => onChangeFontSize(16),
      },
      ...workspaces.map((ws) => ({
        id: `ws-${ws.id}`,
        title: `Workspace: Switch to ${ws.name}`,
        category: "Workspace" as const,
        icon: ArrowRight,
        action: () => onSelectWorkspace(ws.id),
      })),
      {
        id: "ai-explain-code",
        title: "Gemini: Explain Selected Code",
        category: "AI" as const,
        icon: Sparkles,
        action: () => onTriggerAiAction?.("explain_code"),
      },
      {
        id: "ai-suggest-fix",
        title: "Gemini: Suggest Fix for Current Error",
        category: "AI" as const,
        icon: AlertTriangle,
        action: () => onTriggerAiAction?.("suggest_fix"),
      },
      {
        id: "ai-example-code",
        title: "Gemini: Generate Example Code",
        category: "AI" as const,
        icon: Bot,
        action: () => onTriggerAiAction?.("example_code"),
      },
      {
        id: "ai-explain-terminal",
        title: "Gemini: Explain Terminal Output",
        category: "AI" as const,
        icon: Terminal,
        action: () => onTriggerAiAction?.("explain_terminal"),
      },
      {
        id: "ai-ask-selection",
        title: "Gemini: Ask a Question About Selected Code",
        category: "AI" as const,
        icon: Sparkles,
        action: () => onTriggerAiAction?.("ask_selection"),
      },
    ],
    [
      onSaveFile,
      onSaveAll,
      onCreateFilePrompt,
      onCreateFolderPrompt,
      onToggleSplit,
      onToggleBottomPanel,
      onToggleWordWrap,
      onChangeTheme,
      onChangeFontSize,
      workspaces,
      onSelectWorkspace,
      onTriggerAiAction,
    ]
  );

  // Filtered list of items: if starts with `>` only commands, if regular text both commands and files
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return commands.slice(0, 15).map((cmd) => ({ type: "command" as const, item: cmd }));
    }

    if (q.startsWith(">")) {
      const cmdQuery = q.slice(1).trim();
      return commands
        .filter((c) => c.title.toLowerCase().includes(cmdQuery))
        .map((cmd) => ({ type: "command" as const, item: cmd }));
    }

    const matchedFiles = flattenedFiles
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, 8)
      .map((path) => ({ type: "file" as const, item: path }));

    const matchedCommands = commands
      .filter((c) => c.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((cmd) => ({ type: "command" as const, item: cmd }));

    return [...matchedFiles, ...matchedCommands];
  }, [search, commands, flattenedFiles]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = items[selectedIndex];
      if (current) {
        if (current.type === "command") {
          current.item.action();
        } else {
          onOpenFile(current.item);
        }
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl overflow-hidden flex flex-col font-sans animate-in fade-in-0 zoom-in-95"
      >
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 bg-zinc-950">
          <Search className="w-4 h-4 text-zinc-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or file name (e.g. '> theme' or 'page.tsx')..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-1 text-xs">
          {items.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">No matching commands or files</div>
          ) : (
            items.map((entry, idx) => {
              const isSelected = idx === selectedIndex;

              if (entry.type === "file") {
                const path = entry.item;
                const filename = path.split("/").pop() || path;
                return (
                  <div
                    key={`file-${path}`}
                    onClick={() => {
                      onOpenFile(path);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-indigo-600/30 text-indigo-200"
                        : "text-zinc-300 hover:bg-zinc-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="font-medium text-zinc-100">{filename}</span>
                      <span className="text-[11px] text-zinc-500 truncate">{path}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 uppercase font-mono">File</span>
                  </div>
                );
              }

              const cmd = entry.item;
              const Icon = cmd.icon;
              return (
                <div
                  key={`cmd-${cmd.id}`}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-indigo-600/30 text-indigo-200"
                      : "text-zinc-300 hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="font-medium">{cmd.title}</span>
                  </div>

                  {cmd.shortcut && (
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700/80 rounded">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
