import { z } from "zod";

export const TerminalStatusSchema = z.enum(["running", "exited"]);
export type TerminalStatus = z.infer<typeof TerminalStatusSchema>;

export const TerminalSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  shell: z.string(),
  cwd: z.string(),
  cols: z.number().int().min(1).default(80),
  rows: z.number().int().min(1).default(24),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  status: TerminalStatusSchema,
  exitCode: z.number().nullable().optional(),
  tmuxSessionName: z.string().optional(),
  pid: z.number().optional(),
});
export type TerminalSession = z.infer<typeof TerminalSessionSchema>;

export const CreateTerminalDtoSchema = z.object({
  name: z.string().optional(),
  shell: z.string().optional(),
  cwd: z.string().optional(),
  cols: z.number().int().min(10).max(500).default(80),
  rows: z.number().int().min(5).max(200).default(24),
  useTmux: z.boolean().default(false),
});
export type CreateTerminalDto = z.infer<typeof CreateTerminalDtoSchema>;

export const TerminalResizeDtoSchema = z.object({
  cols: z.number().int().min(10).max(500),
  rows: z.number().int().min(5).max(200),
});
export type TerminalResizeDto = z.infer<typeof TerminalResizeDtoSchema>;

export type TerminalWsMessageType =
  "input" | "output" | "resize" | "attach" | "attached" | "ping" | "pong" | "exit" | "error";

export interface TerminalWsMessage {
  type: TerminalWsMessageType;
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  code?: number;
  message?: string;
  buffer?: string;
}
