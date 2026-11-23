import { FastifyPluginAsync } from "fastify";
import { createSuccessResponse, AppError, ErrorCode } from "@remote-ide/shared";
import { HostMetricsService, hostMetricsService } from "../services/host/host-metrics.service.js";

export const hostMetricsRoutes: FastifyPluginAsync<{
  hostMetricsService?: HostMetricsService;
}> = async (fastify, opts) => {
  const service = opts.hostMetricsService || hostMetricsService;

  fastify.get("/api/v1/host/metrics", async () => {
    const metrics = await service.getMetrics();
    return createSuccessResponse(metrics);
  });

  fastify.get("/api/v1/host/metrics/history", async () => {
    const history = service.getHistory();
    return createSuccessResponse(history);
  });

  fastify.get("/api/v1/host/alerts", async () => {
    const alerts = service.getAlerts();
    return createSuccessResponse(alerts);
  });

  fastify.post<{
    Params: { id: string };
  }>("/api/v1/host/alerts/:id/ack", async (request) => {
    const success = service.acknowledgeAlert(request.params.id);
    if (!success) {
      throw new AppError(ErrorCode.NOT_FOUND, `Alert ${request.params.id} not found`);
    }
    return createSuccessResponse({ acknowledged: true, id: request.params.id });
  });

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

