"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Square, RotateCw, Plus, RefreshCw, Layers, X } from "lucide-react";
import { ManagedProcess } from "@remote-ide/shared";

export interface ProcessPanelProps {
  gatewayUrl?: string;
  workspaceId?: string;
  workspacePath?: string;
}

export const ProcessPanel: React.FC<ProcessPanelProps> = ({
  gatewayUrl = "",
  workspaceId = "default",
  workspacePath = "",
}) => {
  const [processes, setProcesses] = useState<ManagedProcess[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [logs, setLogs] = useState<
    Array<{ timestamp: string; stream: "stdout" | "stderr"; text: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Process Form
  const [newProcName, setNewProcName] = useState("");
  const [newProcCommand, setNewProcCommand] = useState("");
  const [newProcArgs, setNewProcArgs] = useState("");

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/processes?workspaceId=${workspaceId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setProcesses(data.data);
          if (!selectedProcessId && data.data.length > 0) {
            setSelectedProcessId(data.data[0].id);
          }
        }
      }
    } catch {
      // Ignored
    }
  }, [gatewayUrl, workspaceId, selectedProcessId]);

  const fetchLogs = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${gatewayUrl}/api/v1/processes/${id}/logs`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setLogs(data.data);
          }
        }
      } catch {
        // Ignored
      }
    },
    [gatewayUrl]
  );

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 3000);
    return () => clearInterval(interval);
  }, [fetchProcesses]);

  useEffect(() => {
    if (!selectedProcessId) {
      return;
    }
    fetchLogs(selectedProcessId);
    const interval = setInterval(() => fetchLogs(selectedProcessId), 2000);
    return () => clearInterval(interval);
  }, [selectedProcessId, fetchLogs]);

  const handleStartProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProcName.trim() || !newProcCommand.trim()) return;
    setIsLoading(true);
    try {
      const args = newProcArgs.trim()
        ? newProcArgs
            .split(" ")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const res = await fetch(`${gatewayUrl}/api/v1/processes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          name: newProcName.trim(),
          command: newProcCommand.trim(),
          args,
          cwd: workspacePath || undefined,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewProcName("");
        setNewProcCommand("");
        setNewProcArgs("");
        await fetchProcesses();
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async (id: string) => {
    try {
      await fetch(`${gatewayUrl}/api/v1/processes/${id}/stop`, {
        method: "POST",
        credentials: "include",
      });
      await fetchProcesses();
    } catch {
      // Ignored
    }
  };

  const handleRestart = async (id: string) => {
    try {
      await fetch(`${gatewayUrl}/api/v1/processes/${id}/restart`, {
        method: "POST",
        credentials: "include",
      });
      await fetchProcesses();
    } catch {
      // Ignored
    }
  };

  const selectedProcess = processes.find((p) => p.id === selectedProcessId);

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-[#141417] text-zinc-300 text-xs select-none overflow-hidden">
      {/* Process List Sidebar */}
      <div className="w-full md:w-80 border-r border-ide-border flex flex-col bg-zinc-900/60 shrink-0">
        <div className="p-3 border-b border-ide-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-zinc-200">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Managed Processes ({processes.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
              title="Start Process"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={fetchProcesses}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
          {processes.map((proc) => {
            const isSelected = proc.id === selectedProcessId;
            return (
              <div
                key={proc.id}
                onClick={() => setSelectedProcessId(proc.id)}
                className={`p-3 cursor-pointer flex flex-col gap-1 transition-colors ${
                  isSelected
                    ? "bg-indigo-950/40 border-l-2 border-indigo-500"
                    : "hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200 truncate">{proc.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${
                      proc.status === "running"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                        : proc.status === "crashed"
                          ? "bg-rose-950 text-rose-400 border border-rose-800/50"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                    }`}
                  >
                    {proc.status}
                  </span>
                </div>

                <div className="text-[11px] text-zinc-500 font-mono truncate">
                  {proc.command} {proc.args.join(" ")}
                </div>

                <div className="flex items-center justify-between mt-1 pt-1 border-t border-zinc-800/40 text-[10px] text-zinc-400">
                  <span>PID: {proc.pid || "—"}</span>
                  {proc.stats && (
                    <span>
                      CPU: {proc.stats.cpuPercent}% | RAM: {proc.stats.memoryMb}MB
                    </span>
                  )}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {proc.status === "running" ? (
                      <button
                        onClick={() => handleStop(proc.id)}
                        title="Stop"
                        className="p-1 hover:text-rose-400"
                      >
                        <Square className="w-3 h-3" />
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleRestart(proc.id)}
                      title="Restart"
                      className="p-1 hover:text-indigo-400"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {processes.length === 0 && (
            <div className="p-6 text-center text-zinc-600 italic">No managed processes yet.</div>
          )}
        </div>
      </div>

      {/* Process Log & Details Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#101014]">
        {selectedProcess ? (
          <>
            <div className="p-3 border-b border-ide-border flex items-center justify-between bg-zinc-900/40">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-zinc-200">{selectedProcess.name} Logs</span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  CWD: {selectedProcess.cwd}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRestart(selectedProcess.id)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3" /> Restart
                </button>
                {selectedProcess.status === "running" && (
                  <button
                    onClick={() => handleStop(selectedProcess.id)}
                    className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 text-xs flex items-center gap-1"
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-300">
              {logs.length === 0 ? (
                <div className="text-zinc-600 italic">Waiting for log output...</div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`whitespace-pre-wrap ${
                      log.stream === "stderr" ? "text-rose-400" : "text-zinc-300"
                    }`}
                  >
                    {log.text}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600 italic">
            Select a process to view its details and logs.
          </div>
        )}
      </div>

      {/* Start Process Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleStartProcess}
            className="bg-ide-sidebar border border-ide-border rounded-lg shadow-xl max-w-md w-full p-4 flex flex-col gap-3 text-zinc-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-ide-border">
              <span className="font-semibold text-sm">Start Managed Process</span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Process Name</label>
              <input
                type="text"
                required
                value={newProcName}
                onChange={(e) => setNewProcName(e.target.value)}
                placeholder="e.g. Next.js Dev Server"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Executable / Command</label>
              <input
                type="text"
                required
                value={newProcCommand}
                onChange={(e) => setNewProcCommand(e.target.value)}
                placeholder="e.g. pnpm or node"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Arguments</label>
              <input
                type="text"
                value={newProcArgs}
                onChange={(e) => setNewProcArgs(e.target.value)}
                placeholder="e.g. dev or start"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-ide-border">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium"
              >
                Start Process
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
