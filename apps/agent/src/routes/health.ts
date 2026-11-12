import { FastifyPluginAsync } from "fastify";
import { HealthStatus, createSuccessResponse, type HealthCheckResult } from "@remote-ide/shared";
import { HostLocalJournal } from "../journal/sqlite-journal.js";

export const healthRoutes: FastifyPluginAsync<{ journal: HostLocalJournal }> = async (
  fastify,
  opts
) => {
  const startTime = Date.now();

  const handleHealth = async () => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const journalHealth = opts.journal.checkHealth();

    const healthData: HealthCheckResult = {
      status: journalHealth.healthy ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
      service: "@remote-ide/agent",
      version: "0.1.0",
      uptimeSeconds,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      components: {
        journal: {
          status: journalHealth.healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
          details: {
            dbPath: journalHealth.dbPath,
            error: journalHealth.error,
          },
        },
      },
    };

    return createSuccessResponse(healthData);
  };

  fastify.get("/health", handleHealth);
  fastify.get("/api/v1/health", handleHealth);
};
