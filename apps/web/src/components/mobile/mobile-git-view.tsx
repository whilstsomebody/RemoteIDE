"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  RefreshCw,
  Undo2,
  ArrowUp,
  ArrowDown,
  Check,
  AlertTriangle,
} from "lucide-react";
import { GitStatus } from "@remote-ide/shared";
import { gatewayFetch } from "../../lib/api/client";
import { cn } from "@remote-ide/ui";

export interface MobileGitViewProps {
  gatewayUrl?: string;
  workspacePath?: string;
  onRefreshWorkspace?: () => void;
}

export const MobileGitView: React.FC<MobileGitViewProps> = ({
  gatewayUrl = "",
  workspacePath = "",
  onRefreshWorkspace,
}) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!workspacePath) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await gatewayFetch(
        `${gatewayUrl}/api/v1/git/status?path=${encodeURIComponent(workspacePath)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (data.success && data.data) {
        setStatus(data.data);
      }
    } catch {
      setError("Unable to query Git repository state.");
    } finally {
      setIsLoading(false);
    }
  }, [gatewayUrl, workspacePath]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleStageAll = async () => {
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/git/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: workspacePath, files: ["."] }),
      });
      await fetchStatus();
    } catch {
      setError("Failed to stage all changes.");
    }
  };

  const handleUnstageAll = async () => {
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/git/unstage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: workspacePath, files: ["."] }),
      });
      await fetchStatus();
    } catch {
      setError("Failed to unstage changes.");
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsLoading(true);
    try {
      const res = await gatewayFetch(`${gatewayUrl}/api/v1/git/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          path: workspacePath,
          message: commitMessage.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Commit failed");
      }
      setCommitMessage("");
      await fetchStatus();
      if (onRefreshWorkspace) onRefreshWorkspace();
    } catch (err: any) {
      setError(err.message || "Failed to commit changes.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscard = async () => {
    if (!discardTarget) return;
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/git/discard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          path: workspacePath,
          files: discardTarget === "ALL" ? ["."] : [discardTarget],
        }),
      });
      setDiscardTarget(null);
      await fetchStatus();
      if (onRefreshWorkspace) onRefreshWorkspace();
    } catch {
      setError("Failed to discard changes.");
    }
  };

  const handleSync = async (direction: "push" | "pull") => {
    setIsSyncing(true);
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/git/${direction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: workspacePath }),
      });
      await fetchStatus();
      if (onRefreshWorkspace) onRefreshWorkspace();
    } catch {
      setError(`Failed to ${direction} repository.`);
    } finally {
      setIsSyncing(false);
    }
  };

  const totalChanges =
    (status?.staged?.length || 0) +
    (status?.unstaged?.length || 0) +
    (status?.untracked?.length || 0);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 select-none overflow-hidden">
      {/* Header Bar */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-zinc-400" />
          <span className="font-mono text-xs font-semibold text-zinc-200">
            {status?.branch || "main"}
          </span>
          {totalChanges > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-mono text-zinc-300">
              {totalChanges}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleSync("pull")}
            disabled={isSyncing}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition-colors"
            title="Pull"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleSync("push")}
            disabled={isSyncing}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition-colors"
            title="Push"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => void fetchStatus()}
            disabled={isLoading}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition-colors"
            title="Refresh Git Status"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/60 border-b border-rose-800/60 px-3 py-2 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Commit Box */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/30 flex flex-col gap-2 shrink-0">
        <textarea
          rows={2}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          className="w-full bg-zinc-900 border border-zinc-700/80 rounded-md p-2 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || isLoading}
            className="flex-1 min-h-[40px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-zinc-200 rounded-md flex items-center justify-center gap-1.5 text-xs font-medium transition-colors"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Commit</span>
          </button>
          <button
            onClick={handleStageAll}
            className="min-h-[40px] px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-md text-xs font-mono transition-colors"
            title="Stage All"
          >
            + Stage All
          </button>
        </div>
      </div>

      {/* File lists */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
        {/* Staged Changes */}
        {status?.staged && status.staged.length > 0 && (
          <div className="p-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
              <span className="font-semibold">STAGED CHANGES ({status.staged.length})</span>
              <button
                onClick={handleUnstageAll}
                className="text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                Unstage All
              </button>
            </div>
            <div className="space-y-1">
              {status.staged.map((f) => (
                <div
                  key={f.path}
                  className="flex items-center justify-between min-h-[38px] px-2 rounded bg-zinc-900/50 text-xs font-mono"
                >
                  <span className="text-emerald-400 font-medium truncate flex-1">{f.path}</span>
                  <span className="text-[10px] text-zinc-500 uppercase">{f.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unstaged & Untracked Changes */}
        <div className="p-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
            <span className="font-semibold">
              CHANGES ({(status?.unstaged?.length || 0) + (status?.untracked?.length || 0)})
            </span>
            {totalChanges > 0 && (
              <button
                onClick={() => setDiscardTarget("ALL")}
                className="text-[11px] text-rose-400 hover:text-rose-300"
              >
                Discard All
              </button>
            )}
          </div>
          <div className="space-y-1">
            {status?.unstaged?.map((f) => (
              <div
                key={f.path}
                className="flex items-center justify-between min-h-[38px] px-2 rounded bg-zinc-900/30 text-xs font-mono"
              >
                <span className="text-amber-400 truncate flex-1">{f.path}</span>
                <button
                  onClick={() => setDiscardTarget(f.path)}
                  className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                  title="Discard"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {status?.untracked?.map((path) => (
              <div
                key={path}
                className="flex items-center justify-between min-h-[38px] px-2 rounded bg-zinc-900/30 text-xs font-mono"
              >
                <span className="text-zinc-400 truncate flex-1">{path}</span>
                <span className="text-[10px] text-zinc-600">Untracked</span>
              </div>
            ))}
            {totalChanges === 0 && (
              <div className="p-6 text-center text-zinc-500 text-xs font-mono">
                Working tree is clean
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Destructive Discard */}
      {discardTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-semibold text-sm text-zinc-100">Discard Changes</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed font-mono">
              Are you sure you want to discard changes in{" "}
              <span className="text-zinc-200 font-bold">
                {discardTarget === "ALL" ? "all files" : discardTarget.split("/").pop()}
              </span>
              ? Your local edits will be permanently lost.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDiscardTarget(null)}
                className="px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                className="px-3 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 rounded transition-colors"
              >
                Discard Edits
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
