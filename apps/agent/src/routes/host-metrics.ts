import { FastifyPluginAsync } from "fastify";
import { createSuccessResponse, AppError, ErrorCode } from "@remote-ide/shared";
import { HostMetricsService, hostMetricsService } from "../services/host/host-metrics.service.js";

export const hostMetricsRoutes: FastifyPluginAsync<{
  hostMetricsService?: HostMetricsService;
}> = async (fastify, opts) => {
  const service = opts.hostMetricsService || hostMetricsService;

  // Get current metrics snapshot
  fastify.get("/api/v1/host/metrics", async () => {
    const metrics = await service.getMetrics();
    return createSuccessResponse(metrics);
  });

  // Get bounded historical metrics
  fastify.get("/api/v1/host/metrics/history", async () => {
    const history = service.getHistory();
    return createSuccessResponse(history);
  });

  // Get active and recent alerts
  fastify.get("/api/v1/host/alerts", async () => {
    const alerts = service.getAlerts();
    return createSuccessResponse(alerts);
  });

  // Acknowledge an alert
  fastify.post<{
    Params: { id: string };
  }>("/api/v1/host/alerts/:id/ack", async (request) => {
    const success = service.acknowledgeAlert(request.params.id);
    if (!success) {
      throw new AppError(ErrorCode.NOT_FOUND, `Alert ${request.params.id} not found`);
    }
    return createSuccessResponse({ acknowledged: true, id: request.params.id });
  });

  // Record a custom alert
  fastify.post<{
    Body: {
      type: any;
      severity: any;
      title: string;
      message: string;
      source: string;
      metadata?: Record<string, unknown>;
    };
  }>("/api/v1/host/alerts", async (request) => {
    const body = request.body;
    if (!body || !body.type || !body.title || !body.message) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "type, title, and message are required");
    }

    const alert = service.recordCustomAlert(
      body.type,
      body.severity || "warning",
      body.title,
      body.message,
      body.source || "user",
      body.metadata
    );

    return createSuccessResponse(alert);
  });
};

