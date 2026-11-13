import { isLocalRequest } from "../services/request-auth.js";
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  CreateShareLinkDtoSchema,
  RedeemShareLinkDtoSchema,
  createSuccessEnvelope,
  createErrorEnvelope,
  AppError,
  ErrorCode,
  UserRole,
  formatZodIssues,
} from "@remote-ide/shared";
import { shareLinkService } from "../services/share-link.service.js";
import { authService } from "../services/auth.service.js";

export const shareLinkRoutes: FastifyPluginAsync = async (fastify) => {
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
      const isLoopback =
        isLocalRequest(req);

      if (isLoopback && !authService.isOwnerBootstrapped()) {
        session = {
          id: "local-dev-session",
          userId: "local-owner",
          hostId: "local-host-agent",
          role: UserRole.OWNER,
          capabilities: [],
          allowedWorkspaceIds: [],
          deviceName: "Local Host",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] || "",
          isOwner: true,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          isRevoked: false,
        };
      }
    }
    return session;
  };

  // 1. Create a share link (Owner or Operator only)
  fastify.post("/api/v1/share-links", async (req, reply) => {
    const currentSession = getSessionFromRequest(req);
    const canCreate =
      currentSession?.isOwner ||
      currentSession?.role === UserRole.OWNER ||
      currentSession?.role === UserRole.OPERATOR;

    if (!currentSession || !canCreate) {
      return reply
        .status(403)
        .send(
          createErrorEnvelope(
            ErrorCode.FORBIDDEN,
            "Only host owner or operator can generate temporary share links"
          )
        );
    }

    const validation = CreateShareLinkDtoSchema.safeParse(req.body);
    if (!validation.success) {
      return reply.status(400).send(
        createErrorEnvelope(ErrorCode.VALIDATION_ERROR, "Invalid share link parameters", {
          details: formatZodIssues(validation.error.issues),
        })
      );
    }

    if (currentSession.allowedWorkspaceIds.length > 0 &&
        (!validation.data.allowedWorkspaceIds.length || validation.data.allowedWorkspaceIds.some((id) => !currentSession.allowedWorkspaceIds.includes(id)))) {
      return reply.status(403).send(createErrorEnvelope(ErrorCode.FORBIDDEN, "Share link cannot exceed your workspace scope"));
    }
    const result = shareLinkService.createShareLink(currentSession.userId, validation.data);
    return reply.status(201).send(createSuccessEnvelope(result));
  });

  // 2. List share links
  fastify.get("/api/v1/share-links", async (req, reply) => {
    const currentSession = getSessionFromRequest(req);
    if (!currentSession || !currentSession.isOwner) {
      return reply
        .status(403)
        .send(createErrorEnvelope(ErrorCode.FORBIDDEN, "Owner access required"));
    }

    const links = shareLinkService.listShareLinks();
    return reply.send(createSuccessEnvelope(links));
  });

  // 3. Revoke share link
  fastify.delete("/api/v1/share-links/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const currentSession = getSessionFromRequest(req);

    if (!currentSession || !currentSession.isOwner) {
      return reply
        .status(403)
        .send(createErrorEnvelope(ErrorCode.FORBIDDEN, "Owner access required"));
    }

    const revoked = shareLinkService.revokeShareLink(id, currentSession.userId);
    return reply.send(createSuccessEnvelope({ revoked, id }));
  });

  // 4. Redeem a share link into an active session
  fastify.post("/api/v1/share-links/redeem", async (req, reply) => {
    const validation = RedeemShareLinkDtoSchema.safeParse(req.body);
    if (!validation.success) {
      return reply
        .status(400)
        .send(
          createErrorEnvelope(
            ErrorCode.VALIDATION_ERROR,
            "Invalid redemption request. Token is required.",
            { details: formatZodIssues(validation.error.issues) }
          )
        );
    }

    try {
      const result = shareLinkService.redeemShareLink(
        validation.data,
        req.ip,
        req.headers["user-agent"]
      );

      reply.header(
        "Set-Cookie",
        `remoteide_session=${result.sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${
          8 * 3600
        }`
      );

      return reply.send(createSuccessEnvelope(result));
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply
          .status(err.statusCode)
          .send(createErrorEnvelope(err.code, err.message, { details: err.details }));
      }
      return reply
        .status(500)
        .send(createErrorEnvelope(ErrorCode.INTERNAL_SERVER_ERROR, (err as Error).message));
    }
  });
};
