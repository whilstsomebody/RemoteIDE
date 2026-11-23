"use client";

import { gatewayFetch } from "../../lib/api/client";
import React, { useState, useEffect } from "react";
import {
  Play,
  RotateCw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronDown,
  FileCode,
  Terminal,
  BarChart2,
  AlertTriangle,
  FlaskConical,
} from "lucide-react";
import { cn } from "@remote-ide/ui";
import { TestSuite, TestRunResult } from "@remote-ide/shared";

export interface TestExplorerPanelProps {
  gatewayUrl?: string;
  workspacePath?: string;
  workspaceId?: string;
  onNavigateToFile?: (path: string, line?: number) => void;
}

export const TestExplorerPanel: React.FC<TestExplorerPanelProps> = ({
  gatewayUrl = "",
  workspacePath = "",
  workspaceId = "default",
  onNavigateToFile,
}) => {
  const baseUrl = gatewayUrl.replace(/\/+$/, "");

  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>({});
  const [lastRun, setLastRun] = useState<TestRunResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showLogs, setShowLogs] = useState<boolean>(false);

  const discoverTests = async () => {
    try {
      const res = await gatewayFetch(
        `${baseUrl}/api/v1/tests/discover?workspacePath=${encodeURIComponent(workspacePath)}`
      );
      if (res.ok) {
        const json = await res.json();
        const list: TestSuite[] = json.data || [];
        setSuites(list);

        const exp: Record<string, boolean> = {};
        list.slice(0, 3).forEach((s) => (exp[s.id] = true));
        setExpandedSuites(exp);
      }
    } catch {
      // Ignore
    }
  };

  const fetchLastRun = async () => {
    try {
      const res = await gatewayFetch(
        `${baseUrl}/api/v1/tests/last-run?workspaceId=${encodeURIComponent(workspaceId)}`
      );
      if (res.ok) {
        const json = await res.json();
        if (json.data) setLastRun(json.data);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    discoverTests();
    fetchLastRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath, baseUrl]);

  const handleRunTests = async (
    scope: "all" | "file" | "single" | "failed",
    filePath?: string,
    testName?: string
  ) => {
    setIsRunning(true);
    try {
      const res = await gatewayFetch(
        `${baseUrl}/api/v1/tests/run?workspacePath=${encodeURIComponent(workspacePath)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            scope,
            filePath,
            testName,
            failedOnly: scope === "failed",
          }),
        }
      );
      if (res.ok) {
        const json = await res.json();
        setLastRun(json.data);
      }
    } catch {
      // Ignore
    } finally {
      setIsRunning(false);
    }
  };

  const totalTests = suites.reduce((acc, s) => acc + s.tests.length, 0);

  return (
    <div className="h-full flex flex-col bg-[#121214] text-zinc-200 text-xs font-sans select-none overflow-hidden">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-[#18181b]">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-zinc-100 uppercase tracking-wider text-[11px]">
            Test Explorer
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleRunTests("all")}
            disabled={isRunning}
            className="p-1 rounded hover:bg-zinc-800 text-emerald-400 disabled:opacity-50 transition-colors"
            title="Run All Tests"
          >
            <Play className={cn("w-3.5 h-3.5 fill-current", isRunning && "animate-pulse")} />
          </button>
          <button
            onClick={() => handleRunTests("failed")}
            disabled={isRunning || !lastRun || lastRun.failed === 0}
            className="p-1 rounded hover:bg-zinc-800 text-rose-400 disabled:opacity-30 transition-colors"
            title="Rerun Failed Tests"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={discoverTests}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Refresh Test Discovery"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {lastRun && (
        <div className="p-2.5 border-b border-zinc-800/80 bg-zinc-900/40 shrink-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-300">Last Test Outcome</span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span className="text-zinc-400 font-mono">
                {(lastRun.durationMs / 1000).toFixed(2)}s
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>{lastRun.passed} Passed</span>
            </span>
            {lastRun.failed > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/60 text-rose-400 border border-rose-800/60 flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                <span>{lastRun.failed} Failed</span>
              </span>
            )}
            {lastRun.skipped > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                {lastRun.skipped} Skipped
              </span>
            )}
          </div>

          {lastRun.coverage && (
            <div className="pt-1 flex items-center justify-between text-[10px] text-zinc-400 border-t border-zinc-800/50">
              <span className="flex items-center gap-1">
                <BarChart2 className="w-3 h-3 text-indigo-400" />
                <span>Coverage:</span>
              </span>
              <span className="font-mono text-zinc-200">
                Lines {lastRun.coverage.lines.pct}% | Stmts {lastRun.coverage.statements.pct}%
              </span>
            </div>
          )}
        </div>
      )}

      {lastRun && lastRun.failures && lastRun.failures.length > 0 && (
        <div className="p-2 border-b border-rose-950/80 bg-rose-950/20 max-h-36 overflow-y-auto space-y-1 shrink-0">
          <div className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Failing Tests ({lastRun.failures.length})</span>
          </div>
          {lastRun.failures.map((f, i) => (
            <div
              key={i}
              onClick={() => onNavigateToFile?.(f.filePath, f.line)}
              className="p-1 rounded bg-rose-950/40 hover:bg-rose-900/40 cursor-pointer text-[11px] text-rose-200 font-mono transition-colors"
            >
              <div className="font-bold truncate">{f.testName}</div>
              <div className="text-[10px] text-rose-400/80 truncate">
                {f.filePath.split("/").pop()}:{f.line} — {f.message}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 px-1">
          <span>Test Suites ({suites.length})</span>
          <span className="text-zinc-500 font-mono">{totalTests} Tests</span>
        </div>

        {suites.length === 0 ? (
          <div className="text-zinc-500 italic p-4 text-center">
            No test files discovered (*.test.ts, *.spec.ts).
          </div>
        ) : (
          suites.map((suite) => {
            const isExpanded = expandedSuites[suite.id] ?? false;

            return (
              <div
                key={suite.id}
                className="rounded border border-zinc-800/60 bg-zinc-900/30 overflow-hidden"
              >
                <div className="flex items-center justify-between p-1.5 hover:bg-zinc-800/60 transition-colors group">
                  <div
                    onClick={() =>
                      setExpandedSuites((prev) => ({ ...prev, [suite.id]: !isExpanded }))
                    }
                    className="flex items-center gap-1.5 flex-1 cursor-pointer truncate"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-zinc-400 shrink-0" />
                    )}
                    <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="font-medium text-zinc-200 truncate">{suite.name}</span>
                    <span className="text-[10px] text-zinc-500">({suite.tests.length})</span>
                  </div>

                  <button
                    onClick={() => handleRunTests("file", suite.filePath)}
                    disabled={isRunning}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 text-emerald-400 transition-opacity"
                    title="Run Suite"
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="pl-6 pr-2 pb-1.5 space-y-0.5 border-t border-zinc-800/40 pt-1">
                    {suite.tests.map((test) => (
                      <div
                        key={test.id}
                        className="flex items-center justify-between py-0.5 px-1 rounded hover:bg-zinc-800/50 transition-colors group/test"
                      >
                        <div
                          onClick={() => onNavigateToFile?.(test.filePath, test.line)}
                          className="flex items-center gap-1.5 truncate cursor-pointer flex-1"
                        >
                          <CheckCircle2 className="w-3 h-3 text-zinc-600 shrink-0" />
                          <span className="text-zinc-300 truncate text-[11px]">{test.name}</span>
                        </div>

                        <button
                          onClick={() => handleRunTests("single", test.filePath, test.name)}
                          disabled={isRunning}
                          className="opacity-0 group-hover/test:opacity-100 p-0.5 rounded text-emerald-400 hover:text-emerald-300"
                          title="Run Test"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {lastRun && lastRun.logs && lastRun.logs.length > 0 && (
        <div className="border-t border-zinc-800 bg-[#141416] shrink-0">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-400 hover:text-zinc-200 text-[10px] font-semibold uppercase tracking-wider"
          >
            <span className="flex items-center gap-1">
              <Terminal className="w-3 h-3" />
              <span>Test Output Logs</span>
            </span>
            <span>{showLogs ? "Hide" : "Show"}</span>
          </button>

          {showLogs && (
            <div className="h-28 overflow-y-auto p-2 bg-zinc-950 font-mono text-[10px] text-zinc-300 space-y-0.5">
              {lastRun.logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap leading-relaxed",
                    log.stream === "stderr" ? "text-rose-400" : "text-zinc-300"
                  )}
                >
                  {log.data}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
