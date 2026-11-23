import { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  CreateHandoffDtoSchema,
  createSuccessEnvelope,
  createErrorEnvelope,
  AppError,
  ErrorCode,
  UserRole,
  formatZodIssues,
} from "@remote-ide/shared";
import { isLocalRequest } from "../services/request-auth.js";
import { authService } from "../services/auth.service.js";
import { handoffService } from "../services/handoff.service.js";

export const handoffRoutes: FastifyPluginAsync = async (fastify) => {
  const getSessionFromRequest = (req: FastifyRequest) => {
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;
    let token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token && cookieHeader) {
      const match =
        cookieHeader.match(/remoteide_session=([^;]+)/) ||
        cookieHeader.match(/remote_ide_token=([^;]+)/);
      if (match) token = match[1];
    }

    let session = token ? authService.getSessionByToken(token) : null;
    if (!session && !token) {
      const isLoopback = isLocalRequest(req);
      if (isLoopback && !authService.isOwnerBootstrapped()) {
        session = {
          id: "local-dev-session",
          userId: "owner-local",
          hostId: "local-host-agent",
          role: UserRole.OWNER,
          capabilities: [],
          allowedWorkspaceIds: [],
          deviceName: "Local Dev Machine",
          ipAddress: "127.0.0.1",
          userAgent: (req.headers["user-agent"] as string) || "Local Browser",
          isOwner: true,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          isRevoked: false,
        };
      }
    }
    return session;
  };

  fastify.post("/api/v1/handoff", async (req, reply) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required for handoff"));
    }

    const parseResult = CreateHandoffDtoSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send(
          createErrorEnvelope(
            ErrorCode.VALIDATION_ERROR,
            `Invalid handoff payload: ${formatZodIssues(parseResult.error.issues)}`
          )
        );
    }

    const handoff = handoffService.stageHandoff({
      userId: session.userId,
      sourceDeviceId: session.id,
      sourceDeviceName: session.deviceName || "Desktop",
      sourceUserAgent: (req.headers["user-agent"] as string) || session.userAgent || "",
      dto: parseResult.data,
    });

    return reply.status(201).send(createSuccessEnvelope(handoff));
  });

  fastify.get("/api/v1/handoff/pending", async (req, reply) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const query = req.query as { deviceId?: string };
    const pending = handoffService.getPendingHandoff(session.userId, query.deviceId || session.id);
    return reply.send(createSuccessEnvelope(pending));
  });

  fastify.post("/api/v1/handoff/:id/consume", async (req, reply) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const { id } = req.params as { id: string };
    try {
      const consumed = handoffService.consumeHandoff(id, session.userId);
      return reply.send(createSuccessEnvelope(consumed));
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(createErrorEnvelope(err.code, err.message));
      }
      return reply
        .status(500)
        .send(createErrorEnvelope(ErrorCode.INTERNAL_SERVER_ERROR, (err as Error).message));
    }
  });

  fastify.get("/api/v1/devices/active", async (req, reply) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return reply
        .status(401)
        .send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const devices = handoffService.listActiveDevices(session.userId, session.id);
    return reply.send(createSuccessEnvelope(devices));
  });
};
