import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const hostAgents = pgTable("host_agents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  identifier: varchar("identifier", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  os: varchar("os", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("offline"),
  tokenHash: text("token_hash").notNull(),
  capabilities: jsonb("capabilities"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type HostAgent = typeof hostAgents.$inferSelect;
export type NewHostAgent = typeof hostAgents.$inferInsert;
