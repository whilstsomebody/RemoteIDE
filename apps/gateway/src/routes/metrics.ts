import { FastifyPluginAsync } from "fastify";
import { createSuccessResponse } from "@remote-ide/shared";
import { telemetryService } from "../services/telemetry.service.js";

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/metrics", async (_req, reply) => {
    const prometheusText = telemetryService.getPrometheusMetrics();
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return reply.send(prometheusText);
  });

  fastify.get("/api/v1/metrics", async (_req, reply) => {
    const snapshot = telemetryService.getMetricsSnapshot();
    return reply.send(createSuccessResponse(snapshot));
  });
};
