import { boolean, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { hostAgents } from "./hosts.js";
import { users } from "./users.js";
import { shareLinks } from "./share-links.js";

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  hostId: varchar("host_id", { length: 64 })
    .notNull()
    .references(() => hostAgents.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  role: varchar("role", { length: 32 }).notNull().default("viewer"),
  capabilities: jsonb("capabilities").$type<string[]>().default([]).notNull(),
  projectRoot: text("project_root").notNull().default("/"),
  allowedPaths: jsonb("allowed_paths").$type<string[]>().default([]).notNull(),
  allowedWorkspaceIds: jsonb("allowed_workspace_ids").$type<string[]>().default([]).notNull(),
  deviceName: varchar("device_name", { length: 128 }).notNull().default("Browser"),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: varchar("user_agent", { length: 255 }),
  isOwner: boolean("is_owner").notNull().default(false),
  shareLinkId: varchar("share_link_id", { length: 64 }).references(() => shareLinks.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
