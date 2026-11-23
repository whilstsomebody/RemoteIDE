import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HostMetricsService } from "../src/services/host/host-metrics.service.js";

describe("Phase 9 — Host Monitoring & Metrics Collection", () => {
  let service: HostMetricsService;

  beforeEach(() => {
    service = new HostMetricsService({
      historyLimit: 10,
      sampleIntervalMs: 50,
      diskThresholdPercent: 90,
      cpuThresholdPercent: 95,
      memoryThresholdPercent: 95,
    });
  });

  afterEach(() => {
    service.stopSampling();
    service.clearAlerts();
  });

  it("collects accurate CPU, RAM, Disk, and Network metrics from host", async () => {
    const metrics = await service.getMetrics();

    expect(metrics).toBeDefined();
    expect(metrics.hostname).toBeDefined();
    expect(metrics.platform).toBeDefined();
    expect(metrics.systemUptimeSeconds).toBeGreaterThan(0);

    expect(metrics.cpu.cores).toBeGreaterThan(0);
    expect(metrics.cpu.usagePercent).toBeGreaterThanOrEqual(0);
    expect(metrics.cpu.usagePercent).toBeLessThanOrEqual(100);
    expect(metrics.cpu.loadAverage.length).toBe(3);

    expect(metrics.memory.totalBytes).toBeGreaterThan(0);
    expect(metrics.memory.usedBytes).toBeGreaterThan(0);
    expect(metrics.memory.freeBytes).toBeGreaterThan(0);
    expect(metrics.memory.usedPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.memory.usedPercent).toBeLessThanOrEqual(100);

    expect(metrics.disk.totalBytes).toBeGreaterThan(0);
    expect(metrics.disk.usedPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.disk.usedPercent).toBeLessThanOrEqual(100);

    expect(Array.isArray(metrics.network.interfaces)).toBe(true);

    expect(metrics.appOverview).toBeDefined();
    expect(metrics.appOverview.activeWorkspacesCount).toBeGreaterThanOrEqual(0);
  });

  it("stores bounded short-lived historical samples in a ring buffer", async () => {
    service.startSampling();

    // Wait for at least 3 samples
    await new Promise((resolve) => setTimeout(resolve, 200));
    service.stopSampling();

    const history = service.getHistory();
    expect(history.samples.length).toBeGreaterThanOrEqual(2);
    expect(history.samples.length).toBeLessThanOrEqual(10);
    expect(history.retentionLimit).toBe(10);

    const first = history.samples[0]!;
    expect(first.timestamp).toBeDefined();
    expect(first.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(first.memoryPercent).toBeGreaterThanOrEqual(0);
  });

  it("triggers and acknowledges alerts according to configured thresholds", () => {
    const alert = service.recordCustomAlert(
      "disk_space_low",
      "critical",
      "Disk space critical",
      "Disk is at 98% capacity",
      "test"
    );

    expect(alert.id).toBeDefined();
    expect(alert.acknowledged).toBe(false);

    let alerts = service.getAlerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.type).toBe("disk_space_low");

    const acked = service.acknowledgeAlert(alert.id);
    expect(acked).toBe(true);

    alerts = service.getAlerts();
    expect(alerts[0]!.acknowledged).toBe(true);
  });
});
