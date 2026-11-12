"use client";

import React, { useState } from "react";
import { FolderGit2, Plus, Check, Trash2, FolderPlus, Laptop } from "lucide-react";
import { Button, Input, Badge } from "@remote-ide/ui";
import { Workspace } from "@remote-ide/shared";

export interface WorkspaceManagerProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (id: string) => void;
  onRegisterWorkspace: (name: string, path: string) => Promise<void>;
  onRemoveWorkspace: (id: string) => Promise<void>;
  hostId?: string;
  hostName?: string;
  platform?: string;
}

export const WorkspaceManager: React.FC<WorkspaceManagerProps> = ({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onRegisterWorkspace,
  onRemoveWorkspace,
  hostId = "host_local",
  hostName = "Local Host",
  platform = "macOS",
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !folderPath.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onRegisterWorkspace(name.trim(), folderPath.trim());
      setName("");
      setFolderPath("");
      setIsAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-xs select-none">
      {/* Host Information Panel */}
      <div className="bg-zinc-950/90 border border-zinc-800/80 rounded-md p-2.5 space-y-1 text-[11px]">
        <div className="flex items-center justify-between font-semibold text-zinc-300">
          <div className="flex items-center gap-1.5">
            <Laptop className="w-3.5 h-3.5 text-indigo-400" />
            <span>Registered Host</span>
          </div>
          <Badge variant="success" className="text-[10px]">
            Loopback Safe
          </Badge>
        </div>
        <div className="flex justify-between text-zinc-400 font-mono text-[10px]">
          <span>
            {hostName} ({platform})
          </span>
          <span className="truncate max-w-[120px]" title={hostId}>
            {hostId}
          </span>
        </div>
      </div>

      {/* Workspaces List Header */}
      <div className="flex items-center justify-between pt-1">
        <span className="font-semibold uppercase tracking-wider text-[10px] text-zinc-400">
          Workspaces ({workspaces.length})
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs text-indigo-400 hover:text-indigo-300"
          onClick={() => setIsAdding(!isAdding)}
          title="Register new host directory"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Register
        </Button>
      </div>

      {/* Add Workspace Form */}
      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-950/90 border border-zinc-800 rounded p-2.5 space-y-2"
        >
          <div className="text-[11px] font-medium text-zinc-200 flex items-center gap-1.5">
            <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
            <span>Register Local Workspace</span>
          </div>
          <Input
            placeholder="Workspace Name (e.g. My App)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 text-xs"
            required
          />
          <Input
            placeholder="Absolute Host Path (/Users/...)"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            className="h-7 text-xs font-mono"
            required
          />
          {error && <p className="text-[10px] text-rose-400">{error}</p>}
          <div className="flex justify-end gap-1.5 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => setIsAdding(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="h-6 text-[11px]"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Registering..." : "Save"}
            </Button>
          </div>
        </form>
      )}

      {/* Registered Workspaces List */}
      <div className="space-y-1 overflow-y-auto max-h-48">
        {workspaces.map((ws) => {
          const isActive = activeWorkspace?.id === ws.id;
          return (
            <div
              key={ws.id}
              onClick={() => onSelectWorkspace(ws.id)}
              className={`group flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${
                isActive
                  ? "bg-zinc-800/90 border-indigo-500/80 text-zinc-100"
                  : "bg-zinc-900/60 border-zinc-800/60 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <FolderGit2
                  className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-indigo-400" : "text-zinc-500"}`}
                />
                <div className="truncate">
                  <div className="font-medium text-[11px] truncate flex items-center gap-1.5">
                    {ws.name}
                    {isActive && <Check className="w-3 h-3 text-emerald-400" />}
                  </div>
                  <div className="text-[9px] text-zinc-500 font-mono truncate">
                    {ws.folders[0]?.path}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    confirm(`Remove workspace "${ws.name}" from RemoteIDE? (Files remain on disk)`)
                  ) {
                    void onRemoveWorkspace(ws.id);
                  }
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-opacity"
                title="Remove from RemoteIDE"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {workspaces.length === 0 && (
          <p className="text-[11px] text-zinc-500 py-2 text-center">
            No workspaces registered yet. Register a local project directory above.
          </p>
        )}
      </div>
    </div>
  );
};
