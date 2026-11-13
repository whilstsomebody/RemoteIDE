"use client";

import React from "react";
import { X, GitCommit } from "lucide-react";
import { GitDiffFile } from "@remote-ide/shared";

export interface GitDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  diff: GitDiffFile | null;
}

export const GitDiffModal: React.FC<GitDiffModalProps> = ({ isOpen, onClose, diff }) => {
  if (!isOpen || !diff) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ide-sidebar border border-ide-border rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-zinc-300">
        {/* Header */}
        <div className="px-4 py-3 border-b border-ide-border flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-sm text-zinc-100">{diff.file}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              {diff.staged ? "Staged Changes" : "Working Tree Changes"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed bg-[#141417]">
          {diff.hunks.length === 0 ? (
            <div className="text-zinc-500 italic py-8 text-center">
              No diff changes detected for this file.
            </div>
          ) : (
            diff.hunks.map((hunk, hIdx) => (
              <div key={hIdx} className="mb-4 rounded border border-zinc-800 overflow-hidden">
                <div className="bg-indigo-950/40 text-indigo-300 px-3 py-1 text-[11px] border-b border-indigo-900/30">
                  {hunk.header}
                </div>
                <div className="py-1">
                  {hunk.lines.map((line, lIdx) => {
                    const isAdd = line.startsWith("+");
                    const isDel = line.startsWith("-");
                    return (
                      <div
                        key={lIdx}
                        className={`px-3 py-0.5 flex items-start whitespace-pre-wrap ${
                          isAdd
                            ? "bg-emerald-950/30 text-emerald-300"
                            : isDel
                              ? "bg-rose-950/30 text-rose-300"
                              : "text-zinc-400"
                        }`}
                      >
                        <span className="w-6 select-none opacity-40 shrink-0">
                          {isAdd ? "+" : isDel ? "-" : " "}
                        </span>
                        <span className="flex-1">{line.substring(1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-ide-border bg-zinc-900/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
