"use client";

import React, { useState } from "react";
import { GitFork, X, Check } from "lucide-react";
import { Input, Button } from "@remote-ide/ui";

export interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCloneRepo: (repoUrl: string, targetName: string) => Promise<void>;
}

export const CloneRepoModal: React.FC<CloneRepoModalProps> = ({ isOpen, onClose, onCloneRepo }) => {
  const [repoUrl, setRepoUrl] = useState("");
  const [targetName, setTargetName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUrlChange = (url: string) => {
    setRepoUrl(url);
    const cleaned =
      url
        .replace(/\.git$/, "")
        .split("/")
        .filter(Boolean)
        .pop() || "";
    if (cleaned && !targetName) {
      setTargetName(cleaned);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    const name =
      targetName.trim() ||
      repoUrl
        .replace(/\.git$/, "")
        .split("/")
        .filter(Boolean)
        .pop() ||
      "cloned-repo";
    setIsSubmitting(true);
    setError(null);

    try {
      await onCloneRepo(repoUrl.trim(), name);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to clone repository");
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
            <GitFork className="w-4 h-4 text-[#0e639c]" />
            <span>Clone Repository on Host</span>
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
            <label className="font-medium text-zinc-200">Repository URL</label>
            <Input
              type="text"
              placeholder="https://github.com/owner/repository.git"
              value={repoUrl}
              autoFocus
              onChange={(e) => handleUrlChange(e.target.value)}
              className="bg-[#1e1e1e] border-[#3c3c3c] text-zinc-100 placeholder:text-zinc-500 font-mono text-xs h-8"
            />
            <p className="text-[11px] text-zinc-500">
              Provide a public or authenticated HTTPS/SSH Git repository URL.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-zinc-200">Target Folder Name</label>
            <Input
              type="text"
              placeholder="repository"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              className="bg-[#1e1e1e] border-[#3c3c3c] text-zinc-100 text-xs h-8"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded text-rose-300 text-xs">
              {error}
            </div>
          )}

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
              disabled={isSubmitting || !repoUrl.trim()}
              className="h-8 px-4 bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow transition-colors"
            >
              {isSubmitting ? (
                <span>Cloning...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Clone & Open</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
