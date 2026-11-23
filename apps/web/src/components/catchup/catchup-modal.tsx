"use client";

import React, { useState } from "react";
import {
  Clock,
  X,
  CheckCircle2,
  FilePlus,
  FileEdit,
  FileMinus,
  ArrowRight,
  GitCommit,
  GitBranch,
  Terminal,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  FileCode,
  Check,
  RefreshCw,
} from "lucide-react";
import { Button } from "@remote-ide/ui";
import { CatchupSummary } from "@remote-ide/shared";

export interface CatchupModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: CatchupSummary | null;
  onAcknowledge: () => Promise<void>;
  onOpenFile: (path: string) => void;
  onViewDiff: (path: string) => void;
  isLoading?: boolean;
}

export const CatchupModal: React.FC<CatchupModalProps> = ({
  isOpen,
  onClose,
  summary,
  onAcknowledge,
  onOpenFile,
  onViewDiff,
  isLoading = false,
}) => {
  const [viewMode, setViewMode] = useState<"net" | "history">("net");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    created: true,
    modified: true,
    renamed: true,
    deleted: true,
    git: true,
    jobs: true,
  });
  const [isAcking, setIsAcking] = useState(false);

  if (!isOpen || !summary) return null;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleMarkSeen = async () => {
    setIsAcking(true);
    try {
      await onAcknowledge();
      onClose();
    } finally {
      setIsAcking(false);
    }
  };

  const net = summary.netChanges;
  const history = summary.activityHistory;

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return iso;
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 md:pt-16 bg-black/80 backdrop-blur-sm p-4 animate-in fade-in-0 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-200"
      >
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1e1e1e] border-b border-[#3c3c3c]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-zinc-100">While You Were Away</span>
                <span className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 px-1.5 py-0.5 rounded font-mono">
                  rev {summary.fromRevision} → {summary.toRevision}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Workspace <span className="text-zinc-200 font-medium">{summary.workspaceName}</span>{" "}
                • {formatDate(summary.timeWindow.from)} – {formatDate(summary.timeWindow.to)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Dismiss summary (unread indicator will remain active)"
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {summary.historyExpired && (
          <div className="bg-amber-950/40 border-b border-amber-800/60 p-3.5 flex items-start gap-2.5 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Historical Details Expired</p>
              <p className="text-amber-300/80 text-[11px] mt-0.5">
                Historical change details cannot be recovered because events exceeded the workspace
                retention window. Performing full workspace state synchronization.
              </p>
            </div>
          </div>
        )}

        <div className="px-5 py-2.5 bg-[#202021] border-b border-[#3c3c3c] flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span>
              <strong className="text-zinc-200 font-semibold">{summary.totalFilesAffected}</strong>{" "}
              files affected
            </span>
            <span>•</span>
            <span>
              <strong className="text-zinc-200 font-semibold">{summary.totalEvents}</strong> events
            </span>
          </div>

          <div className="flex items-center bg-[#18181b] p-0.5 rounded-lg border border-zinc-800">
            <button
              onClick={() => setViewMode("net")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === "net"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Net Changes
            </button>
            <button
              onClick={() => setViewMode("history")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === "history"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Activity History ({history.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 select-text">
          {summary.totalEvents === 0 && !summary.historyExpired && (
            <div className="py-12 text-center text-zinc-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-medium text-zinc-200">No Changes While Away</p>
              <p className="text-xs text-zinc-500">
                Your workspace is fully synchronized and up to date.
              </p>
            </div>
          )}

          {viewMode === "net" && summary.totalEvents > 0 && (
            <div className="space-y-3.5">
              {net.filesCreated.length > 0 && (
                <div className="border border-[#3c3c3c] rounded-lg overflow-hidden bg-[#1e1e1e]">
                  <button
                    onClick={() => toggleSection("created")}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FilePlus className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-semibold text-zinc-200">
                        Files Created ({net.filesCreated.length})
                      </span>
                    </div>
                    {expandedSections.created ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>

                  {expandedSections.created && (
                    <div className="divide-y divide-[#2a2a2a] border-t border-[#3c3c3c]">
                      {net.filesCreated.map((f) => (
                        <div
                          key={f.path}
                          className="px-3.5 py-2 flex items-center justify-between hover:bg-zinc-800/30 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 px-1 py-0.5 rounded font-mono shrink-0">
                              NEW
                            </span>
                            <span className="font-mono text-zinc-200 truncate">{f.path}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => onOpenFile(f.path)}
                              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {net.filesModified.length > 0 && (
                <div className="border border-[#3c3c3c] rounded-lg overflow-hidden bg-[#1e1e1e]">
                  <button
                    onClick={() => toggleSection("modified")}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileEdit className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-semibold text-zinc-200">
                        Files Modified ({net.filesModified.length})
                      </span>
                    </div>
                    {expandedSections.modified ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>

                  {expandedSections.modified && (
                    <div className="divide-y divide-[#2a2a2a] border-t border-[#3c3c3c]">
                      {net.filesModified.map((f) => (
                        <div
                          key={f.path}
                          className="px-3.5 py-2 flex items-center justify-between hover:bg-zinc-800/30 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/50 px-1 py-0.5 rounded font-mono shrink-0">
                              MOD ×{f.count}
                            </span>
                            <span className="font-mono text-zinc-200 truncate">{f.path}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => onViewDiff(f.path)}
                              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-indigo-300 text-[11px] flex items-center gap-1 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Diff</span>
                            </button>
                            <button
                              onClick={() => onOpenFile(f.path)}
                              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {net.filesRenamed.length > 0 && (
                <div className="border border-[#3c3c3c] rounded-lg overflow-hidden bg-[#1e1e1e]">
                  <button
                    onClick={() => toggleSection("renamed")}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-semibold text-zinc-200">
                        Files Renamed ({net.filesRenamed.length})
                      </span>
                    </div>
                    {expandedSections.renamed ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>

                  {expandedSections.renamed && (
                    <div className="divide-y divide-[#2a2a2a] border-t border-[#3c3c3c]">
                      {net.filesRenamed.map((f, idx) => (
                        <div
                          key={idx}
                          className="px-3.5 py-2 flex items-center justify-between hover:bg-zinc-800/30 text-xs"
                        >
                          <div className="flex items-center gap-2 font-mono text-zinc-200 truncate pr-2">
                            <span className="line-through text-zinc-500 truncate">
                              {f.fromPath}
                            </span>
                            <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
                            <span className="text-zinc-100 truncate">{f.toPath}</span>
                          </div>
                          <button
                            onClick={() => onOpenFile(f.toPath)}
                            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] shrink-0 transition-colors"
                          >
                            Open
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {net.filesDeleted.length > 0 && (
                <div className="border border-[#3c3c3c] rounded-lg overflow-hidden bg-[#1e1e1e]">
                  <button
                    onClick={() => toggleSection("deleted")}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileMinus className="w-3.5 h-3.5 text-rose-400" />
                      <span className="font-semibold text-zinc-200">
                        Files Deleted ({net.filesDeleted.length})
                      </span>
                    </div>
                    {expandedSections.deleted ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>

                  {expandedSections.deleted && (
                    <div className="divide-y divide-[#2a2a2a] border-t border-[#3c3c3c]">
                      {net.filesDeleted.map((f) => (
                        <div
                          key={f.path}
                          className="px-3.5 py-2 flex items-center justify-between hover:bg-zinc-800/30 text-xs font-mono text-zinc-400"
                        >
                          <span className="line-through text-rose-300/80">{f.path}</span>
                          <span className="text-[10px] text-zinc-500">rev {f.revision}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {net.gitChanges.length > 0 && (
                <div className="border border-[#3c3c3c] rounded-lg overflow-hidden bg-[#1e1e1e]">
                  <button
                    onClick={() => toggleSection("git")}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <GitCommit className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-semibold text-zinc-200">
                        Git Activity ({net.gitChanges.length})
                      </span>
                    </div>
                    {expandedSections.git ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>

                  {expandedSections.git && (
                    <div className="divide-y divide-[#2a2a2a] border-t border-[#3c3c3c]">
                      {net.gitChanges.map((g, idx) => (
                        <div key={idx} className="px-3.5 py-2 text-xs space-y-0.5">
                          <div className="flex items-center gap-2">
                            {g.commitHash && (
                              <span className="font-mono text-[10px] text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded border border-purple-800/60">
                                {g.commitHash.slice(0, 7)}
                              </span>
                            )}
                            {g.branch && (
                              <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                                <GitBranch className="w-3 h-3 text-zinc-500" />
                                <span>{g.branch}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-200 text-xs">{g.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(net.jobs.length > 0 || net.processes.length > 0) && (
                <div className="border border-[#3c3c3c] rounded-lg overflow-hidden bg-[#1e1e1e]">
                  <button
                    onClick={() => toggleSection("jobs")}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-semibold text-zinc-200">
                        Background Jobs & Processes ({net.jobs.length + net.processes.length})
                      </span>
                    </div>
                    {expandedSections.jobs ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>

                  {expandedSections.jobs && (
                    <div className="divide-y divide-[#2a2a2a] border-t border-[#3c3c3c]">
                      {net.jobs.map((j) => (
                        <div
                          key={j.jobId}
                          className="px-3.5 py-2 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-medium text-zinc-200">{j.jobName}</span>
                            {j.command && (
                              <span className="font-mono text-[11px] text-zinc-500 ml-2">
                                {j.command}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                              j.finalStatus === "completed"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : j.finalStatus === "failed"
                                  ? "bg-rose-950 text-rose-400 border border-rose-800"
                                  : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {j.finalStatus}
                          </span>
                        </div>
                      ))}

                      {net.processes.map((pr) => (
                        <div
                          key={pr.processId}
                          className="px-3.5 py-2 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-zinc-200">{pr.processName}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                              pr.finalStatus === "running"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : pr.finalStatus === "crashed"
                                  ? "bg-rose-950 text-rose-400 border border-rose-800"
                                  : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {pr.finalStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {viewMode === "history" && summary.totalEvents > 0 && (
            <div className="border border-[#3c3c3c] rounded-lg overflow-hidden bg-[#1e1e1e] divide-y divide-[#2a2a2a]">
              {history.map((ev) => (
                <div
                  key={ev.eventId}
                  className="px-4 py-2.5 flex items-start justify-between hover:bg-zinc-800/30 text-xs gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded shrink-0 mt-0.5">
                      r{ev.revision}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-200 truncate">{ev.description}</p>
                      {ev.path && (
                        <p className="font-mono text-[11px] text-zinc-400 truncate">{ev.path}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-zinc-500">{formatDate(ev.timestamp)}</span>
                    {ev.path && (
                      <button
                        onClick={() => onOpenFile(ev.path!)}
                        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                        title="Open file in editor"
                      >
                        <FileCode className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#1e1e1e] border-t border-[#3c3c3c] flex items-center justify-between">
          <p className="text-[11px] text-zinc-500">
            Acknowledging marks these revisions as seen for this device.
          </p>
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="text-xs"
              title="Dismiss for now (badge stays unread)"
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleMarkSeen}
              disabled={isAcking || isLoading}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
            >
              {isAcking ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Acknowledging...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark as Seen</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
