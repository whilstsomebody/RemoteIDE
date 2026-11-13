import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { isLoopbackAddress, ROLE_PERMISSIONS, UserRole, type RemoteSession } from "@remote-ide/shared";
import { authService } from "./auth.service.js";

export function isLocalRequest(req: FastifyRequest): boolean {
  return process.env.NODE_ENV !== "production" && isLoopbackAddress(req.ip) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(req.hostname);
}

export function authenticateAgent(req: FastifyRequest): boolean {
  const expected = process.env.AGENT_AUTH_TOKEN;
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (expected) {
    if (!supplied) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  // Local development only; production and remote agents require a shared secret.
  return !req.headers.origin && !supplied && isLocalRequest(req);
}

export function authenticateClient(req: FastifyRequest): RemoteSession | null {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    req.headers.cookie?.match(/(?:^|;\s*)remoteide_session=([^;]+)/)?.[1];
  if (token) return authService.getSessionByToken(token);
  if (!isLocalRequest(req) || authService.isOwnerBootstrapped()) return null;
  return {
    id: "local-dev-session", userId: "local-owner", hostId: "local-host-agent",
    role: UserRole.OWNER, capabilities: ROLE_PERMISSIONS[UserRole.OWNER],
    allowedWorkspaceIds: [], deviceName: "Local Host", ipAddress: req.ip,
    userAgent: req.headers["user-agent"] || "", isOwner: true,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), isRevoked: false,
  };
}
