import { z } from "zod";

export const EventEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    id: z.string(),
    specVersion: z.literal("1.0"),
    type: z.string(),
    source: z.string(),
    subject: z.string().optional(),
    time: z.string(),
    correlationId: z.string().optional(),
    dataContentType: z.literal("application/json"),
    data: dataSchema,
  });

export interface EventEnvelope<T = unknown> {
  id: string;
  specVersion: "1.0";
  type: string;
  source: string;
  subject?: string;
  time: string;
  correlationId?: string;
  dataContentType: "application/json";
  data: T;
}

export enum DomainEventType {
  HOST_CONNECTED = "remoteide.host.connected",
  HOST_DISCONNECTED = "remoteide.host.disconnected",
  HOST_HEARTBEAT = "remoteide.host.heartbeat",
  SESSION_CREATED = "remoteide.session.created",
  SESSION_REVOKED = "remoteide.session.revoked",
  CLIENT_CONNECTED = "remoteide.client.connected",
  CLIENT_DISCONNECTED = "remoteide.client.disconnected",
  FS_FILE_CHANGED = "remoteide.fs.file_changed",
  TERMINAL_ACTIVITY = "remoteide.terminal.activity",
  AUDIT_LOG_RECORDED = "remoteide.audit.logged",
}

export function createEventEnvelope<T>(
  type: string,
  source: string,
  data: T,
  options?: { id?: string; subject?: string; correlationId?: string }
): EventEnvelope<T> {
  return {
    id:
      options?.id ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)),
    specVersion: "1.0",
    type,
    source,
    subject: options?.subject,
    time: new Date().toISOString(),
    correlationId: options?.correlationId,
    dataContentType: "application/json",
    data,
  };
}
