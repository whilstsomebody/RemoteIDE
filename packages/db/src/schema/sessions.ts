import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { hostAgents } from "./hosts.js";
import { users } from "./users.js";

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
  projectRoot: text("project_root").notNull(),
  allowedPaths: jsonb("allowed_paths").$type<string[]>().default([]).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

