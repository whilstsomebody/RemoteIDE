import { z } from "zod";

export const ProblemSeveritySchema = z.enum(["error", "warning", "info", "hint"]);
export type ProblemSeverity = z.infer<typeof ProblemSeveritySchema>;

export const ProblemSourceSchema = z.enum(["lsp", "test", "build", "syntax"]);
export type ProblemSource = z.infer<typeof ProblemSourceSchema>;

export const ProblemItemSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  filePath: z.string(),
  line: z.number().int().positive(),
  col: z.number().int().positive(),
  message: z.string(),
  severity: ProblemSeveritySchema,
  source: ProblemSourceSchema,
  code: z.union([z.string(), z.number()]).optional(),
  relatedInformation: z.string().optional(),
});
export type ProblemItem = z.infer<typeof ProblemItemSchema>;

export const ProblemFilterDtoSchema = z.object({
  workspaceId: z.string().min(1),
  filePath: z.string().optional(),
  severity: ProblemSeveritySchema.optional(),
  source: ProblemSourceSchema.optional(),
  query: z.string().optional(),
});
export type ProblemFilterDto = z.infer<typeof ProblemFilterDtoSchema>;
