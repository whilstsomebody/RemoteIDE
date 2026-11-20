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
