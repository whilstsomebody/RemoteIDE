"use client";

import { gatewayFetch, GATEWAY_URL } from "../../lib/api/client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Terminal,
  Activity,
} from "lucide-react";
import { JobDefinition, JobLogEntry } from "@remote-ide/shared";

export interface QuickLauncherProps {
  gatewayUrl?: string;
  workspacePath?: string;
  className?: string;
}

interface PredefinedTask {
  id: string;
  name: string;
  command: string;
  args?: string[];
  description: string;
}

const PREDEFINED_TASKS: PredefinedTask[] = [
  {
    id: "dev-server",
    name: "Start Dev Server",
    command: "pnpm dev",
    description: "Launch Next.js and API server processes",
  },
  {
    id: "build",
    name: "Run Build",
    command: "pnpm build",
    description: "Compile TypeScript packages and Next.js bundle",
  },
  {
    id: "test",
    name: "Run Tests",
    command: "pnpm test",
    description: "Execute Vitest test suites across monorepo",
  },
  {
    id: "lint",
    name: "Run Linter",
    command: "pnpm lint",
    description: "Check code formatting and ESLint rules",
  },
];

export const QuickLauncher: React.FC<QuickLauncherProps> = ({
  gatewayUrl = GATEWAY_URL,
  workspacePath,
  className = "",
}) => {
  const [jobs, setJobs] = useState<JobDefinition[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobLogs, setJobLogs] = useState<JobLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customCommand, setCustomCommand] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Fetch running/recent jobs
  const fetchJobs = useCallback(async () => {
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await gatewayFetch(`${gatewayUrl}/api/v1/jobs`, { headers });
      if (res.ok) {
        const body = await res.json();
        const list: JobDefinition[] = body.data || [];
        setJobs(list);
        if (list.length > 0 && !selectedJobId && list[0]) {
          setSelectedJobId(list[0].id);
        }
      }
    } catch {
      // Offline fallback
    }
  }, [gatewayUrl, selectedJobId]);

  // Fetch logs for selected job
  const fetchLogs = useCallback(
    async (jobId: string) => {
      try {
        const token = localStorage.getItem("remote_ide_token") || "";
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await gatewayFetch(`${gatewayUrl}/api/v1/jobs/${jobId}/logs`, { headers });
        if (res.ok) {
          const body = await res.json();
          setJobLogs(body.data || []);
        }
      } catch {
        // Offline fallback
      }
    },
    [gatewayUrl]
  );

  useEffect(() => {
    void fetchJobs();
    const interval = setInterval(() => {
      void fetchJobs();
      if (selectedJobId) void fetchLogs(selectedJobId);
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchJobs, fetchLogs, selectedJobId]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [jobLogs]);

  // Run a task
  const handleRunTask = async (name: string, command: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await gatewayFetch(`${gatewayUrl}/api/v1/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          command,
          cwd: workspacePath || undefined,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message || "Failed to trigger background task");
      }

      const job: JobDefinition = body.data;
      setJobs((prev) => [job, ...prev]);
      setSelectedJobId(job.id);
      void fetchLogs(job.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error executing task");
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel running job
  const handleCancelJob = async (jobId: string) => {
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      await gatewayFetch(`${gatewayUrl}/api/v1/jobs/${jobId}/cancel`, {
        method: "POST",
        headers,
      });

      void fetchJobs();
    } catch {
      // Ignore
    }
  };

  // Retry job
  const handleRetryJob = async (jobId: string) => {
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await gatewayFetch(`${gatewayUrl}/api/v1/jobs/${jobId}/retry`, {
        method: "POST",
        headers,
      });

      if (res.ok) {
        const body = await res.json();
        setSelectedJobId(body.data.id);
        void fetchJobs();
      }
    } catch {
      // Ignore
    }
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  return (
    <div
      className={`w-full h-full flex flex-col md:flex-row bg-[#09090b] text-zinc-300 ${className}`}
    >
      {/* Left Column: Quick Action Buttons & Jobs List */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800 p-3 flex flex-col gap-3 overflow-y-auto shrink-0 bg-[#0c0c0f]">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5 uppercase tracking-wider mb-2">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            Quick Command Launcher
          </h3>
          <p className="text-[11px] text-zinc-500 mb-3">
            Authorized workspace tasks execute persistently in the background on the host agent.
          </p>

          {error && (
            <div className="mb-3 p-2 rounded bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          {/* Quick Predefined Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {PREDEFINED_TASKS.map((task) => {
              const isRunning = jobs.some(
                (j) => j.name === task.name && (j.status === "running" || j.status === "pending")
              );
              return (
                <button
                  key={task.id}
                  disabled={isLoading}
                  onClick={() => void handleRunTask(task.name, task.command)}
                  className={`p-2 rounded border text-left flex flex-col justify-between transition-colors ${
                    isRunning
                      ? "bg-amber-950/40 border-amber-800/80 text-amber-200"
                      : "bg-[#141418] border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-200"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-medium truncate">{task.name}</span>
                    {isRunning ? (
                      <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3 text-indigo-400" />
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500 truncate">
                    {task.command}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Approved Command Runner */}
        <div className="pt-2 border-t border-zinc-800">
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
            Execute Custom Script
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={customCommand}
              onChange={(e) => setCustomCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customCommand.trim()) {
                  void handleRunTask("Custom Task", customCommand.trim());
                  setCustomCommand("");
                }
              }}
              placeholder="e.g. git status, node script.js"
              className="flex-1 bg-[#141418] border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => {
                if (customCommand.trim()) {
                  void handleRunTask("Custom Task", customCommand.trim());
                  setCustomCommand("");
                }
              }}
              disabled={!customCommand.trim() || isLoading}
              className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
            >
              Run
            </button>
          </div>
        </div>

        {/* Recent Jobs History */}
        <div className="flex-1 flex flex-col min-h-[120px] pt-2 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Execution History
            </span>
            <button
              onClick={() => void fetchJobs()}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300"
              title="Refresh"
            >
              <RefreshCw className="w-2.5 h-2.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1">
            {jobs.length === 0 ? (
              <div className="text-center text-zinc-600 text-[11px] py-4">No jobs run yet.</div>
            ) : (
              jobs.map((job) => {
                const isSelected = job.id === selectedJobId;
                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      setSelectedJobId(job.id);
                      void fetchLogs(job.id);
                    }}
                    className={`p-1.5 rounded cursor-pointer border text-xs flex items-center justify-between transition-colors ${
                      isSelected
                        ? "bg-indigo-950/40 border-indigo-700 text-zinc-100"
                        : "bg-[#141418]/60 border-zinc-800/80 hover:bg-zinc-800/60 text-zinc-400"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {job.status === "completed" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      {job.status === "running" && (
                        <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                      )}
                      {job.status === "pending" && (
                        <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      )}
                      {job.status === "failed" && (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      {job.status === "cancelled" && (
                        <Square className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      )}
                      <span className="truncate font-medium">{job.name}</span>
                    </div>

                    <span className="text-[10px] uppercase font-mono px-1 rounded bg-zinc-800/80 shrink-0">
                      {job.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Live Log Viewer & Job Control */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#09090b]">
        {selectedJob ? (
          <>
            {/* Job Header Info & Controls */}
            <div className="h-10 bg-[#121215] border-b border-zinc-800 px-3 flex items-center justify-between text-xs select-none shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-zinc-200">{selectedJob.name}</span>
                <span className="font-mono text-[11px] text-zinc-500 truncate max-w-xs">
                  {selectedJob.command}
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                    selectedJob.status === "completed"
                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                      : selectedJob.status === "running"
                        ? "bg-amber-950/60 text-amber-400 border border-amber-800/60"
                        : selectedJob.status === "failed"
                          ? "bg-red-950/60 text-red-400 border border-red-800/60"
                          : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {selectedJob.status}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedJob.status === "running" && (
                  <button
                    onClick={() => void handleCancelJob(selectedJob.id)}
                    className="px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 text-red-200 text-xs flex items-center gap-1 transition-colors"
                  >
                    <Square className="w-3 h-3" />
                    Stop Process
                  </button>
                )}

                {(selectedJob.status === "completed" ||
                  selectedJob.status === "failed" ||
                  selectedJob.status === "cancelled") && (
                  <button
                    onClick={() => void handleRetryJob(selectedJob.id)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Rerun Task
                  </button>
                )}
              </div>
            </div>

            {/* Live Streaming Logs Output */}
            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto p-3 font-mono text-xs select-text space-y-1 bg-[#09090b]"
            >
              {jobLogs.length === 0 ? (
                <div className="text-zinc-600 italic py-6 text-center">
                  Waiting for task output...
                </div>
              ) : (
                jobLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-zinc-600 text-[10px] select-none shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`font-mono ${
                        log.stream === "stderr"
                          ? "text-red-400"
                          : log.stream === "system"
                            ? "text-indigo-400"
                            : "text-zinc-300"
                      }`}
                    >
                      {log.data}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-600">
            <Terminal className="w-10 h-10 text-zinc-700 mb-2" />
            <p className="text-xs">
              Select or trigger a background task to view live execution logs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
