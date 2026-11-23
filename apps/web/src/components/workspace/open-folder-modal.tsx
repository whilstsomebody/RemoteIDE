"use client";

import React, { useState, useEffect } from "react";
import { FolderOpen, X, Check } from "lucide-react";
import { Input, Button } from "@remote-ide/ui";

export interface OpenFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFolder: (name: string, path: string) => Promise<void>;
  defaultPath?: string;
}

export const OpenFolderModal: React.FC<OpenFolderModalProps> = ({
  isOpen,
  onClose,
  onOpenFolder,
  defaultPath = "",
}) => {
  const [folderPath, setFolderPath] = useState(defaultPath);
  const [workspaceName, setWorkspaceName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (defaultPath && !folderPath) {
        setFolderPath(defaultPath);
        const autoName = defaultPath.split("/").filter(Boolean).pop() || "Workspace";
        setWorkspaceName(autoName);
      }
    }
  }, [isOpen, defaultPath, folderPath]);

  const handlePathChange = (val: string) => {
    setFolderPath(val);
    const inferred = val.split("/").filter(Boolean).pop() || "";
    if (inferred) setWorkspaceName(inferred);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) return;

    const name = workspaceName.trim() || folderPath.split("/").filter(Boolean).pop() || "Project";
    setIsSubmitting(true);
    setError(null);

    try {
      await onOpenFolder(name, folderPath.trim());
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to open folder on host");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/70 backdrop-blur-sm p-4 animate-in fade-in-0"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden flex flex-col font-sans"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c] bg-[#1e1e1e]">
          <div className="flex items-center gap-2 text-zinc-100 font-medium text-sm">
            <FolderOpen className="w-4 h-4 text-[#0e639c]" />
            <span>Open Folder on Host</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs text-zinc-300">
          <div className="space-y-1.5">
            <label className="font-medium text-zinc-200">Host Folder Path</label>
            <Input
              type="text"
              placeholder="/Users/username/Projects/my-app or ./my-app"
              value={folderPath}
              autoFocus
              onChange={(e) => handlePathChange(e.target.value)}
              className="bg-[#1e1e1e] border-[#3c3c3c] text-zinc-100 placeholder:text-zinc-500 font-mono text-xs h-8"
            />
            <p className="text-[11px] text-zinc-500">
              Enter the absolute or relative path of the project folder located on your host
              computer.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-zinc-200">Workspace Display Name</label>
            <Input
              type="text"
              placeholder="e.g. RemoteIDE"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="bg-[#1e1e1e] border-[#3c3c3c] text-zinc-100 text-xs h-8"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] text-zinc-400">Current Host Workspace:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePathChange("/Users/aman/Documents/Project/RemoteIDE")}
                className="px-2.5 py-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded hover:border-zinc-500 font-mono text-[11px] text-zinc-300 truncate max-w-full text-left"
              >
                /Users/aman/Documents/Project/RemoteIDE
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#3c3c3c]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="border-[#3c3c3c] bg-[#1e1e1e] text-zinc-300 hover:bg-zinc-800 text-xs h-8"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={isSubmitting || !folderPath.trim()}
              className="h-8 px-4 bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow transition-colors"
            >
              {isSubmitting ? (
                <span>Opening...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Open Folder</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
