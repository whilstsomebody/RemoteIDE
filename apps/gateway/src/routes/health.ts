import { FastifyPluginAsync } from "fastify";
import { HealthStatus, createSuccessResponse, type HealthCheckResult } from "@remote-ide/shared";
import { redisService } from "../services/redis.service.js";
import { kafkaService } from "../services/kafka.service.js";
import { outboxService } from "../services/outbox.service.js";
import { tunnelRelayService } from "../services/tunnel-relay.service.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const startTime = Date.now();

  const handleHealth = async () => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const mem = process.memoryUsage();
    const redisConnected = redisService.getConnected();
    const kafkaConnected = kafkaService.isBrokerConnected();
    const outboxStats = outboxService.getOutboxStats();
    const isHostConnected = tunnelRelayService.isHostOnline();

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
        redis: {
          status: redisConnected ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
          details: {
            connected: redisConnected,
            fallbackActive: !redisConnected,
          },
        },
        kafka: {
          status: kafkaConnected ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
          details: {
            connected: kafkaConnected,
            outboxPending: outboxStats.pendingCount,
            outboxFailed: outboxStats.failedCount,
          },
        },
        tunnelRelay: {
          status: HealthStatus.HEALTHY,
          details: {
            hostOnline: isHostConnected,
            activeClientSockets: tunnelRelayService.getClientSocketCount(),
          },
        },
      },
    };

    return createSuccessResponse(healthData);
  };

  const handleLiveness = async () => {
    return createSuccessResponse({
      alive: true,
      service: "@remote-ide/gateway",
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  };

  const handleReadiness = async (_req: unknown, reply: { status: (code: number) => { send: (data: unknown) => unknown } }) => {
    // Service is ready if basic memory and relay infrastructure are operational
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));
    const isReady = heapUsedMb < 1024; // Less than 1GB heap limit

    if (!isReady) {
      return reply.status(503).send({
        ready: false,
        service: "@remote-ide/gateway",
        reason: "Heap limit exceeded",
      });
    }

    return createSuccessResponse({
      ready: true,
      service: "@remote-ide/gateway",
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      redisConnected: redisService.getConnected(),
      kafkaConnected: kafkaService.isBrokerConnected(),
      timestamp: new Date().toISOString(),
    });
  };

  // Full health
  fastify.get("/health", handleHealth);
  fastify.get("/api/v1/health", handleHealth);

  // Kubernetes Liveness probe
  fastify.get("/health/liveness", handleLiveness);
  fastify.get("/api/v1/health/liveness", handleLiveness);

  // Kubernetes Readiness probe
  fastify.get("/health/readiness", handleReadiness);
  fastify.get("/api/v1/health/readiness", handleReadiness);
  fastify.get("/ready", handleReadiness);
};
