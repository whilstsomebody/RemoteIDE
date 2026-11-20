"use client";

import React, { useState, useMemo } from "react";
import {
  Folder,
  FolderOpen,
  File,
  Search,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  X,
} from "lucide-react";
import { FileNode } from "@remote-ide/shared";
import { cn } from "@remote-ide/ui";

export interface MobileFileExplorerProps {
  files: FileNode[];
  onOpenFile: (filePath: string) => void;
  onCreateFile?: (parentPath: string, name: string) => Promise<void> | void;
  onCreateFolder?: (parentPath: string, name: string) => Promise<void> | void;
  onDeleteFile?: (filePath: string) => Promise<void> | void;
  activeFilePath?: string | null;
}

export const MobileFileExplorer: React.FC<MobileFileExplorerProps> = ({
  files,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  activeFilePath,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [createName, setCreateName] = useState("");
  const [createParentPath, setCreateParentPath] = useState("");

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Flatten files for search filtering
  const flatFiles = useMemo(() => {
    const result: FileNode[] = [];
    const traverse = (nodes: FileNode[]) => {
      for (const node of nodes) {
        result.push(node);
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(files);
    return result;
  }, [files]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return flatFiles.filter(
      (f) => f.type === "file" && (f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    );
  }, [flatFiles, searchQuery]);

  const handleConfirmDelete = async () => {
    if (deleteConfirmPath && onDeleteFile) {
      await onDeleteFile(deleteConfirmPath);
      setDeleteConfirmPath(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;

    if (createType === "file" && onCreateFile) {
      await onCreateFile(createParentPath, createName.trim());
    } else if (createType === "folder" && onCreateFolder) {
      await onCreateFolder(createParentPath, createName.trim());
    }

    setCreateName("");
    setIsCreateModalOpen(false);
  };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedFolders.has(node.path);
      const isSelected = activeFilePath === node.path;
      const isDirectory = node.type === "directory";

      return (
        <div key={node.path} className="select-none">
          <div
            className={cn(
              "flex items-center justify-between px-3 min-h-[44px] cursor-pointer transition-colors active:bg-zinc-800/80 border-b border-zinc-900/60",
              isSelected ? "bg-zinc-800 text-zinc-100 font-medium" : "text-zinc-300 hover:bg-zinc-900"
            )}
            style={{ paddingLeft: `${Math.max(12, depth * 16 + 12)}px` }}
            onClick={() => {
              if (isDirectory) {
                toggleFolder(node.path);
              } else {
                onOpenFile(node.path);
              }
            }}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0 py-2">
              {isDirectory ? (
                <>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-zinc-400 shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                </>
              ) : (
                <>
                  <span className="w-4 shrink-0" />
                  <File className="w-4 h-4 text-zinc-400 shrink-0" />
                </>
              )}
              <span className="text-sm truncate font-mono">{node.name}</span>
            </div>

            {/* Quick delete touch button */}
            {onDeleteFile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmPath(node.path);
                }}
                className="p-2 text-zinc-500 hover:text-rose-400 active:text-rose-300 transition-colors"
                title={`Delete ${node.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {isDirectory && isExpanded && node.children && (
            <div>{renderTree(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 select-none overflow-hidden">
      {/* Search and Action Bar */}
      <div className="p-2.5 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/60 shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-zinc-900 border border-zinc-700/80 rounded-md pl-8 pr-8 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {(onCreateFile || onCreateFolder) && (
          <button
            onClick={() => {
              setCreateType("file");
              setCreateParentPath("");
              setIsCreateModalOpen(true);
            }}
            className="h-9 px-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        )}
      </div>

      {/* Explorer Tree / Search Results */}
      <div className="flex-1 overflow-y-auto">
        {searchResults !== null ? (
          <div>
            <div className="px-3 py-2 text-[11px] font-mono text-zinc-500 border-b border-zinc-900">
              {searchResults.length} {searchResults.length === 1 ? "match" : "matches"} found
            </div>
            {searchResults.length === 0 ? (
              <div className="p-6 text-center text-zinc-500 text-xs font-mono">
                No matching files found
              </div>
            ) : (
              searchResults.map((file) => (
                <div
                  key={file.path}
                  onClick={() => onOpenFile(file.path)}
                  className={cn(
                    "flex items-center px-3 min-h-[44px] cursor-pointer border-b border-zinc-900/60 active:bg-zinc-800/80 transition-colors",
                    activeFilePath === file.path
                      ? "bg-zinc-800 text-zinc-100 font-medium"
                      : "text-zinc-300 hover:bg-zinc-900"
                  )}
                >
                  <File className="w-4 h-4 text-zinc-400 mr-2.5 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-mono truncate">{file.name}</span>
                    <span className="text-[10px] text-zinc-500 truncate">{file.path}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs font-mono">
            No files in workspace
          </div>
        ) : (
          renderTree(files)
        )}
      </div>

      {/* Confirmation Modal for Destructive Delete */}
      {deleteConfirmPath && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-semibold text-sm text-zinc-100">Confirm Deletion</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed font-mono">
              Are you sure you want to delete <span className="text-zinc-200 font-bold">{deleteConfirmPath.split("/").pop()}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmPath(null)}
                className="px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 rounded transition-colors"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create File / Folder Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 max-w-sm w-full shadow-2xl"
          >
            <h3 className="font-semibold text-sm text-zinc-100 mb-3">
              Create New {createType === "file" ? "File" : "Folder"}
            </h3>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setCreateType("file")}
                className={cn(
                  "flex-1 py-1.5 text-xs rounded border transition-colors",
                  createType === "file"
                    ? "bg-zinc-800 border-zinc-600 text-zinc-100 font-medium"
                    : "border-zinc-800 text-zinc-400"
                )}
              >
                File
              </button>
              <button
                type="button"
                onClick={() => setCreateType("folder")}
                className={cn(
                  "flex-1 py-1.5 text-xs rounded border transition-colors",
                  createType === "folder"
                    ? "bg-zinc-800 border-zinc-600 text-zinc-100 font-medium"
                    : "border-zinc-800 text-zinc-400"
                )}
              >
                Folder
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={createType === "file" ? "example.ts" : "src/components"}
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs font-mono text-zinc-200 mb-4 focus:outline-none focus:border-zinc-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-2 text-xs font-medium text-white bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
