import { z } from "zod";

export enum TestStatus {
  PASSED = "passed",
  FAILED = "failed",
  SKIPPED = "skipped",
  RUNNING = "running",
}

export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  fullName: z.string(),
  filePath: z.string(),
  line: z.number().int().optional(),
  status: z.nativeEnum(TestStatus).optional(),
  durationMs: z.number().optional(),
  error: z
    .object({
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

export const TestSuiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  filePath: z.string(),
  tests: z.array(TestCaseSchema),
  durationMs: z.number().optional(),
});
export type TestSuite = z.infer<typeof TestSuiteSchema>;

export const TestRunScopeSchema = z.enum(["all", "file", "single", "failed"]);
export type TestRunScope = z.infer<typeof TestRunScopeSchema>;

export const RunTestsDtoSchema = z.object({
  workspaceId: z.string().min(1),
  scope: TestRunScopeSchema.default("all"),
  filePath: z.string().optional(),
  testName: z.string().optional(),
  failedOnly: z.boolean().default(false),
});
export type RunTestsDto = z.infer<typeof RunTestsDtoSchema>;

export const TestFailureSchema = z.object({
  testName: z.string(),
  filePath: z.string(),
  line: z.number().int().optional(),
  message: z.string(),
  stack: z.string().optional(),
});
export type TestFailure = z.infer<typeof TestFailureSchema>;

export const TestLogEntrySchema = z.object({
  stream: z.enum(["stdout", "stderr"]),
  data: z.string(),
  timestamp: z.string(),
});
export type TestLogEntry = z.infer<typeof TestLogEntrySchema>;

export const CoverageSummarySchema = z.object({
  lines: z.object({ total: z.number(), covered: z.number(), pct: z.number() }),
  statements: z.object({ total: z.number(), covered: z.number(), pct: z.number() }),
  functions: z.object({ total: z.number(), covered: z.number(), pct: z.number() }),
  branches: z.object({ total: z.number(), covered: z.number(), pct: z.number() }),
});
export type CoverageSummary = z.infer<typeof CoverageSummarySchema>;

export const TestRunResultSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  scope: TestRunScopeSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().nonnegative(),
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failures: z.array(TestFailureSchema),
  logs: z.array(TestLogEntrySchema),
  coverage: CoverageSummarySchema.optional(),
});
export type TestRunResult = z.infer<typeof TestRunResultSchema>;
