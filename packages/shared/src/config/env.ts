import { z } from "zod";

export const NodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

export const BaseConfigSchema = z.object({
  NODE_ENV: NodeEnvSchema,
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export const GatewayEnvSchema = BaseConfigSchema.extend({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://remoteide:remoteide_dev_pass@localhost:5432/remoteide_db"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  KAFKA_BROKERS: z.string().default("localhost:9092"),
  JWT_SECRET: z.string().min(16).default("dev-super-secret-jwt-key-min-16-chars"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

export const AgentEnvSchema = BaseConfigSchema.extend({
  PORT: z.coerce.number().default(4001),
  HOST: z.string().default("127.0.0.1"),
  GATEWAY_WS_URL: z.string().default("ws://localhost:4000/api/v1/ws"),
  AGENT_AUTH_TOKEN: z.string().default("dev-agent-token-1234567890"),
  HOST_IDENTIFIER: z.string().default("local-host-agent"),
  SQLITE_JOURNAL_PATH: z.string().default("./data/agent-journal.sqlite"),
  ALLOWED_PROJECT_ROOTS: z.string().default(process.cwd()),
});

export const WorkerEnvSchema = BaseConfigSchema.extend({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://remoteide:remoteide_dev_pass@localhost:5432/remoteide_db"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  KAFKA_BROKERS: z.string().default("localhost:9092"),
  CONCURRENCY: z.coerce.number().default(5),
});

export const WebEnvSchema = z.object({
  NEXT_PUBLIC_GATEWAY_HTTP_URL: z.string().default("http://localhost:4000"),
  NEXT_PUBLIC_GATEWAY_WS_URL: z.string().default("ws://localhost:4000/api/v1/ws"),
});

export type GatewayEnv = z.infer<typeof GatewayEnvSchema>;
export type AgentEnv = z.infer<typeof AgentEnvSchema>;
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;
export type WebEnv = z.infer<typeof WebEnvSchema>;

export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  rawEnv: Record<string, string | undefined> = process.env
): z.infer<T> {
  const result = schema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  return result.data;
}
