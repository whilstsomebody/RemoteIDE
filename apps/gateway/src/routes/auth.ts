import { FastifyPluginAsync } from "fastify";
import {
  BootstrapOwnerDtoSchema,
  LoginDtoSchema,
  createSuccessEnvelope,
  createErrorEnvelope,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { authService } from "../services/auth.service.js";
import { auditService } from "../services/audit.service.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Check auth status
  fastify.get("/api/v1/auth/status", async (req, reply) => {
    const isBootstrapped = authService.isOwnerBootstrapped();
    const isLoopback =
      req.ip === "127.0.0.1" ||
      req.ip === "::1" ||
      req.ip === "::ffff:127.0.0.1" ||
      req.hostname === "localhost";

    return reply.send(
      createSuccessEnvelope({
        isBootstrapped,
        isLocal: isLoopback,
        // Only disclose local setup token if accessed directly from loopback
        localSetupToken: isLoopback ? authService.getSetupToken() : undefined,
      })
    );
  });

  // 1. Owner account bootstrap (loopback only)
  fastify.post("/api/v1/auth/bootstrap", async (req, reply) => {
    const validation = BootstrapOwnerDtoSchema.safeParse(req.body);
    if (!validation.success) {
      return reply.status(400).send(
        createErrorEnvelope(ErrorCode.VALIDATION_ERROR, "Invalid owner bootstrap parameters", {
          details: formatZodIssues(validation.error.issues),
        })
      );
    }

    try {
      const result = await authService.bootstrapOwner({
        ...validation.data,
        remoteIp: req.ip,
        userAgent: req.headers["user-agent"],
      });

      // Set secure session cookie
      reply.header(
        "Set-Cookie",
        `remoteide_session=${result.sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${
          30 * 24 * 3600
        }`
      );

      return reply.send(
        createSuccessEnvelope({
          user: {
            id: result.user.id,
            email: result.user.email,
            displayName: result.user.displayName,
            role: result.user.role,
            isOwner: result.user.isOwner,
          },
          session: result.session,
          sessionToken: result.sessionToken,
        })
      );
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

  // 2. Owner / User login
  fastify.post("/api/v1/auth/login", async (req, reply) => {
    const validation = LoginDtoSchema.safeParse(req.body);
    if (!validation.success) {
      return reply
        .status(400)
        .send(createErrorEnvelope(ErrorCode.VALIDATION_ERROR, "Invalid login parameters"));
    }

    try {
      const result = await authService.login({
        ...validation.data,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      reply.header(
        "Set-Cookie",
        `remoteide_session=${result.sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${
          7 * 24 * 3600
        }`
      );

      return reply.send(
        createSuccessEnvelope({
          user: {
            id: result.user.id,
            email: result.user.email,
            displayName: result.user.displayName,
            role: result.user.role,
            isOwner: result.user.isOwner,
          },
          session: result.session,
          sessionToken: result.sessionToken,
        })
      );
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply
          .status(err.statusCode)
          .send(createErrorEnvelope(err.code, err.message, { details: err.details }));
      }
      return reply
        .status(401)
        .send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Invalid login credentials"));
    }
  });

  // 3. Logout (revokes current session)
  fastify.post("/api/v1/auth/logout", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;
    let token = authHeader?.replace(/^Bearer\s+/i, "");

    if (!token && cookieHeader) {
      const match = cookieHeader.match(/remoteide_session=([^;]+)/);
      if (match) token = match[1];
    }

    if (token) {
      const session = authService.getSessionByToken(token);
      if (session) {
        authService.revokeSession(session.id, session.userId);
      }
    }

    reply.header("Set-Cookie", "remoteide_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");

    return reply.send(createSuccessEnvelope({ loggedOut: true }));
  });

  // 4. List active sessions
  fastify.get("/api/v1/auth/sessions", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;
    let token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token && cookieHeader) {
      const match = cookieHeader.match(/remoteide_session=([^;]+)/);
      if (match) token = match[1];
    }

    const currentSession = token ? authService.getSessionByToken(token) : null;
    if (!currentSession) {
      return reply
        .status(401)
        .send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const sessions = authService.listActiveSessions();
    return reply.send(
      createSuccessEnvelope({
        currentSessionId: currentSession.id,
        sessions,
      })
    );
  });

  // 5. Revoke session
  fastify.delete("/api/v1/auth/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    const currentSession = token ? authService.getSessionByToken(token) : null;

    if (!currentSession || !currentSession.isOwner) {
      return reply
        .status(403)
        .send(createErrorEnvelope(ErrorCode.FORBIDDEN, "Only owner can revoke remote sessions"));
    }

    const success = authService.revokeSession(id, currentSession.userId);
    return reply.send(createSuccessEnvelope({ revoked: success, sessionId: id }));
  });

  // 6. Audit records
  fastify.get("/api/v1/auth/audit", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    const currentSession = token ? authService.getSessionByToken(token) : null;

    if (!currentSession || !currentSession.isOwner) {
      return reply
        .status(403)
        .send(createErrorEnvelope(ErrorCode.FORBIDDEN, "Only owner can inspect audit log"));
    }

    const records = auditService.getRecent(100);
    return reply.send(createSuccessEnvelope(records));
  });
};
