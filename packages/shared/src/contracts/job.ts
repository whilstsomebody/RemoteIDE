import { z } from "zod";

export const JobStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobLogEntrySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  timestamp: z.string(),
  stream: z.enum(["stdout", "stderr", "system"]),
  data: z.string(),
});
export type JobLogEntry = z.infer<typeof JobLogEntrySchema>;

export const JobDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  cwd: z.string(),
  owner: z.string(),
  status: JobStatusSchema,
  idempotencyKey: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  exitCode: z.number().nullable().optional(),
  error: z.string().optional(),
  timeoutMs: z.number().int().positive().default(1800000), // 30 min default
});
export type JobDefinition = z.infer<typeof JobDefinitionSchema>;

export const CreateJobDtoSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional(),
  idempotencyKey: z.string().optional(),
  timeoutMs: z.number().int().positive().optional().default(1800000),
});
export type CreateJobDto = z.infer<typeof CreateJobDtoSchema>;

export type JobLifecycleEventType =
  "job.created" | "job.started" | "job.completed" | "job.failed" | "job.cancelled";

export interface JobLifecycleEvent {
  type: JobLifecycleEventType;
  jobId: string;
  timestamp: string;
  job: JobDefinition;
}
