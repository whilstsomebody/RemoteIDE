"use client";

import { gatewayFetch } from "../../lib/api/client";

import React, { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  Undo2,
  ArrowUp,
  ArrowDown,
  Archive,
  Check,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { GitStatus, GitBranch as GitBranchType, GitDiffFile } from "@remote-ide/shared";
import { GitDiffModal } from "./git-diff-modal";

export interface SourceControlPanelProps {
  gatewayUrl?: string;
  workspacePath?: string;
  onRefreshWorkspace?: () => void;
}

export const SourceControlPanel: React.FC<SourceControlPanelProps> = ({
  gatewayUrl = "",
  workspacePath = "",
  onRefreshWorkspace,
}) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [isAmending, setIsAmending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDiff, setSelectedDiff] = useState<GitDiffFile | null>(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);

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
      if (!res.ok) {
        throw new Error(`Failed to fetch Git status (${res.status})`);
      }
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error fetching Git status");
    } finally {
      setIsLoading(false);
    }
  }, [gatewayUrl, workspacePath]);

  const fetchBranches = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const res = await gatewayFetch(
        `${gatewayUrl}/api/v1/git/branches?path=${encodeURIComponent(workspacePath)}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBranches(data.data);
        }
      }
    } catch {
      // Ignored
    }
  }, [gatewayUrl, workspacePath]);

  useEffect(() => {
    fetchStatus();
    fetchBranches();
  }, [fetchStatus, fetchBranches]);

  const handleStage = async (paths?: string[], all = false) => {
    setIsLoading(true);
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/git/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ repoPath: workspacePath, paths, all }),
      });
      await fetchStatus();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to stage changes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnstage = async (paths?: string[], all = false) => {
    setIsLoading(true);
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/git/unstage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ repoPath: workspacePath, paths, all }),
      });
      await fetchStatus();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to unstage changes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDiscard = async () => {
    if (!discardTarget) return;
    setIsLoading(true);
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/git/discard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          repoPath: workspacePath,
          paths: [discardTarget],
          confirmed: true,
        }),
      });
      setDiscardTarget(null);
      await fetchStatus();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to discard changes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await gatewayFetch(`${gatewayUrl}/api/v1/git/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          repoPath: workspacePath,
          message: commitMessage.trim(),
          amend: isAmending,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to commit");
      }
      setCommitMessage("");
      setIsAmending(false);
      await fetchStatus();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to commit changes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async (action: "pull" | "push" | "fetch") => {
    setIsSyncing(true);
    setError(null);
    try {
      const res = await gatewayFetch(`${gatewayUrl}/api/v1/git/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ repoPath: workspacePath }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || `Failed to ${action}`);
      }
      await fetchStatus();
      await fetchBranches();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await gatewayFetch(`${gatewayUrl}/api/v1/git/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ repoPath: workspacePath, branch: branchName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to switch branch");
      }
      await fetchStatus();
      await fetchBranches();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to switch branch");
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDiff = async (file: string, staged: boolean) => {
    try {
      const res = await gatewayFetch(
        `${gatewayUrl}/api/v1/git/diff?path=${encodeURIComponent(
          workspacePath
        )}&file=${encodeURIComponent(file)}&staged=${staged}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          setSelectedDiff(data.data[0]);
          setIsDiffModalOpen(true);
        }
      }
    } catch {
      // Ignored
    }
  };

  const handleStash = async (action: "push" | "pop") => {
    setIsLoading(true);
    try {
      await gatewayFetch(`${gatewayUrl}/api/v1/git/stash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          repoPath: workspacePath,
          action,
          message: action === "push" ? "WIP stash from RemoteIDE" : undefined,
        }),
      });
      await fetchStatus();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed stash operation");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-xs text-zinc-300 overflow-y-auto select-none">
      <div className="p-3 border-b border-ide-border bg-zinc-900/50 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-zinc-200">
            <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={status?.branch || "main"}
              onChange={(e) => handleSwitchBranch(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            >
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} {b.current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleStash("push")}
              title="Stash Changes"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={fetchStatus}
              title="Refresh Status"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {status?.tracking && (
          <div className="flex items-center justify-between text-[11px] text-zinc-400 bg-zinc-800/40 px-2 py-1 rounded">
            <span>{status.tracking}</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5 text-emerald-400" title="Ahead">
                <ArrowUp className="w-3 h-3" /> {status.ahead}
              </span>
              <span className="flex items-center gap-0.5 text-indigo-400" title="Behind">
                <ArrowDown className="w-3 h-3" /> {status.behind}
              </span>
              <button
                onClick={() => handleSync("pull")}
                disabled={isSyncing}
                className="px-1.5 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-200 font-medium"
              >
                Sync
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-2 bg-rose-950/50 border-b border-rose-800/50 text-rose-300 text-[11px] flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="p-3 border-b border-ide-border flex flex-col gap-2">
        <textarea
          rows={3}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message (Ctrl+Enter to commit)"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              handleCommit();
            }
          }}
          className="w-full bg-[#1e1e24] border border-zinc-700/80 rounded p-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none font-mono"
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={isAmending}
              onChange={(e) => setIsAmending(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
            />
            Amend
          </label>

          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || isLoading}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-white font-medium text-xs flex items-center gap-1.5 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Commit
          </button>
        </div>
      </div>

      <div className="p-2 border-b border-ide-border">
        <div className="flex items-center justify-between py-1 text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">
          <span>Staged Changes ({status?.staged.length || 0})</span>
          {status && status.staged.length > 0 && (
            <button
              onClick={() => handleUnstage(undefined, true)}
              title="Unstage All"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <Minus className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-0.5 mt-1">
          {status?.staged.map((f) => (
            <div
              key={f.path}
              className="flex items-center justify-between px-2 py-1 rounded hover:bg-zinc-800/60 group"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span
                  className={`text-[10px] font-bold w-3.5 text-center ${
                    f.status === "added"
                      ? "text-emerald-400"
                      : f.status === "deleted"
                        ? "text-rose-400"
                        : "text-amber-400"
                  }`}
                >
                  {f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M"}
                </span>
                <span className="truncate text-zinc-200">{f.path}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleViewDiff(f.path, true)}
                  title="View Diff"
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-300"
                >
                  <Eye className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleUnstage([f.path])}
                  title="Unstage File"
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-300"
                >
                  <Minus className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {status?.staged.length === 0 && (
            <div className="text-zinc-600 italic px-2 py-1">No staged changes</div>
          )}
        </div>
      </div>

      <div className="p-2 border-b border-ide-border">
        <div className="flex items-center justify-between py-1 text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">
          <span>Changes ({status?.unstaged.length || 0})</span>
          {status && status.unstaged.length > 0 && (
            <button
              onClick={() => handleStage(undefined, true)}
              title="Stage All"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-0.5 mt-1">
          {status?.unstaged.map((f) => (
            <div
              key={f.path}
              className="flex items-center justify-between px-2 py-1 rounded hover:bg-zinc-800/60 group"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span
                  className={`text-[10px] font-bold w-3.5 text-center ${
                    f.status === "conflicted" ? "text-rose-500 font-black" : "text-amber-400"
                  }`}
                >
                  {f.status === "conflicted" ? "!" : "M"}
                </span>
                <span className="truncate text-zinc-200">{f.path}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleViewDiff(f.path, false)}
                  title="View Diff"
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-300"
                >
                  <Eye className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setDiscardTarget(f.path)}
                  title="Discard Changes"
                  className="p-1 rounded hover:bg-rose-950 hover:text-rose-300 text-zinc-400"
                >
                  <Undo2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleStage([f.path])}
                  title="Stage File"
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-300"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {status?.unstaged.length === 0 && (
            <div className="text-zinc-600 italic px-2 py-1">No unstaged changes</div>
          )}
        </div>
      </div>

      <div className="p-2">
        <div className="flex items-center justify-between py-1 text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">
          <span>Untracked Files ({status?.untracked.length || 0})</span>
        </div>

        <div className="flex flex-col gap-0.5 mt-1">
          {status?.untracked.map((path) => (
            <div
              key={path}
              className="flex items-center justify-between px-2 py-1 rounded hover:bg-zinc-800/60 group"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-[10px] font-bold w-3.5 text-center text-emerald-500">U</span>
                <span className="truncate text-zinc-200">{path}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleStage([path])}
                  title="Stage File"
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-300"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <GitDiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        diff={selectedDiff}
      />

      {discardTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-ide-sidebar border border-ide-border rounded-lg p-4 shadow-xl max-w-sm w-full text-zinc-200 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" />
              Discard Local Changes?
            </div>
            <p className="text-xs text-zinc-400">
              Are you sure you want to discard changes in{" "}
              <code className="text-zinc-200">{discardTarget}</code>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDiscardTarget(null)}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-xs text-white font-medium"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
