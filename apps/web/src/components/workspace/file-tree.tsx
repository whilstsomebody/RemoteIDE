"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  File,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Trash2,
  Edit2,
  FilePlus,
  FolderPlus,
  Copy,
  SplitSquareVertical,
  Eye,
  EyeOff,
} from "lucide-react";
import { FileNode } from "@remote-ide/shared";

export interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onOpenToSide?: (path: string) => void;
  onRefresh: () => void;
  onCreateItem?: (parentPath: string, name: string, type: "file" | "directory") => Promise<void>;
  onRenameItem?: (oldPath: string, newPath: string) => Promise<void>;
  onDeleteItem?: (path: string) => Promise<void>;
}

export interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

export const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  selectedPath,
  onSelectFile,
  onOpenToSide,
  onRefresh,
  onCreateItem,
  onRenameItem,
  onDeleteItem,
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(["", "src", "apps", "packages"])
  );
  const [filterQuery, setFilterQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  // Inline Creation state: { parentPath, type: 'file' | 'directory' }
  const [creatingIn, setCreatingIn] = useState<{
    parentPath: string;
    type: "file" | "directory";
  } | null>(null);
  const [newEntryName, setNewEntryName] = useState("");

  // Inline Rename state: { oldPath, currentName }
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Context Menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on external click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const getFileIcon = (node: FileNode) => {
    if (node.type === "directory") {
      const isExpanded = expandedDirs.has(node.path);
      return isExpanded ? (
        <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      ) : (
        <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      );
    }

    const name = node.name.toLowerCase();
    if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    }
    if (name.endsWith(".js") || name.endsWith(".jsx")) {
      return <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
    if (name.endsWith(".json")) {
      return <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    }
    if (name.endsWith(".md")) {
      return <FileText className="w-3.5 h-3.5 text-blue-300 shrink-0" />;
    }
    if (name.endsWith(".py")) {
      return <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    }
    if (name.endsWith(".rs")) {
      return <FileCode className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
    }
    if (name.endsWith(".go")) {
      return <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    }
    if (name.endsWith(".css") || name.endsWith(".scss")) {
      return <FileCode className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    }
    if (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".svg") ||
      name.endsWith(".gif")
    ) {
      return <FileText className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
    }

    return <File className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
  };

  // Filter nodes according to exclusion rules and filter query
  const filterNode = (node: FileNode): boolean => {
    if (!showHidden) {
      if (node.name.startsWith(".") && node.name !== ".env.example" && node.name !== ".gitignore") {
        return false;
      }
      if (
        node.name === "node_modules" ||
        node.name === "dist" ||
        node.name === ".next" ||
        node.name === ".turbo" ||
        node.name === ".git"
      ) {
        return false;
      }
    }

    if (!filterQuery.trim()) return true;

    const q = filterQuery.toLowerCase();
    if (node.name.toLowerCase().includes(q)) return true;

    if (node.children) {
      return node.children.some(filterNode);
    }

    return false;
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  const submitCreate = async () => {
    if (!creatingIn || !newEntryName.trim() || !onCreateItem) return;
    const parent = creatingIn.parentPath;
    const name = newEntryName.trim();
    try {
      await onCreateItem(parent, name, creatingIn.type);
      setCreatingIn(null);
      setNewEntryName("");
      setExpandedDirs((prev) => new Set([...prev, parent]));
    } catch (err) {
      console.error("Create item failed:", err);
    }
  };

  const submitRename = async (oldPath: string) => {
    if (!renameValue.trim() || !onRenameItem) {
      setRenamingPath(null);
      return;
    }
    const parts = oldPath.split("/");
    parts.pop();
    const newPath =
      parts.length > 0 ? `${parts.join("/")}/${renameValue.trim()}` : renameValue.trim();

    try {
      await onRenameItem(oldPath, newPath);
      setRenamingPath(null);
      setRenameValue("");
    } catch (err) {
      console.error("Rename failed:", err);
    }
  };

  const renderNodes = (items: FileNode[], level = 0) => {
    return items.filter(filterNode).map((node) => {
      const isSelected = selectedPath === node.path;
      const isDir = node.type === "directory";
      const isExpanded = expandedDirs.has(node.path);
      const isRenaming = renamingPath === node.path;

      return (
        <div key={node.path} className="flex flex-col">
          <div
            onClick={() => {
              if (isDir) {
                toggleDir(node.path);
              } else {
                onSelectFile(node.path);
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, node)}
            style={{ paddingLeft: `${Math.max(6, level * 14)}px` }}
            className={`group flex items-center justify-between py-1 pr-2 rounded text-[11px] cursor-pointer select-none transition-colors ${
              isSelected
                ? "bg-indigo-600/25 text-indigo-200 font-medium border-l-2 border-indigo-500"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            }`}
          >
            <div className="flex items-center gap-1.5 truncate flex-1">
              {isDir && (
                <span className="text-zinc-500">
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
              )}
              {!isDir && <span className="w-3" />}
              {getFileIcon(node)}

              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitRename(node.path);
                    if (e.key === "Escape") setRenamingPath(null);
                  }}
                  onBlur={() => void submitRename(node.path)}
                  className="bg-zinc-950 border border-indigo-500 text-zinc-100 px-1 py-0.5 rounded text-[11px] w-full focus:outline-none"
                />
              ) : (
                <span className="truncate">{node.name}</span>
              )}
            </div>

            {/* Quick Actions Hover */}
            <div className="hidden group-hover:flex items-center gap-1 opacity-80">
              {isDir && onCreateItem && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreatingIn({ parentPath: node.path, type: "file" });
                      setNewEntryName("");
                      setExpandedDirs((prev) => new Set([...prev, node.path]));
                    }}
                    className="p-0.5 hover:text-zinc-100 hover:bg-zinc-700/60 rounded"
                    title="New File in Folder"
                  >
                    <FilePlus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreatingIn({ parentPath: node.path, type: "directory" });
                      setNewEntryName("");
                      setExpandedDirs((prev) => new Set([...prev, node.path]));
                    }}
                    className="p-0.5 hover:text-zinc-100 hover:bg-zinc-700/60 rounded"
                    title="New Subfolder"
                  >
                    <FolderPlus className="w-3 h-3" />
                  </button>
                </>
              )}

              {!isDir && onOpenToSide && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenToSide(node.path);
                  }}
                  className="p-0.5 hover:text-zinc-100 hover:bg-zinc-700/60 rounded"
                  title="Open to Side (Split)"
                >
                  <SplitSquareVertical className="w-3 h-3 text-indigo-400" />
                </button>
              )}
            </div>
          </div>

          {/* Inline creation input if active in this directory */}
          {creatingIn && creatingIn.parentPath === node.path && (
            <div
              style={{ paddingLeft: `${(level + 1) * 14 + 18}px` }}
              className="py-1 pr-2 flex items-center gap-1.5"
            >
              {creatingIn.type === "directory" ? (
                <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              ) : (
                <File className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              )}
              <input
                type="text"
                value={newEntryName}
                autoFocus
                placeholder={creatingIn.type === "directory" ? "folder name..." : "file.ext..."}
                onChange={(e) => setNewEntryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCreate();
                  if (e.key === "Escape") setCreatingIn(null);
                }}
                onBlur={() => {
                  if (!newEntryName.trim()) setCreatingIn(null);
                  else void submitCreate();
                }}
                className="bg-zinc-950 border border-indigo-500 text-zinc-100 px-1 py-0.5 rounded text-[11px] w-full focus:outline-none"
              />
            </div>
          )}

          {/* Children */}
          {isDir && isExpanded && node.children && node.children.length > 0 && (
            <div className="flex flex-col">{renderNodes(node.children, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full text-xs select-none">
      {/* Explorer Controls: Quick Search, Filter, Hidden Files, Refresh */}
      <div className="flex items-center gap-1 mb-2 px-1">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Filter files..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full h-6 px-2 text-[11px] bg-zinc-950 border border-zinc-800 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <button
          onClick={() => setShowHidden(!showHidden)}
          className={`p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors ${
            showHidden ? "bg-indigo-600/30 text-indigo-300" : "hover:bg-zinc-800"
          }`}
          title={showHidden ? "Hide dotfiles & node_modules" : "Show all hidden files"}
        >
          {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>

        {onCreateItem && (
          <>
            <button
              onClick={() => {
                setCreatingIn({ parentPath: "", type: "file" });
                setNewEntryName("");
              }}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="New File at Root"
            >
              <FilePlus className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setCreatingIn({ parentPath: "", type: "directory" });
                setNewEntryName("");
              }}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="New Folder at Root"
            >
              <FolderPlus className="w-3 h-3" />
            </button>
          </>
        )}

        <button
          onClick={onRefresh}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Refresh Explorer"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Inline root creation */}
      {creatingIn && creatingIn.parentPath === "" && (
        <div className="px-2 py-1 mb-1 flex items-center gap-1.5 bg-zinc-900 border border-indigo-500/50 rounded">
          {creatingIn.type === "directory" ? (
            <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          ) : (
            <File className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
          <input
            type="text"
            value={newEntryName}
            autoFocus
            placeholder={creatingIn.type === "directory" ? "folder name..." : "file.ext..."}
            onChange={(e) => setNewEntryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitCreate();
              if (e.key === "Escape") setCreatingIn(null);
            }}
            onBlur={() => {
              if (!newEntryName.trim()) setCreatingIn(null);
              else void submitCreate();
            }}
            className="bg-transparent text-zinc-100 text-[11px] w-full focus:outline-none"
          />
        </div>
      )}

      {/* Nodes List */}
      <div className="flex-1 overflow-y-auto">
        {nodes.length === 0 ? (
          <div className="text-zinc-500 text-center py-6 text-xs">No files in workspace</div>
        ) : (
          renderNodes(nodes)
        )}
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-48 bg-zinc-900 border border-zinc-700/80 rounded-md shadow-2xl py-1 text-xs text-zinc-200 font-sans animate-in fade-in-0 zoom-in-95"
        >
          {contextMenu.node.type === "directory" && onCreateItem && (
            <>
              <button
                onClick={() => {
                  setCreatingIn({ parentPath: contextMenu.node.path, type: "file" });
                  setNewEntryName("");
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-indigo-600 hover:text-white"
              >
                <FilePlus className="w-3.5 h-3.5" />
                <span>New File</span>
              </button>
              <button
                onClick={() => {
                  setCreatingIn({ parentPath: contextMenu.node.path, type: "directory" });
                  setNewEntryName("");
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-indigo-600 hover:text-white"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New Folder</span>
              </button>
              <div className="my-1 border-t border-zinc-800" />
            </>
          )}

          {contextMenu.node.type === "file" && onOpenToSide && (
            <button
              onClick={() => {
                onOpenToSide(contextMenu.node.path);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-indigo-600 hover:text-white"
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span>Open to the Side</span>
            </button>
          )}

          <button
            onClick={() => {
              void navigator.clipboard.writeText(contextMenu.node.path);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-indigo-600 hover:text-white"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Relative Path</span>
          </button>

          {onRenameItem && (
            <button
              onClick={() => {
                setRenamingPath(contextMenu.node.path);
                setRenameValue(contextMenu.node.name);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-indigo-600 hover:text-white"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Rename</span>
            </button>
          )}

          {onDeleteItem && (
            <>
              <div className="my-1 border-t border-zinc-800" />
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to delete ${contextMenu.node.name}?`)) {
                    void onDeleteItem(contextMenu.node.path);
                  }
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-rose-400 hover:bg-rose-600 hover:text-white"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
