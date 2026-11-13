import { z } from "zod";

export const ManagedProcessStatusSchema = z.enum(["starting", "running", "stopped", "crashed"]);
export type ManagedProcessStatus = z.infer<typeof ManagedProcessStatusSchema>;

export const ProcessStatsSchema = z.object({
  cpuPercent: z.number().default(0),
  memoryMb: z.number().default(0),
  uptimeSeconds: z.number().default(0),
});
export type ProcessStats = z.infer<typeof ProcessStatsSchema>;

export const ManagedProcessSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  cwd: z.string(),
  pid: z.number().int().optional(),
  status: ManagedProcessStatusSchema,
  exitCode: z.number().nullable().optional(),
  signal: z.string().nullable().optional(),
  startedAt: z.string(),
  stoppedAt: z.string().optional(),
  env: z.record(z.string()).default({}),
  stats: ProcessStatsSchema.optional(),
  restartCount: z.number().int().default(0),
});
export type ManagedProcess = z.infer<typeof ManagedProcessSchema>;

export const StartProcessDtoSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(64),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
});
export type StartProcessDto = z.infer<typeof StartProcessDtoSchema>;

export const ProcessActionDtoSchema = z.object({
  action: z.enum(["stop", "restart", "kill"]),
});
export type ProcessActionDto = z.infer<typeof ProcessActionDtoSchema>;
