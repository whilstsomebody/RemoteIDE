import { FastifyPluginAsync } from "fastify";
import {
  SyncEventsDtoSchema,
  ReconcileEventsDtoSchema,
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
} from "@remote-ide/shared";
import { syncService } from "../services/sync.service.js";

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Submit pending events from host agent (with host sequence numbers)
  fastify.post("/api/v1/sync/events", async (req, reply) => {
    const parse = SyncEventsDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }

    try {
      const result = await syncService.syncAgentEvents(parse.data.hostId, parse.data.events);
      return createSuccessResponse(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sync agent events";
      return reply.status(500).send(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, msg));
    }
  });

  // 2. Client reconciliation: fetch events since a specific revision
  fastify.get("/api/v1/sync/reconcile", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const parse = ReconcileEventsDtoSchema.safeParse({
      workspaceId: query.workspaceId,
      sinceRevision: query.sinceRevision ? parseInt(query.sinceRevision, 10) : 0,
      limit: query.limit ? parseInt(query.limit, 10) : 100,
    });

    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }

    try {
      const result = await syncService.reconcileClient(
        parse.data.workspaceId,
        parse.data.sinceRevision,
        parse.data.limit
      );
      return createSuccessResponse(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reconcile events";
      return reply.status(500).send(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, msg));
    }
  });

  // 3. Operational & Performance metrics
  fastify.get("/api/v1/sync/metrics", async (_req, _reply) => {
    const metrics = syncService.getMetrics();
    return createSuccessResponse(metrics);
  });
};
