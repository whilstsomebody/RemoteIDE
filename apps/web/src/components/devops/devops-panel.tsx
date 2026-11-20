"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Boxes,
  Layers,
  KeyRound,
  RefreshCw,
  Plus,
  RotateCw,
  Square,
  Radio,
} from "lucide-react";
import { cn } from "@remote-ide/ui";
import { HostDashboard } from "../dashboard/host-dashboard";
import { DockerPanel } from "../docker/docker-panel";
import { DevOpsOverview } from "@remote-ide/shared";

export interface DevopsPanelProps {
  agentUrl: string;
}

export const DevopsPanel: React.FC<DevopsPanelProps> = ({ agentUrl }) => {
  const [activeSubTab, setActiveSubTab] = useState<"metrics" | "docker" | "pm2" | "ssh" | "k8s">(
    "metrics"
  );
  const [overview, setOverview] = useState<DevOpsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [newSshModal, setNewSshModal] = useState(false);
  const [sshName, setSshName] = useState("");
  const [sshHost, setSshHost] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [testingSshId, setTestingSshId] = useState<string | null>(null);

  const fetchDevOps = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${agentUrl}/api/v1/devops/overview`);
      if (res.ok) {
        const body = await res.json();
        setOverview(body.data);
      }
    } catch {
      // Offline
    } finally {
      setLoading(false);
    }
  }, [agentUrl]);

  useEffect(() => {
    void fetchDevOps();
  }, [fetchDevOps]);

  const handleTestSsh = async (id: string) => {
    setTestingSshId(id);
    try {
      await fetch(`${agentUrl}/api/v1/devops/ssh/${id}/test`, { method: "POST" });
      await fetchDevOps();
    } catch {
      // Ignored
    } finally {
      setTestingSshId(null);
    }
  };

  const handleCreateSsh = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sshName || !sshHost || !sshUser) return;
    try {
      await fetch(`${agentUrl}/api/v1/devops/ssh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sshName, host: sshHost, username: sshUser }),
      });
      setNewSshModal(false);
      setSshName("");
      setSshHost("");
      setSshUser("");
      await fetchDevOps();
    } catch {
      // Error
    }
  };

  const handlePm2Action = async (id: number, action: "restart" | "stop") => {
    try {
      await fetch(`${agentUrl}/api/v1/devops/pm2/${id}/${action}`, { method: "POST" });
      await fetchDevOps();
    } catch {
      // Error
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] text-zinc-300 font-sans text-xs select-none">
      {/* Subtab Navigation Bar */}
      <div className="flex items-center border-b border-zinc-800 bg-[#121214] px-2 py-1.5 gap-1 shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab("metrics")}
          className={cn(
            "px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors",
            activeSubTab === "metrics"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Host Monitor</span>
        </button>

        <button
          onClick={() => setActiveSubTab("docker")}
          className={cn(
            "px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors",
            activeSubTab === "docker"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          <Boxes className="w-3.5 h-3.5 text-sky-400" />
          <span>Docker</span>
        </button>

        <button
          onClick={() => setActiveSubTab("pm2")}
          className={cn(
            "px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors",
            activeSubTab === "pm2" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <span>PM2</span>
        </button>

        <button
          onClick={() => setActiveSubTab("ssh")}
          className={cn(
            "px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors",
            activeSubTab === "ssh" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          <KeyRound className="w-3.5 h-3.5 text-purple-400" />
          <span>SSH Profiles</span>
        </button>

        <button
          onClick={() => setActiveSubTab("k8s")}
          className={cn(
            "px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors",
            activeSubTab === "k8s" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          <Radio className="w-3.5 h-3.5 text-blue-400" />
          <span>Kubernetes</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === "metrics" && <HostDashboard agentUrl={agentUrl} />}

        {activeSubTab === "docker" && <DockerPanel agentUrl={agentUrl} />}

        {activeSubTab === "pm2" && (
          <div className="h-full overflow-y-auto p-3 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-semibold text-zinc-200">PM2 Process Overview</span>
              <button
                onClick={() => void fetchDevOps()}
                className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              </button>
            </div>

            {overview?.pm2.isAvailable ? (
              <div className="space-y-1.5">
                {overview.pm2.processes.map((proc) => (
                  <div
                    key={proc.id}
                    className="p-2.5 rounded bg-[#121214] border border-zinc-800/80 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-white">{proc.name}</div>
                      <div className="text-[10px] text-zinc-400">
                        PID: {proc.pid || "N/A"} | Restarts: {proc.restarts} | CPU:{" "}
                        {proc.cpuPercent}%
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void handlePm2Action(proc.id, "restart")}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300"
                        title="Restart"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => void handlePm2Action(proc.id, "stop")}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-rose-300"
                        title="Stop"
                      >
                        <Square className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-500 italic">
                {overview?.pm2.error || "PM2 is not installed on this host."}
              </div>
            )}
          </div>
        )}

        {activeSubTab === "ssh" && (
          <div className="h-full overflow-y-auto p-3 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-semibold text-zinc-200">SSH Server Profiles</span>
              <button
                onClick={() => setNewSshModal(true)}
                className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 text-[11px]"
              >
                <Plus className="w-3 h-3" />
                Add Profile
              </button>
            </div>

            <div className="space-y-1.5">
              {(overview?.sshProfiles || []).map((ssh) => (
                <div
                  key={ssh.id}
                  className="p-2.5 rounded bg-[#121214] border border-zinc-800/80 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-white">{ssh.name}</div>
                    <div className="text-[10px] text-zinc-400">
                      {ssh.username}@{ssh.host}:{ssh.port} ({ssh.authType})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] border",
                        ssh.status === "connected"
                          ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                          : ssh.status === "error"
                            ? "bg-rose-950/40 border-rose-800 text-rose-300"
                            : "bg-zinc-800 border-zinc-700 text-zinc-400"
                      )}
                    >
                      {ssh.status}
                    </span>
                    <button
                      onClick={() => void handleTestSsh(ssh.id)}
                      disabled={testingSshId === ssh.id}
                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px]"
                    >
                      {testingSshId === ssh.id ? "Testing..." : "Test"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === "k8s" && (
          <div className="h-full overflow-y-auto p-3 space-y-3">
            <div className="pb-2 border-b border-zinc-800 flex items-center justify-between">
              <span className="font-semibold text-zinc-200">Kubernetes Contexts</span>
              {overview?.kubernetes.currentContext && (
                <span className="px-2 py-0.5 rounded bg-blue-950/40 border border-blue-800 text-blue-300 text-[10px]">
                  Current: {overview.kubernetes.currentContext}
                </span>
              )}
            </div>

            {overview?.kubernetes.isAvailable ? (
              <div className="space-y-1.5">
                {overview.kubernetes.contexts.map((ctx) => (
                  <div
                    key={ctx.name}
                    className={cn(
                      "p-2.5 rounded border",
                      ctx.isCurrent
                        ? "bg-blue-950/20 border-blue-800"
                        : "bg-[#121214] border-zinc-800/80"
                    )}
                  >
                    <div className="font-semibold text-white">{ctx.name}</div>
                    <div className="text-[10px] text-zinc-400">
                      Cluster: {ctx.cluster} | User: {ctx.user}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-500 italic">
                {overview?.kubernetes.error || "kubectl is not configured on this host."}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New SSH Modal */}
      {newSshModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateSsh}
            className="bg-[#121214] border border-zinc-700 rounded-lg p-4 w-full max-w-sm space-y-3"
          >
            <h3 className="font-bold text-white text-sm">Add SSH Server Profile</h3>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-zinc-400">Profile Name</label>
                <input
                  type="text"
                  value={sshName}
                  onChange={(e) => setSshName(e.target.value)}
                  placeholder="Production Web Server"
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-400">Host / IP</label>
                <input
                  type="text"
                  value={sshHost}
                  onChange={(e) => setSshHost(e.target.value)}
                  placeholder="192.168.1.50"
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-400">Username</label>
                <input
                  type="text"
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                  placeholder="ubuntu"
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-white text-xs"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewSshModal(false)}
                className="px-3 py-1 rounded bg-zinc-800 text-zinc-300"
              >
                Cancel
              </button>
              <button type="submit" className="px-3 py-1 rounded bg-indigo-600 text-white">
                Save Profile
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
