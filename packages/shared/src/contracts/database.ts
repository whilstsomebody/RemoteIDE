import { z } from "zod";

export const DatabaseEngineSchema = z.enum(["sqlite", "postgres", "mysql"]);
export type DatabaseEngine = z.infer<typeof DatabaseEngineSchema>;

export const DatabaseProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: DatabaseEngineSchema,
  database: z.string(), // File path for SQLite, db name for Postgres/MySQL
  host: z.string().optional(),
  port: z.number().int().optional(),
  user: z.string().optional(),
  hasPassword: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  status: z.enum(["untested", "connected", "error"]).default("untested"),
  lastTestedAt: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type DatabaseProfile = z.infer<typeof DatabaseProfileSchema>;

export const CreateDatabaseProfileDtoSchema = z.object({
  name: z.string().min(1),
  type: DatabaseEngineSchema,
  database: z.string().min(1),
  host: z.string().optional(),
  port: z.number().int().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  isDefault: z.boolean().optional(),
});
export type CreateDatabaseProfileDto = z.infer<typeof CreateDatabaseProfileDtoSchema>;

export const DatabaseTestResultSchema = z.object({
  success: z.boolean(),
  latencyMs: z.number(),
  version: z.string().optional(),
  error: z.string().optional(),
});
export type DatabaseTestResult = z.infer<typeof DatabaseTestResultSchema>;

export const ColumnMetadataSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean().default(false),
  defaultValue: z.string().nullable().optional(),
});
export type ColumnMetadata = z.infer<typeof ColumnMetadataSchema>;

export const TableMetadataSchema = z.object({
  name: z.string(),
  type: z.enum(["table", "view"]).default("table"),
  rowCountEstimate: z.number().int().default(0),
  columns: z.array(ColumnMetadataSchema),
});
export type TableMetadata = z.infer<typeof TableMetadataSchema>;

export const TableDataResultSchema = z.object({
  tableName: z.string(),
  totalRows: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
});
export type TableDataResult = z.infer<typeof TableDataResultSchema>;

export const SqlQueryResultSchema = z.object({
  query: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number().int(),
  executionTimeMs: z.number(),
  error: z.string().optional(),
});
export type SqlQueryResult = z.infer<typeof SqlQueryResultSchema>;

export const SqlQueryDtoSchema = z.object({
  profileId: z.string().min(1),
  query: z.string().min(1),
  maxRows: z.number().int().min(1).max(500).default(100),
  timeoutMs: z.number().int().min(100).max(10000).default(5000),
});
export type SqlQueryDto = z.infer<typeof SqlQueryDtoSchema>;

