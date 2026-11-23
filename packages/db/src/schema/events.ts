import { index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Authoritative durable storage for workspace-scoped events.
 * Ordered per-workspace by sequential integer revision.
 */
export const workspaceEvents = pgTable(
  "workspace_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 }).notNull(),
    hostId: varchar("host_id", { length: 64 }).notNull(),
    revision: integer("revision").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    actorId: varchar("actor_id", { length: 64 }).notNull(),
    deviceId: varchar("device_id", { length: 64 }),
    sessionId: varchar("session_id", { length: 64 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_workspace_events_ws_rev").on(table.workspaceId, table.revision),
  ]
);

export type WorkspaceEvent = typeof workspaceEvents.$inferSelect;
export type NewWorkspaceEvent = typeof workspaceEvents.$inferInsert;

/**
 * Tracks the current authoritative revision allocated per workspace.
 */
export const workspaceRevisions = pgTable("workspace_revisions", {
  workspaceId: varchar("workspace_id", { length: 64 }).primaryKey(),
  currentRevision: integer("current_revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WorkspaceRevision = typeof workspaceRevisions.$inferSelect;
export type NewWorkspaceRevision = typeof workspaceRevisions.$inferInsert;

/**
 * Transactional Outbox pattern table.
 * Outbox entries are written in the same database transaction as the domain event,
 * guaranteeing reliable at-least-once forwarding to Apache Kafka.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    topic: varchar("topic", { length: 64 }).notNull(),
    partitionKey: varchar("partition_key", { length: 128 }).notNull(),
    payload: jsonb("payload").notNull(),
    headers: jsonb("headers"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_outbox_events_status_created").on(table.status, table.createdAt),
  ]
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;

/**
 * Deduplication table tracking processed events across consumer groups.
 * Guarantees idempotent consumer execution against at-least-once redeliveries.
 */
export const processedEvents = pgTable("processed_events", {
  eventId: varchar("event_id", { length: 64 }).primaryKey(),
  consumerGroup: varchar("consumer_group", { length: 64 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata"),
});

export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type NewProcessedEvent = typeof processedEvents.$inferInsert;
