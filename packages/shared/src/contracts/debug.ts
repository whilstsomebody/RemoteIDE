import { z } from "zod";

export enum DebugSessionStatus {
  LAUNCHING = "launching",
  RUNNING = "running",
  PAUSED = "paused",
  TERMINATED = "terminated",
  FAILED = "failed",
}

export const SourceBreakpointSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive().optional(),
  condition: z.string().optional(),
  hitCondition: z.string().optional(),
  logMessage: z.string().optional(),
});
export type SourceBreakpoint = z.infer<typeof SourceBreakpointSchema>;

export const BreakpointSchema = z.object({
  id: z.number().int(),
  verified: z.boolean(),
  line: z.number().int().positive(),
  column: z.number().int().positive().optional(),
  source: z.object({ path: z.string() }).optional(),
  message: z.string().optional(),
});
export type Breakpoint = z.infer<typeof BreakpointSchema>;

export const StackFrameSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  source: z
    .object({
      path: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative(),
});
export type StackFrame = z.infer<typeof StackFrameSchema>;

export const ScopeSchema = z.object({
  name: z.string(),
  variablesReference: z.number().int(),
  expensive: z.boolean().optional(),
});
export type Scope = z.infer<typeof ScopeSchema>;

export const VariableSchema = z.object({
  name: z.string(),
  value: z.string(),
  type: z.string().optional(),
  variablesReference: z.number().int(),
});
export type Variable = z.infer<typeof VariableSchema>;

export const DebugSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  type: z.enum(["node", "python"]),
  status: z.nativeEnum(DebugSessionStatus),
  startedAt: z.string(),
  stoppedDetails: z
    .object({
      reason: z.enum(["breakpoint", "step", "pause", "exception", "entry"]),
      description: z.string().optional(),
      threadId: z.number().int(),
      text: z.string().optional(),
    })
    .optional(),
  pid: z.number().optional(),
  port: z.number().optional(),
  program: z.string().optional(),
  args: z.array(z.string()).optional(),
  error: z.string().optional(),
});
export type DebugSession = z.infer<typeof DebugSessionSchema>;

// --- Debug DTOs ---

export const LaunchDebugDtoSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().default("Debug Session"),
  type: z.enum(["node", "python"]).default("node"),
  program: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  stopOnEntry: z.boolean().default(false),
});
export type LaunchDebugDto = z.infer<typeof LaunchDebugDtoSchema>;

export const AttachDebugDtoSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().default("Attach Session"),
  type: z.enum(["node", "python"]).default("node"),
  port: z.number().int().positive(),
  host: z.string().default("127.0.0.1"),
});
export type AttachDebugDto = z.infer<typeof AttachDebugDtoSchema>;

export const SetBreakpointsDtoSchema = z.object({
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  path: z.string().min(1),
  breakpoints: z.array(SourceBreakpointSchema),
});
export type SetBreakpointsDto = z.infer<typeof SetBreakpointsDtoSchema>;

export const EvaluateDtoSchema = z.object({
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  expression: z.string().min(1),
  frameId: z.number().int().optional(),
  context: z.enum(["watch", "repl", "hover"]).default("repl"),
});
export type EvaluateDto = z.infer<typeof EvaluateDtoSchema>;

export const EvaluateResultSchema = z.object({
  result: z.string(),
  type: z.string().optional(),
  variablesReference: z.number().int().default(0),
});
export type EvaluateResult = z.infer<typeof EvaluateResultSchema>;
