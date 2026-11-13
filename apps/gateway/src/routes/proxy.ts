import { isLocalRequest } from "../services/request-auth.js";
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  Permission,
  requiredRequestPermission,
  routeSegments,
  UserRole,
  hasPermission,
  createErrorEnvelope,
  ErrorCode,
  AppError,
  AuditEventType,
} from "@remote-ide/shared";
import { authService } from "../services/auth.service.js";
import { tunnelRelayService } from "../services/tunnel-relay.service.js";
import { auditService } from "../services/audit.service.js";

export const proxyRoutes: FastifyPluginAsync = async (fastify) => {
  // Shared proxy handler forwarding RPC requests across the reverse tunnel
  const handleProxy = async (req: FastifyRequest, reply: FastifyReply) => {
    // 1. Session authentication
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;
    let token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token && cookieHeader) {
      const match = cookieHeader.match(/remoteide_session=([^;]+)/);
      if (match) token = match[1];
    }

    // Allow local unauthenticated access only if running without owner bootstrap yet and no token was provided
    let session = token ? authService.getSessionByToken(token) : null;

    if (!session) {
      if (!token) {
        const isLoopback =
          isLocalRequest(req);

        if (isLoopback && !authService.isOwnerBootstrapped()) {
          // Fallback local unauthenticated session for initial onboarding
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
          .send(
            createErrorEnvelope(
              ErrorCode.UNAUTHORIZED,
              "Authentication required. Please log in or redeem an access link."
            )
          );
      }
    }

    // 2. Capability verification (Gateway layer)
    const requiredPerm = requiredRequestPermission(req.method, req.url, req.body);

    // Strict owner-only terminal protection
    if (requiredPerm === Permission.TERMINAL_ACCESS && session.role !== UserRole.OWNER) {
      auditService.record(AuditEventType.CAPABILITY_CHECK_FAILED, session.userId, {
        ipAddress: req.ip,
        targetId: req.url,
        metadata: {
          role: session.role,
          requiredPermission: Permission.TERMINAL_ACCESS,
          reason: "terminal_is_strictly_owner_only",
        },
      });

      return reply
        .status(403)
        .send(
          createErrorEnvelope(
            ErrorCode.FORBIDDEN,
            `Access denied. Interactive terminal access is strictly restricted to host owner. Role "${session.role}" is denied.`,
            { details: [{ role: session.role }] }
          )
        );
    }

    const isPermitted = hasPermission(requiredPerm, session.capabilities);

    if (!isPermitted) {
      auditService.record(AuditEventType.CAPABILITY_CHECK_FAILED, session.userId, {
        ipAddress: req.ip,
        targetId: req.url,
        metadata: {
          role: session.role,
          requiredPermission: requiredPerm,
          grantedCapabilities: session.capabilities,
        },
      });

      return reply
        .status(403)
        .send(
          createErrorEnvelope(
            ErrorCode.FORBIDDEN,
            `Access denied. Role "${session.role}" lacks capability "${requiredPerm}".`,
            { details: [{ required: requiredPerm, role: session.role }] }
          )
        );
    }

    const segments = routeSegments(req.url);
    if (segments[2] === "workspaces" &&
        (segments[3] === "register" || (segments.length === 4 && req.method === "DELETE")) &&
        session.role !== UserRole.OWNER) {
      return reply.status(403).send(createErrorEnvelope(ErrorCode.FORBIDDEN, "Only the owner can register or remove host workspaces"));
    }

    // 3. Workspace scope boundary restriction
    if (session.allowedWorkspaceIds && session.allowedWorkspaceIds.length > 0) {
      // Extract workspace ID from URL: e.g. /api/v1/workspaces/:id/...
      const match = segments[2] === "workspaces" && segments[3] ? ["", segments[3]] : null;
      if (match && match[1] && match[1] !== "register" && match[1] !== "active") {
        const targetWsId = match[1];
        if (!session.allowedWorkspaceIds.includes(targetWsId)) {
          auditService.record(AuditEventType.SECURITY_SENSITIVE_OP, session.userId, {
            ipAddress: req.ip,
            targetId: targetWsId,
            metadata: {
              status: "blocked_workspace_boundary_escape",
              allowedWorkspaceIds: session.allowedWorkspaceIds,
            },
          });

          return reply
            .status(403)
            .send(
              createErrorEnvelope(
                ErrorCode.FORBIDDEN,
                `Unauthorized. This access link only permits access to specific workspaces.`,
                { details: [{ targetWorkspaceId: targetWsId }] }
              )
            );
        }
      }
    }

    // 4. Forward across reverse tunnel to Host Agent with auth context
    try {
      const response = await tunnelRelayService.forwardRequest(session.hostId, {
        method: req.method,
        path: req.url,
        query: req.query as Record<string, string | string[]>,
        headers: {
          ...(req.headers as Record<string, string>),
          "x-remoteide-session-id": session.id,
          "x-remoteide-role": session.role,
        },
        body: req.body,
        authContext: {
          sessionId: session.id,
          userId: session.userId,
          role: session.role,
          capabilities: session.capabilities,
          allowedWorkspaceIds: session.allowedWorkspaceIds,
        },
      });

      // Set headers from agent response
      if (response.headers) {
        for (const [k, v] of Object.entries(response.headers)) {
          reply.header(k, v);
        }
      }

      if (segments[2] === "preview") {
        reply.removeHeader("set-cookie");
        reply.header("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups");
        reply.header("Referrer-Policy", "no-referrer");
      }
      return reply.status(response.statusCode).send(
        response.bodyEncoding === "base64" && typeof response.body === "string"
          ? Buffer.from(response.body, "base64") : response.body
      );
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply
          .status(err.statusCode)
          .send(createErrorEnvelope(err.code, err.message, { details: err.details }));
      }
      return reply
        .status(502)
        .send(
          createErrorEnvelope(
            ErrorCode.SERVICE_UNAVAILABLE,
            `Failed to communicate with host agent: ${(err as Error).message}`
          )
        );
    }
  };

  fastify.all("/api/v1/workspaces*", handleProxy);
  fastify.all("/api/v1/terminals*", handleProxy);
  fastify.all("/api/v1/jobs*", handleProxy);
  fastify.all("/api/v1/files*", handleProxy);
  fastify.all("/api/v1/git*", handleProxy);
  fastify.all("/api/v1/processes*", handleProxy);
  fastify.all("/api/v1/ports*", handleProxy);
  fastify.all("/api/v1/preview*", handleProxy);
  fastify.all("/api/v1/api-client*", handleProxy);
};
