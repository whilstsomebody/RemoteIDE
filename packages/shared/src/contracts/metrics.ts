import { z } from "zod";

export const HostBatteryInfoSchema = z.object({
  hasBattery: z.boolean(),
  percent: z.number().nullable(),
  isCharging: z.boolean().nullable(),
  isACConnected: z.boolean().nullable(),
  statusText: z.string().optional(),
});
export type HostBatteryInfo = z.infer<typeof HostBatteryInfoSchema>;

export const HostCpuInfoSchema = z.object({
  model: z.string(),
  cores: z.number().int(),
  usagePercent: z.number(),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]), // 1m, 5m, 15m
});
export type HostCpuInfo = z.infer<typeof HostCpuInfoSchema>;

export const HostMemoryInfoSchema = z.object({
  totalBytes: z.number(),
  usedBytes: z.number(),
  freeBytes: z.number(),
  usedPercent: z.number(),
});
export type HostMemoryInfo = z.infer<typeof HostMemoryInfoSchema>;

export const HostDiskInfoSchema = z.object({
  mountPoint: z.string(),
  totalBytes: z.number(),
  usedBytes: z.number(),
  freeBytes: z.number(),
  usedPercent: z.number(),
});
export type HostDiskInfo = z.infer<typeof HostDiskInfoSchema>;

export const HostNetworkInfoSchema = z.object({
  isOnline: z.boolean(),
  primaryIp: z.string().optional(),
  interfaces: z.array(
    z.object({
      name: z.string(),
      address: z.string(),
      family: z.string(),
      internal: z.boolean(),
    })
  ),
});
export type HostNetworkInfo = z.infer<typeof HostNetworkInfoSchema>;

export const AppOverviewMetricsSchema = z.object({
  activeWorkspacesCount: z.number().int(),
  runningProcessesCount: z.number().int(),
  crashedProcessesCount: z.number().int(),
  activeTerminalsCount: z.number().int(),
  recentJobFailuresCount: z.number().int(),
  recentFailures: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      message: z.string(),
      timestamp: z.string(),
    })
  ),
});
export type AppOverviewMetrics = z.infer<typeof AppOverviewMetricsSchema>;

export const HostMetricsSchema = z.object({
  timestamp: z.string(),
  platform: z.string(),
  hostname: z.string(),
  systemUptimeSeconds: z.number(),
  agentUptimeSeconds: z.number(),
  cpu: HostCpuInfoSchema,
  memory: HostMemoryInfoSchema,
  disk: HostDiskInfoSchema,
  battery: HostBatteryInfoSchema,
  network: HostNetworkInfoSchema,
  appOverview: AppOverviewMetricsSchema,
});
export type HostMetrics = z.infer<typeof HostMetricsSchema>;

export const HostMetricsSampleSchema = z.object({
  timestamp: z.string(),
  cpuPercent: z.number(),
  memoryPercent: z.number(),
  diskPercent: z.number(),
  loadAvg1m: z.number(),
});
export type HostMetricsSample = z.infer<typeof HostMetricsSampleSchema>;

export const HostMetricsHistorySchema = z.object({
  samples: z.array(HostMetricsSampleSchema),
  retentionLimit: z.number().int(),
  intervalSeconds: z.number().int(),
});
export type HostMetricsHistory = z.infer<typeof HostMetricsHistorySchema>;

export const AlertSeveritySchema = z.enum(["info", "warning", "critical"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertItemSchema = z.object({
  id: z.string(),
  type: z.enum([
    "host_offline",
    "disk_space_low",
    "cpu_high",
    "memory_high",
    "process_crash",
    "job_failure",
    "container_unhealthy",
    "agent_connectivity",
  ]),
  severity: AlertSeveritySchema,
  title: z.string(),
  message: z.string(),
  source: z.string(),
  timestamp: z.string(),
  acknowledged: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});
export type AlertItem = z.infer<typeof AlertItemSchema>;

