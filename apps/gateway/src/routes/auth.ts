import { isLocalRequest } from "../services/request-auth.js";
import { FastifyPluginAsync } from "fastify";
import {
  BootstrapOwnerDtoSchema,
  LoginDtoSchema,
  createSuccessEnvelope,
  createErrorEnvelope,
  AppError,
  ErrorCode,
  UserRole,
  Permission,
  formatZodIssues,
} from "@remote-ide/shared";
import { authService } from "../services/auth.service.js";
import { auditService } from "../services/audit.service.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/auth/me", async (req, reply) => {
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
          capabilities: [
            Permission.FS_READ,
            Permission.FS_WRITE,
            Permission.FS_DELETE,
            Permission.FS_TRANSFER,
            Permission.GIT_OPERATION,
            Permission.GIT_READ,
            Permission.GIT_WRITE,
            Permission.GIT_PUSH,
            Permission.GIT_DESTRUCTIVE,
            Permission.TASK_EXECUTE,
            Permission.TERMINAL_ACCESS,
            Permission.TERMINAL_EXECUTE,
            Permission.PROCESS_CONTROL,
            Permission.PORT_FORWARD,
            Permission.PREVIEW_ACCESS,
          ],
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

    if (!session) {
      return reply
        .status(401)
        .send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "No active session"));
    }

    return reply.send(
      createSuccessEnvelope({
        sessionId: session.id,
        userId: session.userId,
        role: session.role,
        isOwner: session.isOwner,
        capabilities: session.capabilities,
        allowedWorkspaceIds: session.allowedWorkspaceIds,
        deviceName: session.deviceName,
      })
    );
  });
  fastify.get("/api/v1/auth/status", async (req, reply) => {
    const isBootstrapped = authService.isOwnerBootstrapped();
    const isLoopback =
      isLocalRequest(req);

    return reply.send(
      createSuccessEnvelope({
        isBootstrapped,
        isLocal: isLoopback,
        // Only disclose local setup token if accessed directly from loopback
        localSetupToken: isLoopback ? authService.getSetupToken() : undefined,
      })
    );
  });

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

  fastify.get("/api/v1/auth/sessions", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;
    let token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token && cookieHeader) {
      const match =
        cookieHeader.match(/remoteide_session=([^;]+)/) ||
        cookieHeader.match(/remote_ide_token=([^;]+)/);
      if (match) token = match[1];
    }

    let currentSession = token ? authService.getSessionByToken(token) : null;
    if (!currentSession && !token) {
      const isLoopback =
        isLocalRequest(req);

      if (isLoopback && !authService.isOwnerBootstrapped()) {
        currentSession = {
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

    if (!currentSession) {
      return reply
        .status(401)
        .send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const canView =
      currentSession.isOwner ||
      currentSession.role === UserRole.OWNER ||
      currentSession.role === UserRole.OPERATOR ||
      currentSession.role === UserRole.DEVELOPER;

    if (!canView) {
      return reply
        .status(403)
        .send(
          createErrorEnvelope(
            ErrorCode.FORBIDDEN,
            "Only owner, operator, or developer can view active sessions"
          )
        );
    }

    const sessions = authService.listActiveSessions();
    return reply.send(
      createSuccessEnvelope({
        currentSessionId: currentSession.id,
        sessions,
      })
    );
  });

  fastify.delete("/api/v1/auth/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;
    let token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token && cookieHeader) {
      const match =
        cookieHeader.match(/remoteide_session=([^;]+)/) ||
        cookieHeader.match(/remote_ide_token=([^;]+)/);
      if (match) token = match[1];
    }
    const currentSession = token ? authService.getSessionByToken(token) : null;

    const canRevoke =
      currentSession?.isOwner ||
      currentSession?.role === UserRole.OWNER ||
      currentSession?.role === UserRole.OPERATOR;

    if (!currentSession || !canRevoke) {
      return reply
        .status(403)
        .send(
          createErrorEnvelope(
            ErrorCode.FORBIDDEN,
            "Only owner or operator can revoke remote sessions"
          )
        );
    }

    const success = authService.revokeSession(id, currentSession.userId);
    return reply.send(createSuccessEnvelope({ revoked: success, sessionId: id }));
  });

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

  fastify.post("/api/v1/auth/mfa/setup", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    const session = token ? authService.getSessionByToken(token) : null;
    if (!session) {
      return reply.status(401).send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    try {
      const result = authService.setupMfa(session.userId);
      return reply.send(createSuccessEnvelope(result));
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(createErrorEnvelope(err.code, err.message, { details: err.details }));
      }
      return reply.status(500).send(createErrorEnvelope(ErrorCode.INTERNAL_SERVER_ERROR, (err as Error).message));
    }
  });

  fastify.post<{ Body: { code?: string } }>("/api/v1/auth/mfa/verify", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    const session = token ? authService.getSessionByToken(token) : null;
    if (!session) {
      return reply.status(401).send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const code = req.body?.code;
    if (!code) {
      return reply.status(400).send(createErrorEnvelope(ErrorCode.VALIDATION_ERROR, "Verification code is required"));
    }

    try {
      const result = authService.verifyAndEnableMfa(session.userId, code);
      return reply.send(createSuccessEnvelope(result));
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(createErrorEnvelope(err.code, err.message, { details: err.details }));
      }
      return reply.status(500).send(createErrorEnvelope(ErrorCode.INTERNAL_SERVER_ERROR, (err as Error).message));
    }
  });

  fastify.post<{ Body: { code?: string } }>("/api/v1/auth/mfa/disable", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    const session = token ? authService.getSessionByToken(token) : null;
    if (!session) {
      return reply.status(401).send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const code = req.body?.code;
    if (!code) {
      return reply.status(400).send(createErrorEnvelope(ErrorCode.VALIDATION_ERROR, "Code is required to disable MFA"));
    }

    try {
      const result = authService.disableMfa(session.userId, code);
      return reply.send(createSuccessEnvelope({ disabled: result }));
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(createErrorEnvelope(err.code, err.message, { details: err.details }));
      }
      return reply.status(500).send(createErrorEnvelope(ErrorCode.INTERNAL_SERVER_ERROR, (err as Error).message));
    }
  });

  fastify.post<{ Body: { mfaTicket?: string; code?: string } }>("/api/v1/auth/mfa/authenticate", async (req, reply) => {
    const { mfaTicket, code } = req.body || {};
    if (!mfaTicket || !code) {
      return reply.status(400).send(createErrorEnvelope(ErrorCode.VALIDATION_ERROR, "mfaTicket and code are required"));
    }

    try {
      const result = authService.authenticateMfa(mfaTicket, code);

      reply.header(
        "Set-Cookie",
        `remoteide_session=${result.sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 3600}`
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
        return reply.status(err.statusCode).send(createErrorEnvelope(err.code, err.message, { details: err.details }));
      }
      return reply.status(401).send(createErrorEnvelope(ErrorCode.UNAUTHORIZED, "Invalid MFA code"));
    }
  });
};
