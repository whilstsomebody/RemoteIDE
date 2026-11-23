"use client";

import React, { useEffect, useState } from "react";
import { X, Loader2, GitCompare } from "lucide-react";
import { Button } from "@remote-ide/ui";
import { gatewayFetch } from "../../lib/api/client";
import { FileDiffResult } from "@remote-ide/shared";

export interface DiffViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  filePath: string;
  fromRevision?: number;
  toRevision?: number;
}

export const DiffViewerModal: React.FC<DiffViewerModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  filePath,
  fromRevision,
  toRevision,
}) => {
  const [diffData, setDiffData] = useState<FileDiffResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !filePath || !workspaceId) return;

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const query = new URLSearchParams({
      workspaceId,
      path: filePath,
    });
    if (fromRevision !== undefined) query.set("fromRevision", fromRevision.toString());
    if (toRevision !== undefined) query.set("toRevision", toRevision.toString());

    gatewayFetch(`/api/v1/catchup/diff?${query.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load file diff");
        return res.json();
      })
      .then((body) => {
        if (!isCancelled) {
          if (body.success && body.data) {
            setDiffData(body.data);
          } else {
            setError(body.error?.message || "Failed to load diff");
          }
        }
      })
      .catch((err: Error) => {
        if (!isCancelled) {
          setError(err.message || "Network error loading diff");
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, workspaceId, filePath, fromRevision, toRevision]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in-0 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-200"
      >
        <div className="flex items-center justify-between px-4 py-3 bg-[#1e1e1e] border-b border-[#3c3c3c]">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-sm text-zinc-100">File Diff: {filePath}</span>
            {fromRevision !== undefined && toRevision !== undefined && (
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
                rev {fromRevision} → {toRevision}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed select-text">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span>Comparing file versions...</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 rounded">
              {error}
            </div>
          )}

          {!isLoading && !error && diffData && (
            <div className="space-y-1">
              {diffData.diffHunks.length === 0 ? (
                <div className="py-8 text-center text-zinc-500">
                  No line-by-line differences detected for this revision window.
                </div>
              ) : (
                diffData.diffHunks.map((hunk, idx) => {
                  const isAdd = hunk.startsWith("+");
                  const isDel = hunk.startsWith("-");
                  return (
                    <div
                      key={idx}
                      className={`px-2 py-0.5 rounded ${
                        isAdd
                          ? "bg-emerald-950/50 text-emerald-300 border-l-2 border-emerald-500"
                          : isDel
                            ? "bg-rose-950/50 text-rose-300 border-l-2 border-rose-500"
                            : "text-zinc-400"
                      }`}
                    >
                      {hunk}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-[#1e1e1e] border-t border-[#3c3c3c] flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Close Diff
          </Button>
        </div>
      </div>
    </div>
  );
};
