import { z } from "zod";

export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
}

export const ComponentHealthSchema = z.object({
  status: z.nativeEnum(HealthStatus),
  message: z.string().optional(),
  latencyMs: z.number().optional(),
  details: z.record(z.unknown()).optional(),
});

export const HealthCheckResultSchema = z.object({
  status: z.nativeEnum(HealthStatus),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
  environment: z.string(),
  components: z.record(ComponentHealthSchema).optional(),
});

export type HealthStatusType = HealthStatus;
export type ComponentHealth = z.infer<typeof ComponentHealthSchema>;
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;

