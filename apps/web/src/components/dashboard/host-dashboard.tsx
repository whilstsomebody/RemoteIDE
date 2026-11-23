"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  HardDrive,
  Activity,
  Battery,
  BatteryCharging,
  Wifi,
  Server,
  AlertTriangle,
  Clock,
  FolderGit2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { cn } from "@remote-ide/ui";
import { HostMetrics, HostMetricsHistory, AlertItem } from "@remote-ide/shared";

export interface HostDashboardProps {
  agentUrl: string;
}

export const HostDashboard: React.FC<HostDashboardProps> = ({ agentUrl }) => {
  const [metrics, setMetrics] = useState<HostMetrics | null>(null);
  const [history, setHistory] = useState<HostMetricsHistory | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const [resM, resH, resA] = await Promise.all([
        fetch(`${agentUrl}/api/v1/host/metrics`),
        fetch(`${agentUrl}/api/v1/host/metrics/history`),
        fetch(`${agentUrl}/api/v1/host/alerts`),
      ]);

      if (resM.ok) {
        const bodyM = await resM.json();
        setMetrics(bodyM.data);
      }
      if (resH.ok) {
        const bodyH = await resH.json();
        setHistory(bodyH.data);
      }
      if (resA.ok) {
        const bodyA = await resA.json();
        setAlerts(bodyA.data || []);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to host agent");
    } finally {
      setLoading(false);
    }
  }, [agentUrl]);

  useEffect(() => {
    void fetchMetrics();
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [fetchMetrics, autoRefresh]);

  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await fetch(`${agentUrl}/api/v1/host/alerts/${id}/ack`, { method: "POST" });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // Ignored
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const renderSparkline = (data: number[], color: string) => {
    if (data.length < 2) return null;
    const max = 100;
    const min = 0;
    const width = 120;
    const height = 28;

    const points = data
      .map((val, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((val - min) / (max - min)) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return (
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] text-zinc-300 font-sans text-xs overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Host Metrics & DevOps Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              "px-2 py-1 rounded text-[11px] font-medium border transition-colors",
              autoRefresh
                ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white"
            )}
          >
            Auto 5s {autoRefresh ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => void fetchMetrics()}
            disabled={loading}
            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title="Refresh Metrics"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-md text-rose-300 flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((alt) => (
            <div
              key={alt.id}
              className={cn(
                "p-2.5 rounded border flex items-center justify-between gap-3 text-xs",
                alt.severity === "critical"
                  ? "bg-rose-950/60 border-rose-700 text-rose-200"
                  : "bg-amber-950/50 border-amber-700 text-amber-200"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <div className="truncate">
                  <span className="font-semibold">{alt.title}:</span> {alt.message}
                </div>
              </div>
              <button
                onClick={() => void handleAcknowledgeAlert(alt.id)}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-black/40 hover:bg-black/60 border border-current shrink-0"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {metrics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 bg-[#121214] border border-zinc-800/90 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span className="font-semibold text-zinc-200">CPU Usage</span>
                </div>
                <span className="text-xl font-bold text-white">{metrics.cpu.usagePercent}%</span>
              </div>
              <div className="my-2 h-7 flex items-center">
                {history && history.samples.length > 1 ? (
                  renderSparkline(
                    history.samples.map((s) => s.cpuPercent),
                    "#818cf8"
                  )
                ) : (
                  <div className="w-full bg-zinc-800 h-2 rounded overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full transition-all duration-300"
                      style={{ width: `${metrics.cpu.usagePercent}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 flex justify-between">
                <span>{metrics.cpu.cores} Cores</span>
                <span>Load: {metrics.cpu.loadAverage.join(", ")}</span>
              </div>
            </div>

            <div className="p-3.5 bg-[#121214] border border-zinc-800/90 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-zinc-200">RAM Memory</span>
                </div>
                <span className="text-xl font-bold text-white">{metrics.memory.usedPercent}%</span>
              </div>
              <div className="my-2 h-7 flex items-center">
                {history && history.samples.length > 1 ? (
                  renderSparkline(
                    history.samples.map((s) => s.memoryPercent),
                    "#34d399"
                  )
                ) : (
                  <div className="w-full bg-zinc-800 h-2 rounded overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${metrics.memory.usedPercent}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 flex justify-between">
                <span>Used: {formatBytes(metrics.memory.usedBytes)}</span>
                <span>Total: {formatBytes(metrics.memory.totalBytes)}</span>
              </div>
            </div>

            <div className="p-3.5 bg-[#121214] border border-zinc-800/90 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-zinc-200">Disk Space</span>
                </div>
                <span className="text-xl font-bold text-white">{metrics.disk.usedPercent}%</span>
              </div>
              <div className="my-2 h-7 flex items-center">
                <div className="w-full bg-zinc-800 h-2 rounded overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      metrics.disk.usedPercent > 90 ? "bg-rose-500" : "bg-amber-500"
                    )}
                    style={{ width: `${metrics.disk.usedPercent}%` }}
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 flex justify-between">
                <span>Free: {formatBytes(metrics.disk.freeBytes)}</span>
                <span>Total: {formatBytes(metrics.disk.totalBytes)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="p-3 bg-[#121214] border border-zinc-800/80 rounded-lg flex items-center gap-3">
              {metrics.battery.isCharging ? (
                <BatteryCharging className="w-5 h-5 text-emerald-400" />
              ) : (
                <Battery className="w-5 h-5 text-zinc-400" />
              )}
              <div>
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">
                  Power Source
                </div>
                <div className="text-xs font-medium text-zinc-200">
                  {metrics.battery.percent != null
                    ? `${metrics.battery.percent}% (${metrics.battery.statusText || ""})`
                    : "AC Power"}
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#121214] border border-zinc-800/80 rounded-lg flex items-center gap-3">
              <Clock className="w-5 h-5 text-cyan-400" />
              <div>
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">
                  System Uptime
                </div>
                <div className="text-xs font-medium text-zinc-200">
                  {formatUptime(metrics.systemUptimeSeconds)} (Agent:{" "}
                  {formatUptime(metrics.agentUptimeSeconds)})
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#121214] border border-zinc-800/80 rounded-lg flex items-center gap-3">
              <Wifi className="w-5 h-5 text-blue-400" />
              <div>
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Network IP</div>
                <div className="text-xs font-medium text-zinc-200">
                  {metrics.network.primaryIp || "Local Loopback"}
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#121214] border border-zinc-800/80 rounded-lg flex items-center gap-3">
              <Server className="w-5 h-5 text-purple-400" />
              <div>
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">
                  Host Machine
                </div>
                <div className="text-xs font-medium text-zinc-200 truncate">
                  {metrics.hostname} ({metrics.platform})
                </div>
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-[#121214] border border-zinc-800/90 rounded-lg space-y-3">
            <h3 className="font-semibold text-zinc-200 text-xs flex items-center gap-1.5">
              <FolderGit2 className="w-4 h-4 text-indigo-400" />
              Development Environment Overview
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Active Workspaces</span>
                <span className="font-bold text-white">
                  {metrics.appOverview.activeWorkspacesCount}
                </span>
              </div>
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Running Processes</span>
                <span className="font-bold text-emerald-400">
                  {metrics.appOverview.runningProcessesCount}
                </span>
              </div>
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Active Terminals</span>
                <span className="font-bold text-cyan-400">
                  {metrics.appOverview.activeTerminalsCount}
                </span>
              </div>
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Recent Job Failures</span>
                <span
                  className={cn(
                    "font-bold",
                    metrics.appOverview.recentJobFailuresCount > 0
                      ? "text-rose-400"
                      : "text-zinc-400"
                  )}
                >
                  {metrics.appOverview.recentJobFailuresCount}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
