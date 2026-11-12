"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { FileNode } from "@remote-ide/shared";

export interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onRefresh: () => void;
  onCreateFile?: (parentPath: string) => void;
  onDeleteFile?: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  selectedPath,
  onSelectFile,
  onRefresh,
  onDeleteFile,
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["", "src"]));

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

    if (
      node.name.endsWith(".ts") ||
      node.name.endsWith(".tsx") ||
      node.name.endsWith(".js") ||
      node.name.endsWith(".json")
    ) {
      return <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }

    if (node.name.endsWith(".md") || node.name.endsWith(".txt")) {
      return <FileText className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    }

    return <File className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
  };

  const renderNodes = (items: FileNode[], level: number = 0) => {
    return items.map((node) => {
      const isSelected = selectedPath === node.path;
      const isDir = node.type === "directory";
      const isExpanded = expandedDirs.has(node.path);

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
            style={{ paddingLeft: `${Math.max(6, level * 14)}px` }}
            className={`group flex items-center justify-between py-1 pr-2 rounded text-[11px] cursor-pointer select-none transition-colors ${
              isSelected
                ? "bg-indigo-600/25 text-indigo-200 font-medium border-l-2 border-indigo-500"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              {isDir && (
                <span className="text-zinc-500">
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
              )}
              {getFileIcon(node)}
              <span className="truncate">{node.name}</span>
            </div>

            {onDeleteFile && !isDir && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete ${node.name}?`)) {
                    onDeleteFile(node.path);
                  }
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-rose-400 transition-opacity"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {isDir && isExpanded && node.children && node.children.length > 0 && (
            <div className="flex flex-col">{renderNodes(node.children, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800/80 text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">
        <span>Files</span>
        <button
          onClick={onRefresh}
          className="p-1 hover:text-zinc-200 transition-colors"
          title="Refresh tree"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1 font-mono">
        {nodes.length > 0 ? (
          renderNodes(nodes)
        ) : (
          <p className="text-[11px] text-zinc-500 p-3 text-center">Empty directory</p>
        )}
      </div>
    </div>
  );
};
