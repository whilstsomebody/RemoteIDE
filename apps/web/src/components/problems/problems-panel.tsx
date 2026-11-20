"use client";

import React, { useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Search,
  FileCode,
  Layers,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@remote-ide/ui";
import { ProblemItem, ProblemSeverity } from "@remote-ide/shared";

export interface ProblemsPanelProps {
  problems: ProblemItem[];
  onSelectProblem?: (problem: ProblemItem) => void;
}

export const ProblemsPanel: React.FC<ProblemsPanelProps> = ({ problems, onSelectProblem }) => {
  const [filterSeverity, setFilterSeverity] = useState<ProblemSeverity | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByFile, setGroupByFile] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  // Filtered problems
  const filtered = useMemo(() => {
    return problems.filter((p) => {
      if (filterSeverity !== "all" && p.severity !== filterSeverity) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchMsg = p.message.toLowerCase().includes(q);
        const matchFile = p.filePath.toLowerCase().includes(q);
        const matchCode = p.code ? String(p.code).toLowerCase().includes(q) : false;
        if (!matchMsg && !matchFile && !matchCode) return false;
      }
      return true;
    });
  }, [problems, filterSeverity, searchQuery]);

  // Counts
  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warningCount = problems.filter((p) => p.severity === "warning").length;
  const infoCount = problems.filter((p) => p.severity === "info" || p.severity === "hint").length;

  // Group by file
  const groupedByFile = useMemo(() => {
    const map = new Map<string, ProblemItem[]>();
    for (const p of filtered) {
      const list = map.get(p.filePath) || [];
      list.push(p);
      map.set(p.filePath, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filePath]: !(prev[filePath] ?? true),
    }));
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] text-zinc-300 font-sans text-xs select-none">
      {/* Filters Toolbar */}
      <div className="p-2 border-b border-zinc-800 bg-[#121214] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Severity quick filters */}
          <button
            onClick={() => setFilterSeverity("all")}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
              filterSeverity === "all"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            All ({problems.length})
          </button>

          <button
            onClick={() => setFilterSeverity("error")}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors",
              filterSeverity === "error"
                ? "bg-rose-950/80 text-rose-300 border border-rose-800/80"
                : "text-zinc-400 hover:text-rose-400"
            )}
          >
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>{errorCount} Errors</span>
          </button>

          <button
            onClick={() => setFilterSeverity("warning")}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors",
              filterSeverity === "warning"
                ? "bg-amber-950/80 text-amber-300 border border-amber-800/80"
                : "text-zinc-400 hover:text-amber-400"
            )}
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>{warningCount} Warnings</span>
          </button>

          {infoCount > 0 && (
            <button
              onClick={() => setFilterSeverity("info")}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors",
                filterSeverity === "info"
                  ? "bg-sky-950/80 text-sky-300 border border-sky-800/80"
                  : "text-zinc-400 hover:text-sky-400"
              )}
            >
              <Info className="w-3 h-3 text-sky-400" />
              <span>{infoCount} Info</span>
            </button>
          )}
        </div>

        {/* Search & Grouping Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-zinc-500 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter problems..."
              className="pl-7 pr-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 text-[11px] font-mono outline-none w-36 focus:w-48 transition-all"
            />
          </div>

          <button
            onClick={() => setGroupByFile(!groupByFile)}
            className={cn(
              "p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors",
              groupByFile && "text-indigo-400 bg-zinc-800/50"
            )}
            title={groupByFile ? "Flatten List" : "Group by File"}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Problems List */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-1">
        {filtered.length === 0 ? (
          <div className="text-zinc-600 italic py-6 text-center select-none font-sans">
            No problems detected in open files or build tasks.
          </div>
        ) : groupByFile ? (
          groupedByFile.map(([filePath, items]) => {
            const isExpanded = expandedFiles[filePath] ?? true;
            const fileName = filePath.split("/").pop() || filePath;

            return (
              <div key={filePath} className="space-y-0.5">
                {/* File Group Header */}
                <div
                  onClick={() => toggleFile(filePath)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900/60 hover:bg-zinc-800/70 cursor-pointer transition-colors text-zinc-300"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  )}
                  <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="font-semibold text-zinc-200">{fileName}</span>
                  <span className="text-[10px] text-zinc-500 truncate flex-1">{filePath}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400">
                    {items.length}
                  </span>
                </div>

                {/* Items in File */}
                {isExpanded && (
                  <div className="pl-4 space-y-0.5">
                    {items.map((prob) => (
                      <ProblemRow
                        key={prob.id}
                        problem={prob}
                        onSelect={() => onSelectProblem?.(prob)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          filtered.map((prob) => (
            <ProblemRow key={prob.id} problem={prob} onSelect={() => onSelectProblem?.(prob)} />
          ))
        )}
      </div>
    </div>
  );
};

const ProblemRow: React.FC<{ problem: ProblemItem; onSelect: () => void }> = ({
  problem,
  onSelect,
}) => {
  const isError = problem.severity === "error";
  const isWarn = problem.severity === "warning";

  return (
    <div
      onClick={onSelect}
      className="flex items-start gap-2 px-2 py-1 rounded hover:bg-zinc-800/70 cursor-pointer transition-colors group text-[11px]"
    >
      <div className="pt-0.5 shrink-0">
        {isError ? (
          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
        ) : isWarn ? (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <Info className="w-3.5 h-3.5 text-sky-400" />
        )}
      </div>

      {/* Source Badge */}
      <span
        className={cn(
          "px-1 py-0.2 rounded text-[9px] uppercase font-bold shrink-0",
          problem.source === "lsp"
            ? "bg-indigo-950/70 text-indigo-300 border border-indigo-800/50"
            : problem.source === "test"
              ? "bg-rose-950/70 text-rose-300 border border-rose-800/50"
              : problem.source === "build"
                ? "bg-amber-950/70 text-amber-300 border border-amber-800/50"
                : "bg-zinc-800 text-zinc-400"
        )}
      >
        {problem.source}
      </span>

      <span className="text-zinc-400 font-mono select-none shrink-0">
        [{problem.line}:{problem.col}]
      </span>

      <span className="text-zinc-200 flex-1 truncate group-hover:text-white transition-colors">
        {problem.message}
      </span>

      {problem.code && (
        <span className="text-zinc-500 font-mono text-[10px] shrink-0">TS{problem.code}</span>
      )}
    </div>
  );
};
