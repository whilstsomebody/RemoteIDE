import { integer, jsonb, pgTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Registered client devices for multi-device workspace tracking.
 */
export const registeredDevices = pgTable("registered_devices", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  deviceName: varchar("device_name", { length: 128 }).notNull().default("Remote Device"),
  deviceType: varchar("device_type", { length: 32 }).notNull().default("browser"),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 64 }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RegisteredDeviceEntity = typeof registeredDevices.$inferSelect;
export type NewRegisteredDeviceEntity = typeof registeredDevices.$inferInsert;

/**
 * Tracks the latest workspace revision successfully synchronized live to each device.
 */
export const deviceWorkspaceSyncCursors = pgTable(
  "device_workspace_sync_cursors",
  {
    deviceId: varchar("device_id", { length: 128 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 64 }).notNull(),
    lastSynchronizedRevision: integer("last_synchronized_revision").notNull().default(0),
    lastSynchronizedAt: timestamp("last_synchronized_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.workspaceId] })]
);

export type DeviceWorkspaceSyncCursor = typeof deviceWorkspaceSyncCursors.$inferSelect;
export type NewDeviceWorkspaceSyncCursor = typeof deviceWorkspaceSyncCursors.$inferInsert;

/**
 * Tracks the latest revision explicitly acknowledged by the device in its catch-up summary.
 * A message being sent is NOT proof that the device processed or read it.
 */
export const deviceWorkspaceChangelogCursors = pgTable(
  "device_workspace_changelog_cursors",
  {
    deviceId: varchar("device_id", { length: 128 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 64 }).notNull(),
    lastAcknowledgedRevision: integer("last_acknowledged_revision").notNull().default(0),
    lastAcknowledgedAt: timestamp("last_acknowledged_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastDeliveryId: varchar("last_delivery_id", { length: 64 }),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.workspaceId] })]
);

export type DeviceWorkspaceChangelogCursor = typeof deviceWorkspaceChangelogCursors.$inferSelect;
export type NewDeviceWorkspaceChangelogCursor = typeof deviceWorkspaceChangelogCursors.$inferInsert;

/**
 * Durable records of generated and delivered catch-up changelogs.
 * Delivery state is preserved until explicit user acknowledgement.
 */
export const changelogDeliveries = pgTable("changelog_deliveries", {
  id: varchar("id", { length: 64 }).primaryKey(),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  workspaceId: varchar("workspace_id", { length: 64 }).notNull(),
  fromRevision: integer("from_revision").notNull(),
  toRevision: integer("to_revision").notNull(),
  eventCount: integer("event_count").notNull().default(0),
  fileCount: integer("file_count").notNull().default(0),
  summary: jsonb("summary").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("delivered"), // delivered | acknowledged | expired
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type ChangelogDelivery = typeof changelogDeliveries.$inferSelect;
export type NewChangelogDelivery = typeof changelogDeliveries.$inferInsert;

/**
 * Configurable temporary event retention policy per workspace.
 * Retention options: 24 hours (1 day), 3 days, 7 days, 30 days.
 */
export const eventRetentionConfigs = pgTable("event_retention_configs", {
  workspaceId: varchar("workspace_id", { length: 64 }).primaryKey(),
  retentionDays: integer("retention_days").notNull().default(7),
  auditRetentionDays: integer("audit_retention_days").notNull().default(90),
  oldestRetainedRevision: integer("oldest_retained_revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EventRetentionConfig = typeof eventRetentionConfigs.$inferSelect;
export type NewEventRetentionConfig = typeof eventRetentionConfigs.$inferInsert;

/**
 * Temporary workspace events buffer for ephemeral event storage.
 */
export const temporaryWorkspaceEvents = pgTable("temporary_workspace_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 64 }).notNull(),
  revision: integer("revision").notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type TemporaryWorkspaceEvent = typeof temporaryWorkspaceEvents.$inferSelect;
export type NewTemporaryWorkspaceEvent = typeof temporaryWorkspaceEvents.$inferInsert;
