import { FastifyPluginAsync } from "fastify";
import {
  RegisterDeviceDtoSchema,
  DevicePresenceDtoSchema,
  CatchupAckDtoSchema,
  UpdateRetentionDtoSchema,
  FileDiffQuerySchema,
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
} from "@remote-ide/shared";
import { catchupService } from "../services/catchup.service.js";
import { authenticateClient } from "../services/request-auth.js";

// Device IDs are client-chosen, so a registered device may only be read, re-registered
// or have its cursors advanced by the user who registered it.
function deviceOwnedByOther(deviceId: string, userId: string): boolean {
  const device = catchupService.getDevice(deviceId);
  return !!device && device.userId !== userId;
}

export const catchupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/catchup/device", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorResponse(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const parse = RegisterDeviceDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }

    if (deviceOwnedByOther(parse.data.deviceId, session.userId)) {
      return reply
        .status(403)
        .send(createErrorResponse(ErrorCode.FORBIDDEN, "Device is registered to another user"));
    }

    const device = catchupService.registerDevice({
      deviceId: parse.data.deviceId,
      deviceName: parse.data.deviceName,
      deviceType: parse.data.deviceType,
      userId: session.userId,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    return createSuccessResponse(device);
  });

  fastify.get("/api/v1/catchup/device", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorResponse(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const query = req.query as { deviceId?: string };
    if (!query.deviceId) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, "deviceId is required"));
    }

    const device = catchupService.getDevice(query.deviceId);
    if (!device || device.userId !== session.userId) {
      return reply.status(404).send(createErrorResponse(ErrorCode.NOT_FOUND, "Device not found"));
    }

    return createSuccessResponse(device);
  });

  fastify.post("/api/v1/catchup/presence", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorResponse(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const parse = DevicePresenceDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }

    catchupService.recordPresence(parse.data);
    return createSuccessResponse({ recorded: true });
  });

  fastify.get("/api/v1/catchup/summary", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorResponse(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const query = req.query as Record<string, string | undefined>;
    const workspaceId = query.workspaceId;
    const deviceId = query.deviceId || session.deviceName || "default-device";
    const workspaceName = query.workspaceName;

    if (!workspaceId) {
      return reply
        .status(400)
        .send(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "workspaceId query parameter is required")
        );
    }

    if (
      session.allowedWorkspaceIds &&
      session.allowedWorkspaceIds.length > 0 &&
      !session.allowedWorkspaceIds.includes(workspaceId)
    ) {
      return reply
        .status(403)
        .send(createErrorResponse(ErrorCode.FORBIDDEN, "Workspace access denied"));
    }

    if (deviceOwnedByOther(deviceId, session.userId)) {
      return reply.status(403).send(createErrorResponse(ErrorCode.FORBIDDEN, "Device access denied"));
    }

    try {
      const summary = catchupService.generateCatchup({
        deviceId,
        workspaceId,
        workspaceName,
      });

      return createSuccessResponse(summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate catch-up summary";
      return reply.status(500).send(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, msg));
    }
  });

  fastify.post("/api/v1/catchup/ack", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorResponse(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const parse = CatchupAckDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }

    if (
      session.allowedWorkspaceIds &&
      session.allowedWorkspaceIds.length > 0 &&
      !session.allowedWorkspaceIds.includes(parse.data.workspaceId)
    ) {
      return reply
        .status(403)
        .send(createErrorResponse(ErrorCode.FORBIDDEN, "Workspace access denied"));
    }

    if (deviceOwnedByOther(parse.data.deviceId, session.userId)) {
      return reply.status(403).send(createErrorResponse(ErrorCode.FORBIDDEN, "Device access denied"));
    }

    const result = catchupService.acknowledgeCatchup(parse.data);
    return createSuccessResponse(result);
  });

  fastify.get("/api/v1/catchup/diff", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorResponse(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const parse = FileDiffQuerySchema.safeParse(req.query);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }

    const filePath = parse.data.path;
    if (filePath.includes("..") || filePath.startsWith("/") || filePath.includes(":\\")) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid or forbidden file path"));
    }

    if (
      session.allowedWorkspaceIds &&
      session.allowedWorkspaceIds.length > 0 &&
      !session.allowedWorkspaceIds.includes(parse.data.workspaceId)
    ) {
      return reply
        .status(403)
        .send(createErrorResponse(ErrorCode.FORBIDDEN, "Workspace access denied"));
    }

    try {
      const diff = await catchupService.getFileDiff({
        workspaceId: parse.data.workspaceId,
        path: parse.data.path,
        fromRevision: parse.data.fromRevision,
        toRevision: parse.data.toRevision,
      });

      return createSuccessResponse(diff);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch file diff";
      const status =
        msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("forbidden")
          ? 400
          : 500;
      return reply
        .status(status)
        .send(
          createErrorResponse(
            status === 400 ? ErrorCode.VALIDATION_ERROR : ErrorCode.INTERNAL_SERVER_ERROR,
            msg
          )
        );
    }
  });

  fastify.get("/api/v1/catchup/retention", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorResponse(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const query = req.query as Record<string, string | undefined>;
    const workspaceId = query.workspaceId || "default";
    const policy = catchupService.getRetentionPolicy(workspaceId);
    return createSuccessResponse(policy);
  });

  fastify.put("/api/v1/catchup/retention", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session || !session.isOwner) {
      return reply
        .status(403)
        .send(createErrorResponse(ErrorCode.FORBIDDEN, "Owner authentication required"));
    }

    const parse = UpdateRetentionDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }

    try {
      const policy = catchupService.setRetentionPolicy(
        parse.data.workspaceId,
        parse.data.retentionDays
      );
      return createSuccessResponse(policy);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update retention policy";
      return reply.status(400).send(createErrorResponse(ErrorCode.BAD_REQUEST, msg));
    }
  });

  fastify.post("/api/v1/catchup/prune", async (req, reply) => {
    const session = authenticateClient(req);
    if (!session || !session.isOwner) {
      return reply
        .status(403)
        .send(createErrorResponse(ErrorCode.FORBIDDEN, "Owner authentication required"));
    }

    const query = req.query as Record<string, string | undefined>;
    const res = catchupService.pruneExpiredData(query.workspaceId);
    return createSuccessResponse(res);
  });
};
