import { z } from "zod";
import { UserRole, Permission } from "./capabilities.js";

// ==========================================
// 1. Share Link Contracts
// ==========================================

export const CreateShareLinkDtoSchema = z.object({
  name: z.string().min(1).max(64).default("Temporary Access Link"),
  role: z.nativeEnum(UserRole).default(UserRole.VIEWER),
  allowedWorkspaceIds: z.array(z.string()).default([]),
  expiresInSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 30)
    .default(3600), // 1 hour default
  oneTimeRedemption: z.boolean().default(true),
  pin: z.string().min(4).max(32).optional(),
  maxConcurrentSessions: z.number().int().min(1).max(10).default(1),
});

export type CreateShareLinkDto = z.infer<typeof CreateShareLinkDtoSchema>;

export const ShareLinkSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.nativeEnum(UserRole),
  allowedWorkspaceIds: z.array(z.string()),
  expiresAt: z.string(),
  oneTimeRedemption: z.boolean(),
  hasPin: z.boolean(),
  maxConcurrentSessions: z.number(),
  usedCount: z.number(),
  isRevoked: z.boolean(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
});

export type ShareLink = z.infer<typeof ShareLinkSchema>;

export const RedeemShareLinkDtoSchema = z.object({
  token: z.string().min(10),
  pin: z.string().optional(),
  deviceName: z.string().max(128).optional(),
});

export type RedeemShareLinkDto = z.infer<typeof RedeemShareLinkDtoSchema>;

// ==========================================
// 2. Authentication & Session Contracts
// ==========================================

export const BootstrapOwnerDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).default("Host Owner"),
  localSetupToken: z.string().min(8),
});

export type BootstrapOwnerDto = z.infer<typeof BootstrapOwnerDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().max(128).optional(),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const RemoteSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  hostId: z.string(),
  role: z.nativeEnum(UserRole),
  capabilities: z.array(z.nativeEnum(Permission)),
  allowedWorkspaceIds: z.array(z.string()),
  deviceName: z.string(),
  ipAddress: z.string(),
  userAgent: z.string(),
  isOwner: z.boolean(),
  createdAt: z.string(),
  expiresAt: z.string(),
  isRevoked: z.boolean(),
  revokedAt: z.string().optional(),
});

export type RemoteSession = z.infer<typeof RemoteSessionSchema>;

// ==========================================
// 3. Audit Record Contracts
// ==========================================

export enum AuditEventType {
  OWNER_BOOTSTRAP = "owner.bootstrap",
  LOGIN_SUCCESS = "auth.login.success",
  LOGIN_FAILURE = "auth.login.failure",
  LOGOUT = "auth.logout",
  SHARE_LINK_CREATED = "share_link.created",
  SHARE_LINK_REDEEMED = "share_link.redeemed",
  SHARE_LINK_REVOKED = "share_link.revoked",
  SHARE_LINK_EXPIRED = "share_link.expired",
  SESSION_REVOKED = "session.revoked",
  SESSION_EXPIRED = "session.expired",
  CAPABILITY_CHECK_FAILED = "security.capability.failed",
  SECURITY_SENSITIVE_OP = "security.sensitive.operation",
  HOST_CONNECTED = "host.tunnel.connected",
  HOST_DISCONNECTED = "host.tunnel.disconnected",
}

export const AuditRecordSchema = z.object({
  id: z.string(),
  eventType: z.nativeEnum(AuditEventType),
  actorId: z.string(),
  targetId: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

export type AuditRecord = z.infer<typeof AuditRecordSchema>;

// ==========================================
// 4. Reverse Tunnel RPC Contracts
// ==========================================

export enum TunnelMessageType {
  AGENT_REGISTER = "tunnel.agent.register",
  AGENT_REGISTERED = "tunnel.agent.registered",
  TUNNEL_REQUEST = "tunnel.http.request",
  TUNNEL_RESPONSE = "tunnel.http.response",
  TUNNEL_HEARTBEAT = "tunnel.heartbeat",
  TUNNEL_HEARTBEAT_ACK = "tunnel.heartbeat.ack",
  SESSION_REVOCATION = "tunnel.session.revoked",
  TERMINAL_ATTACH = "tunnel.terminal.attach",
  TERMINAL_ATTACHED = "tunnel.terminal.attached",
  TERMINAL_DATA = "tunnel.terminal.data",
  TERMINAL_RESIZE = "tunnel.terminal.resize",
  TERMINAL_CLOSE = "tunnel.terminal.close",
}

export interface TunnelHttpRequestPayload {
  correlationId: string;
  method: string;
  path: string;
  query?: Record<string, string | string[]>;
  headers: Record<string, string>;
  body?: unknown;
  authContext?: {
    sessionId: string;
    userId: string;
    role: UserRole;
    capabilities: Permission[];
    allowedWorkspaceIds: string[];
  };
}

export interface TunnelHttpResponsePayload {
  bodyEncoding?: "base64";
  correlationId: string;
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
