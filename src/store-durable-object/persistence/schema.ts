import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const storeMeta = sqliteTable("store_meta", {
  id: integer("id").primaryKey(),
  initializedAt: text("initialized_at"),
  createdAt: text("created_at").notNull(),
});

export const executionLedger = sqliteTable("execution_ledger", {
  updateId: integer("update_id").primaryKey(),
  correlationId: text("correlation_id").notNull(),
  terminalStatus: text("terminal_status").notNull(),
  handedToWorker: integer("handed_to_worker", { mode: "boolean" }).notNull(),
  telegramDelivered: integer("telegram_delivered", { mode: "boolean" }).notNull(),
  resultJson: text("result_json"),
  failureReason: text("failure_reason"),
  completedAt: text("completed_at").notNull(),
});

export const conversationSessions = sqliteTable("conversation_sessions", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
});

export const conversationTurns = sqliteTable("conversation_turns", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => conversationSessions.id),
  updateId: integer("update_id").notNull(),
  role: text("role").notNull(),
  rawText: text("raw_text").notNull(),
  contextText: text("context_text").notNull(),
  inboundKind: text("inbound_kind").notNull(),
  command: text("command"),
  createdAt: text("created_at").notNull(),
});
