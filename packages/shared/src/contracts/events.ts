import { z } from "zod";

// 1. CloudEvents & Foundation Envelope

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

// 2. Kafka Topics & Durable Event Schemas

export enum KafkaTopic {
  WORKSPACE_EVENTS = "workspace.events",
  SESSION_EVENTS = "session.events",
  TERMINAL_EVENTS = "terminal.events",
  PROCESS_EVENTS = "process.events",
  GIT_EVENTS = "git.events",
  JOB_EVENTS = "job.events",
  AUDIT_EVENTS = "audit.events",
  WORKSPACE_NOTIFICATIONS = "workspace.notifications",
}

export const ALL_KAFKA_TOPICS = [
  KafkaTopic.WORKSPACE_EVENTS,
  KafkaTopic.SESSION_EVENTS,
  KafkaTopic.TERMINAL_EVENTS,
  KafkaTopic.PROCESS_EVENTS,
  KafkaTopic.GIT_EVENTS,
  KafkaTopic.JOB_EVENTS,
  KafkaTopic.AUDIT_EVENTS,
  KafkaTopic.WORKSPACE_NOTIFICATIONS,
] as const;

export enum WorkspaceEventType {
  FILE_CREATED = "workspace.file.created",
  FILE_UPDATED = "workspace.file.updated",
  FILE_DELETED = "workspace.file.deleted",
  FILE_RENAMED = "workspace.file.renamed",
  DIRECTORY_CREATED = "workspace.directory.created",
  DIRECTORY_DELETED = "workspace.directory.deleted",
  WORKSPACE_STATE_CHANGED = "workspace.state.changed",
  GIT_STATUS_CHANGED = "git.status.changed",
  GIT_COMMIT = "git.commit",
  GIT_BRANCH = "git.branch",
  PROCESS_STATE_CHANGED = "process.state.changed",
  PROCESS_CRASHED = "process.crashed",
  PROCESS_RESTARTED = "process.restarted",
  PROCESS_STOPPED = "process.stopped",
  JOB_STATE_CHANGED = "job.state.changed",
  JOB_STARTED = "job.started",
  JOB_COMPLETED = "job.completed",
  JOB_FAILED = "job.failed",
  DEVICE_PRESENCE_CHANGED = "session.presence.changed",
  SESSION_EXPIRED = "session.expired",
  SESSION_REVOKED = "session.revoked",
  PERMISSIONS_UPDATED = "session.permissions.updated",
}

export const DurableEventSchema = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  z.object({
    id: z.string(),
    version: z.number().int().default(1),
    type: z.string(),
    hostId: z.string(),
    workspaceId: z.string().nullable().optional(),
    sessionId: z.string().nullable().optional(),
    deviceId: z.string().nullable().optional(),
    actorId: z.string(),
    timestamp: z.string(),
    revision: z.number().int().nullable().optional(),
    payload: payloadSchema,
    correlationId: z.string().nullable().optional(),
  });

export interface DurableEvent<T = Record<string, unknown>> {
  id: string;
  version: number;
  type: string;
  hostId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  deviceId?: string | null;
  actorId: string;
  timestamp: string;
  revision?: number | null;
  payload: T;
  correlationId?: string | null;
}

export function createDurableEvent<T extends Record<string, unknown>>(
  params: Omit<DurableEvent<T>, "id" | "version" | "timestamp"> & {
    id?: string;
    version?: number;
    timestamp?: string;
  }
): DurableEvent<T> {
  return {
    id:
      params.id ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)),
    version: params.version ?? 1,
    type: params.type,
    hostId: params.hostId,
    workspaceId: params.workspaceId ?? null,
    sessionId: params.sessionId ?? null,
    deviceId: params.deviceId ?? null,
    actorId: params.actorId,
    timestamp: params.timestamp ?? new Date().toISOString(),
    revision: params.revision ?? null,
    payload: params.payload,
    correlationId: params.correlationId ?? null,
  };
}

// 3. Host Journal Submission & Synchronization DTOs

export const HostPendingEventSchema = z.object({
  eventId: z.string(),
  sequenceNumber: z.number().int(),
  workspaceId: z.string(),
  type: z.string(),
  operationType: z.string().optional(),
  relativePath: z.string().optional(),
  fileVersion: z.string().nullable().optional(),
  payload: z.record(z.unknown()).default({}),
  timestamp: z.string(),
});
export type HostPendingEvent = z.infer<typeof HostPendingEventSchema>;

export const SyncEventsDtoSchema = z.object({
  hostId: z.string(),
  events: z.array(HostPendingEventSchema),
});
export type SyncEventsDto = z.infer<typeof SyncEventsDtoSchema>;

export const SyncEventsResultSchema = z.object({
  processedCount: z.number().int(),
  acceptedEventIds: z.array(z.string()),
  duplicateEventIds: z.array(z.string()),
  latestRevisions: z.record(z.number().int()),
});
export type SyncEventsResult = z.infer<typeof SyncEventsResultSchema>;

export const ReconcileEventsDtoSchema = z.object({
  workspaceId: z.string(),
  sinceRevision: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(100),
});
export type ReconcileEventsDto = z.infer<typeof ReconcileEventsDtoSchema>;

export const ReconcileEventsResultSchema = z.object({
  workspaceId: z.string(),
  currentRevision: z.number().int(),
  events: z.array(z.record(z.unknown())),
  hasMore: z.boolean(),
});
export type ReconcileEventsResult = z.infer<typeof ReconcileEventsResultSchema>;

// 4. Redis Key Namespaces, TTLs & Pub/Sub

export const REDIS_NAMESPACES = {
  SESSION: "remoteide:session",
  PRESENCE_HOST: "remoteide:presence:host",
  PRESENCE_DEVICE: "remoteide:presence:device",
  ROUTING_SESSION: "remoteide:routing:session",
  ROUTING_HOST: "remoteide:routing:host",
  WORKSPACE_REVISION: "remoteide:workspace:revision",
  PERMISSIONS: "remoteide:permissions:session",
  RATE_LIMIT: "remoteide:ratelimit",
  IDEMPOTENCY: "remoteide:idempotency",
} as const;

export const REDIS_TTL = {
  SESSION_SECONDS: 3600,
  // 30s heartbeat expiry
  PRESENCE_SECONDS: 30,
  ROUTING_SECONDS: 60,
  // 24h
  WORKSPACE_REVISION_SECONDS: 86400,
  // 5m with explicit instant invalidation
  PERMISSIONS_SECONDS: 300,
  RATE_LIMIT_SECONDS: 60,
  // 24h
  IDEMPOTENCY_SECONDS: 86400,
} as const;

export const REDIS_CHANNELS = {
  GATEWAY_BROADCAST: "remoteide:channel:gateway:broadcast",
  WORKSPACE_EVENTS: (workspaceId: string) => `remoteide:channel:workspace:${workspaceId}`,
  SESSION_EVENTS: (sessionId: string) => `remoteide:channel:session:${sessionId}`,
} as const;

// 5. Performance & Operational Metrics

export interface EventInfrastructureMetrics {
  redis: {
    cacheHits: number;
    cacheMisses: number;
    hitRatio: number;
    connected: boolean;
  };
  kafka: {
    publishedCount: number;
    consumedCount: number;
    consumerLag: number;
    connected: boolean;
  };
  events: {
    processingLatencyMs: number;
    outboxPendingCount: number;
    deadLetterCount: number;
  };
  websockets: {
    activeConnections: number;
    subscribedWorkspacesCount: number;
  };
}
