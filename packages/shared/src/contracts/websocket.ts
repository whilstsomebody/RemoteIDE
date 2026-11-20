import { z } from "zod";

export const WS_PROTOCOL_VERSION = "1.0.0";

export enum WsMessageType {
  // Connection lifecycle
  PING = "ping",
  PONG = "pong",
  CONNECT = "connect",
  CONNECTED = "connected",
  DISCONNECT = "disconnect",
  ERROR = "error",

  // Host registration and heartbeat
  AGENT_REGISTER = "agent:register",
  AGENT_REGISTERED = "agent:registered",
  AGENT_HEARTBEAT = "agent:heartbeat",
  AGENT_STATUS = "agent:status",

  // Client session & pairing
  CLIENT_ATTACH = "client:attach",
  CLIENT_ATTACHED = "client:attached",

  // Capabilities & Permissions
  CAPABILITIES_QUERY = "capabilities:query",
  CAPABILITIES_REPORT = "capabilities:report",

  // Generic request / response RPC over WS
  RPC_REQUEST = "rpc:request",
  RPC_RESPONSE = "rpc:response",

  // Stream & event channels
  STREAM_START = "stream:start",
  STREAM_DATA = "stream:data",
  STREAM_END = "stream:end",

  // Device & Catchup sync
  DEVICE_PRESENCE = "device:presence",
  DEVICE_SYNC_CURSOR = "device:sync_cursor",

  // LSP & Debugger streams
  LSP_NOTIFICATION = "lsp:notification",
  DEBUG_EVENT = "debug:event",
  TEST_EVENT = "test:event",

  // DevOps & Host Monitoring
  METRICS_UPDATE = "metrics:update",
  HOST_ALERT = "host:alert",

  // Cross-Device Handoff
  HANDOFF_AVAILABLE = "handoff:available",
  HANDOFF_ACCEPTED = "handoff:accepted",

  // Collaborative Editing (Phase 11)
  COLLAB_JOIN = "collab:join",
  COLLAB_JOINED = "collab:joined",
  COLLAB_LEAVE = "collab:leave",
  COLLAB_SYNC_STEP1 = "collab:sync_step1",
  COLLAB_SYNC_STEP2 = "collab:sync_step2",
  COLLAB_UPDATE = "collab:update",
  COLLAB_AWARENESS = "collab:awareness",
  COLLAB_ROLE_REQUEST = "collab:role_request",
  COLLAB_ROLE_ASSIGNED = "collab:role_assigned",
  COLLAB_KICK = "collab:kick",
  COLLAB_EXTERNAL_CHANGE = "collab:external_change",
  COLLAB_CONFLICT_RESOLVED = "collab:conflict_resolved",
  COLLAB_COMMENT_ADD = "collab:comment_add",
  COLLAB_COMMENT_LIST = "collab:comment_list",
  COLLAB_PROPOSAL_ADD = "collab:proposal_add",
  COLLAB_PROPOSAL_ACTION = "collab:proposal_action",
}

export const WsBaseEnvelopeSchema = z.object({
  version: z.string().default(WS_PROTOCOL_VERSION),
  type: z.nativeEnum(WsMessageType),
  id: z.string(), // Request or Message ID
  correlationId: z.string().optional(),
  timestamp: z.string(),
  payload: z.unknown(),
});

export const WsEnvelopeSchema = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  WsBaseEnvelopeSchema.extend({
    payload: payloadSchema,
  });

export interface WsEnvelope<T = unknown> {
  version: string;
  type: WsMessageType;
  id: string;
  correlationId?: string;
  timestamp: string;
  payload: T;
}

export interface WsErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export function createWsMessage<T>(
  type: WsMessageType,
  payload: T,
  options?: { id?: string; correlationId?: string; version?: string }
): WsEnvelope<T> {
  return {
    version: options?.version ?? WS_PROTOCOL_VERSION,
    type,
    id:
      options?.id ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)),
    correlationId: options?.correlationId,
    timestamp: new Date().toISOString(),
    payload,
  };
}
