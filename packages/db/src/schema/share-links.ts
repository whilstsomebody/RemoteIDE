import { boolean, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const shareLinks = pgTable("share_links", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull().default("Temporary Access Link"),
  tokenHash: text("token_hash").notNull().unique(),
  role: varchar("role", { length: 32 }).notNull().default("viewer"),
  allowedWorkspaceIds: jsonb("allowed_workspace_ids").$type<string[]>().default([]).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  oneTimeRedemption: boolean("one_time_redemption").notNull().default(true),
  pinHash: text("pin_hash"),
  maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  isRevoked: boolean("is_revoked").notNull().default(false),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: varchar("created_by", { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;

