import { index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Encrypted user Gemini settings & API keys stored securely at rest.
 */
export const aiSettings = pgTable("ai_settings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull().unique(),
  encryptedApiKey: text("encrypted_api_key"),
  maskedApiKey: varchar("masked_api_key", { length: 32 }),
  model: varchar("model", { length: 64 }).notNull().default("gemini-2.5-flash"),
  temperature: text("temperature").default("0.7"),
  maxTokens: integer("max_tokens").default(4096),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AiSettingsEntity = typeof aiSettings.$inferSelect;
export type NewAiSettingsEntity = typeof aiSettings.$inferInsert;

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    title: varchar("title", { length: 128 }).notNull().default("New Chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_conversations_ws_user").on(table.workspaceId, table.userId),
  ]
);

export type AiConversationEntity = typeof aiConversations.$inferSelect;
export type NewAiConversationEntity = typeof aiConversations.$inferInsert;

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 64 }).notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    content: text("content").notNull(),
    context: jsonb("context"),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_messages_conv_id").on(table.conversationId),
  ]
);

export type AiMessageEntity = typeof aiMessages.$inferSelect;
export type NewAiMessageEntity = typeof aiMessages.$inferInsert;
