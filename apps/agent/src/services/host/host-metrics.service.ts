import os from "node:os";
import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  HostMetrics,
  HostMetricsSample,
  HostMetricsHistory,
  AlertItem,
  HostBatteryInfo,
  HostDiskInfo,
  HostCpuInfo,
  HostMemoryInfo,
  HostNetworkInfo,
  AppOverviewMetrics,
  generateId,
  logger,
} from "@remote-ide/shared";
import type { ProcessManagerService } from "../process-manager.service.js";
import type { TerminalService } from "../terminal.service.js";
import type { WorkspaceService } from "../workspace.service.js";
import type { JobManagerService } from "../job-manager.service.js";

const execAsync = promisify(exec);

export interface HostMetricsServiceOptions {
  historyLimit?: number;
  sampleIntervalMs?: number;
  diskThresholdPercent?: number;
  cpuThresholdPercent?: number;
  memoryThresholdPercent?: number;
  processManager?: ProcessManagerService;
  terminalService?: TerminalService;
  workspaceService?: WorkspaceService;
  jobManager?: JobManagerService;
}

export class HostMetricsService {
  private historyLimit: number;
  private sampleIntervalMs: number;
  private diskThresholdPercent: number;
  private cpuThresholdPercent: number;
  private memoryThresholdPercent: number;
  private samples: HostMetricsSample[] = [];
  private alerts = new Map<string, AlertItem>();
  private prevCpuTimes: { idle: number; total: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private alertListeners = new Set<(alert: AlertItem) => void>();
  private metricsListeners = new Set<(metrics: HostMetrics) => void>();

  private processManager?: ProcessManagerService;
  private terminalService?: TerminalService;
  private workspaceService?: WorkspaceService;
  private jobManager?: JobManagerService;

  constructor(opts: HostMetricsServiceOptions = {}) {
    this.historyLimit = opts.historyLimit || 60;
    this.sampleIntervalMs = opts.sampleIntervalMs || 5000;
    this.diskThresholdPercent = opts.diskThresholdPercent || 90;
    this.cpuThresholdPercent = opts.cpuThresholdPercent || 95;
    this.memoryThresholdPercent = opts.memoryThresholdPercent || 95;
    this.processManager = opts.processManager;
    this.terminalService = opts.terminalService;
    this.workspaceService = opts.workspaceService;
    this.jobManager = opts.jobManager;

    this.initCpuBaseline();
  }

  public setDependencies(deps: {
    processManager?: ProcessManagerService;
    terminalService?: TerminalService;
    workspaceService?: WorkspaceService;
    jobManager?: JobManagerService;
  }): void {
    if (deps.processManager) this.processManager = deps.processManager;
    if (deps.terminalService) this.terminalService = deps.terminalService;
    if (deps.workspaceService) this.workspaceService = deps.workspaceService;
    if (deps.jobManager) this.jobManager = deps.jobManager;
  }

  public startSampling(): void {
    if (this.timer) return;
    this.takeSample();
    this.timer = setInterval(() => {
      this.takeSample();
    }, this.sampleIntervalMs);
  }

  public stopSampling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private initCpuBaseline(): void {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      for (const [type, time] of Object.entries(cpu.times)) {
        total += time;
        if (type === "idle") idle += time;
      }
    }
    this.prevCpuTimes = { idle, total };
  }

  public getCpuUsage(): HostCpuInfo {
    const cpus = os.cpus();
    const model = cpus[0]?.model || "Generic CPU";
    const cores = cpus.length;
    const loadAvg = os.loadavg() as [number, number, number];

    let currentIdle = 0;
    let currentTotal = 0;
    for (const cpu of cpus) {
      for (const [type, time] of Object.entries(cpu.times)) {
        currentTotal += time;
        if (type === "idle") currentIdle += time;
      }
    }

    let usagePercent = 0;
    if (this.prevCpuTimes) {
      const idleDelta = currentIdle - this.prevCpuTimes.idle;
      const totalDelta = currentTotal - this.prevCpuTimes.total;
      if (totalDelta > 0) {
        usagePercent = Math.max(
          0,
          Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100))
        );
      }
    } else {
      // Estimate based on load average
      usagePercent = Math.min(100, Math.round((loadAvg[0] / cores) * 100));
    }

    this.prevCpuTimes = { idle: currentIdle, total: currentTotal };

    return {
      model,
      cores,
      usagePercent,
      loadAverage: [
        Math.round(loadAvg[0] * 100) / 100,
        Math.round(loadAvg[1] * 100) / 100,
        Math.round(loadAvg[2] * 100) / 100,
      ],
    };
  }

  public getMemoryUsage(): HostMemoryInfo {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = Math.round((usedBytes / totalBytes) * 100);

    return {
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent,
    };
  }

  public getDiskUsage(mountPoint = "/"): HostDiskInfo {
    try {
      const stats = fs.statfsSync(mountPoint);
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bavail;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

      return {
        mountPoint,
        totalBytes,
        usedBytes,
        freeBytes,
        usedPercent,
      };
    } catch {
      return {
        mountPoint,
        totalBytes: 500 * 1024 * 1024 * 1024,
        usedBytes: 150 * 1024 * 1024 * 1024,
        freeBytes: 350 * 1024 * 1024 * 1024,
        usedPercent: 30,
      };
    }
  }

  public async getBatteryInfo(): Promise<HostBatteryInfo> {
    const platform = process.platform;

    if (platform === "darwin") {
      try {
        const { stdout } = await execAsync("pmset -g batt");
        const match = stdout.match(
          /InternalBattery-[0-9]+\s+\(id=[0-9]+\)\s+([0-9]+)%;\s+([^;]+);/i
        );
        if (match) {
          const percent = parseInt(match[1]!, 10);
          const state = match[2]!.trim().toLowerCase();
          const isCharging = state.includes("charging") || state.includes("finishing charge");
          const isACConnected = stdout.includes("AC Power") || isCharging;
          return {
            hasBattery: true,
            percent,
            isCharging,
            isACConnected,
            statusText: state,
          };
        }
        // Desktop Mac or no internal battery detected
        const hasAC = stdout.includes("AC Power");
        return {
          hasBattery: false,
          percent: null,
          isCharging: null,
          isACConnected: hasAC,
          statusText: hasAC ? "AC Connected (No Battery)" : "Connected",
        };
      } catch {
        return {
          hasBattery: false,
          percent: null,
          isCharging: null,
          isACConnected: true,
          statusText: "AC Connected",
        };
      }
    }

    if (platform === "linux") {
      try {
        const base = "/sys/class/power_supply/BAT0";
        if (fs.existsSync(base)) {
          const capStr = fs.readFileSync(`${base}/capacity`, "utf8").trim();
          const statusStr = fs.readFileSync(`${base}/status`, "utf8").trim();
          const percent = parseInt(capStr, 10);
          const isCharging = statusStr.toLowerCase() === "charging";
          return {
            hasBattery: true,
            percent,
            isCharging,
            isACConnected: isCharging || statusStr.toLowerCase() === "full",
            statusText: statusStr,
          };
        }
      } catch {
        // Fallback
      }
    }

    return {
      hasBattery: false,
      percent: null,
      isCharging: null,
      isACConnected: true,
      statusText: "AC Connected",
    };
  }

  public getNetworkInfo(): HostNetworkInfo {
    const interfaces = os.networkInterfaces();
    const list: Array<{ name: string; address: string; family: string; internal: boolean }> = [];
    let primaryIp: string | undefined;

    for (const [name, netList] of Object.entries(interfaces)) {
      if (!netList) continue;
      for (const net of netList) {
        list.push({
          name,
          address: net.address,
          family: net.family,
          internal: net.internal,
        });
        if (!net.internal && net.family === "IPv4" && !primaryIp) {
          primaryIp = net.address;
        }
      }
    }

    return {
      isOnline: list.some((i) => !i.internal),
      primaryIp,
      interfaces: list,
    };
  }

  public async getAppOverview(): Promise<AppOverviewMetrics> {
    let runningProcessesCount = 0;
    let crashedProcessesCount = 0;
    try {
      if (this.processManager) {
        const processes = await this.processManager.listProcesses();
        runningProcessesCount = processes.filter((p) => p.status === "running").length;
        crashedProcessesCount = processes.filter(
          (p) => p.status === "crashed" || (p.status as any) === "error"
        ).length;
      }
    } catch {
      // Ignore if process manager closed
    }

    let activeTerminalsCount = 0;
    try {
      activeTerminalsCount = this.terminalService?.listTerminals().length || 0;
    } catch {
      // Ignore if terminal service closed
    }

    let activeWorkspacesCount = 0;
    try {
      activeWorkspacesCount = this.workspaceService?.listWorkspaces().length || 0;
    } catch {
      // Ignore if workspace DB closed
    }

    let recentFailures: Array<{ id: string; source: string; message: string; timestamp: string }> =
      [];
    try {
      const recentJobs = this.jobManager?.listJobs() || [];
      recentFailures = recentJobs
        .filter((j) => j.status === "failed")
        .slice(-5)
        .map((j) => ({
          id: j.id,
          source: `Job: ${j.name}`,
          message: j.error || "Job failed",
          timestamp: j.completedAt || j.startedAt || new Date().toISOString(),
        }));
    } catch {
      // Ignore if job manager closed
    }

    return {
      activeWorkspacesCount,
      runningProcessesCount,
      crashedProcessesCount,
      activeTerminalsCount,
      recentJobFailuresCount: recentFailures.length,
      recentFailures,
    };
  }

  public async getMetrics(): Promise<HostMetrics> {
    const cpu = this.getCpuUsage();
    const memory = this.getMemoryUsage();
    const disk = this.getDiskUsage();
    const battery = await this.getBatteryInfo();
    const network = this.getNetworkInfo();
    const appOverview = await this.getAppOverview();

    return {
      timestamp: new Date().toISOString(),
      platform: os.platform(),
      hostname: os.hostname(),
      systemUptimeSeconds: Math.floor(os.uptime()),
      agentUptimeSeconds: Math.floor(process.uptime()),
      cpu,
      memory,
      disk,
      battery,
      network,
      appOverview,
    };
  }

  public async takeSample(): Promise<HostMetricsSample | undefined> {
    try {
      const metrics = await this.getMetrics();
      const sample: HostMetricsSample = {
        timestamp: metrics.timestamp,
        cpuPercent: metrics.cpu.usagePercent,
        memoryPercent: metrics.memory.usedPercent,
        diskPercent: metrics.disk.usedPercent,
        loadAvg1m: metrics.cpu.loadAverage[0],
      };

      this.samples.push(sample);
      if (this.samples.length > this.historyLimit) {
        this.samples.shift();
      }

      this.checkAlerts(metrics);

      for (const listener of this.metricsListeners) {
        try {
          listener(metrics);
        } catch (err) {
          logger.error({ err }, "Error in metrics listener");
        }
      }

      return sample;
    } catch (err) {
      logger.warn({ err }, "Failed to collect host metrics sample");
      return undefined;
    }
  }

  public getHistory(): HostMetricsHistory {
    return {
      samples: [...this.samples],
      retentionLimit: this.historyLimit,
      intervalSeconds: Math.round(this.sampleIntervalMs / 1000),
    };
  }

  private checkAlerts(metrics: HostMetrics): void {
    if (metrics.disk.usedPercent >= this.diskThresholdPercent) {
      this.triggerAlert({
        id: "alert-disk-low",
        type: "disk_space_low",
        severity: "critical",
        title: "Low Disk Space Alert",
        message: `Disk usage has reached ${metrics.disk.usedPercent}% (${Math.round(metrics.disk.freeBytes / 1e9)}GB free)`,
        source: "host-monitor",
        timestamp: metrics.timestamp,
        acknowledged: false,
      });
    }

    if (metrics.cpu.usagePercent >= this.cpuThresholdPercent) {
      this.triggerAlert({
        id: "alert-cpu-high",
        type: "cpu_high",
        severity: "warning",
        title: "High CPU Usage",
        message: `CPU usage sustained at ${metrics.cpu.usagePercent}%`,
        source: "host-monitor",
        timestamp: metrics.timestamp,
        acknowledged: false,
      });
    }

    if (metrics.memory.usedPercent >= this.memoryThresholdPercent) {
      this.triggerAlert({
        id: "alert-memory-high",
        type: "memory_high",
        severity: "warning",
        title: "High Memory Usage",
        message: `Memory usage has reached ${metrics.memory.usedPercent}%`,
        source: "host-monitor",
        timestamp: metrics.timestamp,
        acknowledged: false,
      });
    }

    if (metrics.appOverview.crashedProcessesCount > 0) {
      this.triggerAlert({
        id: "alert-process-crash",
        type: "process_crash",
        severity: "warning",
        title: "Managed Process Crash",
        message: `${metrics.appOverview.crashedProcessesCount} process(es) in crashed state`,
        source: "process-manager",
        timestamp: metrics.timestamp,
        acknowledged: false,
      });
    }
  }

  public triggerAlert(alert: AlertItem): void {
    const existing = this.alerts.get(alert.id);
    if (!existing || existing.acknowledged) {
      this.alerts.set(alert.id, alert);
      for (const listener of this.alertListeners) {
        try {
          listener(alert);
        } catch (err) {
          logger.error({ err }, "Error notifying alert listener");
        }
      }
    }
  }

  public recordCustomAlert(
    type: AlertItem["type"],
    severity: AlertItem["severity"],
    title: string,
    message: string,
    source: string,
    metadata?: Record<string, unknown>
  ): AlertItem {
    const alert: AlertItem = {
      id: generateId("alt"),
      type,
      severity,
      title,
      message,
      source,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      metadata,
    };
    this.alerts.set(alert.id, alert);
    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch (err) {
        logger.error({ err }, "Error notifying alert listener");
      }
    }
    return alert;
  }

  public getAlerts(): AlertItem[] {
    return Array.from(this.alerts.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public acknowledgeAlert(id: string): boolean {
    const alert = this.alerts.get(id);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  public clearAlerts(): void {
    this.alerts.clear();
  }

  public onAlert(listener: (alert: AlertItem) => void): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  public onMetrics(listener: (metrics: HostMetrics) => void): () => void {
    this.metricsListeners.add(listener);
    return () => this.metricsListeners.delete(listener);
  }
}

export const hostMetricsService = new HostMetricsService();
