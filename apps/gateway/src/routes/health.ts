import { FastifyPluginAsync } from "fastify";
import { HealthStatus, createSuccessResponse, type HealthCheckResult } from "@remote-ide/shared";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const startTime = Date.now();

  const handleHealth = async () => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const mem = process.memoryUsage();

    const healthData: HealthCheckResult = {
      status: HealthStatus.HEALTHY,
      service: "@remote-ide/gateway",
      version: "0.1.0",
      uptimeSeconds,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      components: {
        memory: {
          status: HealthStatus.HEALTHY,
          details: {
            rssMb: Math.round(mem.rss / (1024 * 1024)),
            heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
          },
        },
      },
    };

    return createSuccessResponse(healthData);
  };

  fastify.get("/health", handleHealth);
  fastify.get("/api/v1/health", handleHealth);
};

