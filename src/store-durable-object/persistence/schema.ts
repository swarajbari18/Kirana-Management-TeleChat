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

export const shopProfile = sqliteTable("shop_profile", {
  id: integer("id").primaryKey(),
  shopName: text("shop_name"),
  ownerName: text("owner_name"),
  gstRegistered: integer("gst_registered", { mode: "boolean" }),
  gstin: text("gstin"),
  instructionsJson: text("instructions_json").notNull().default("[]"),
  confirmationTimeoutMs: integer("confirmation_timeout_ms")
    .notNull()
    .default(300_000),
  completeAutonomy: integer("complete_autonomy", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: text("updated_at").notNull(),
});

export const workQueue = sqliteTable("work_queue", {
  updateId: integer("update_id").primaryKey(),
  requestJson: text("request_json").notNull(),
  status: text("status").notNull(),
  correlationId: text("correlation_id"),
  enqueuedAt: text("enqueued_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  failureReason: text("failure_reason"),
});

export const pendingConfirmations = sqliteTable("pending_confirmations", {
  id: text("id").primaryKey(),
  updateId: integer("update_id").notNull(),
  correlationId: text("correlation_id").notNull(),
  toolName: text("tool_name").notNull(),
  displayPayloadJson: text("display_payload_json").notNull(),
  pendingWriteJson: text("pending_write_json").notNull(),
  status: text("status").notNull(),
  callbackQueryId: text("callback_query_id"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const orchestrationCheckpoints = sqliteTable("orchestration_checkpoints", {
  updateId: integer("update_id").primaryKey(),
  correlationId: text("correlation_id").notNull(),
  stage: text("stage").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentTraceEvents = sqliteTable("agent_trace_events", {
  eventId: text("event_id").primaryKey(),
  updateId: integer("update_id").notNull(),
  correlationId: text("correlation_id").notNull(),
  seq: integer("seq").notNull(),
  parentEventId: text("parent_event_id"),
  layer: text("layer").notNull(),
  component: text("component").notNull(),
  stage: text("stage").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const shopProfileHistory = sqliteTable("shop_profile_history", {
  id: text("id").primaryKey(),
  updateId: integer("update_id").notNull(),
  correlationId: text("correlation_id").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  appliedAt: text("applied_at").notNull(),
});

export const inventoryProducts = sqliteTable("inventory_products", {
  sku: text("sku").primaryKey(),
  productName: text("product_name").notNull(),
  itemType: text("item_type").notNull(),
  unit: text("unit").notNull(),
  quantityOnHand: integer("quantity_on_hand").notNull(),
  costPrice: integer("cost_price").notNull(),
  sellPrice: integer("sell_price").notNull(),
  hsnCode: text("hsn_code").notNull(),
  gstRate: integer("gst_rate").notNull(),
  reorderLevel: integer("reorder_level").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const inventoryProductAliases = sqliteTable(
  "inventory_product_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sku: text("sku")
      .notNull()
      .references(() => inventoryProducts.sku),
    alias: text("alias").notNull(),
  },
);

export const inventoryMovements = sqliteTable("inventory_movements", {
  id: text("id").primaryKey(),
  sku: text("sku")
    .notNull()
    .references(() => inventoryProducts.sku),
  movementType: text("movement_type").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  updateId: integer("update_id").notNull(),
  correlationId: text("correlation_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const inventoryReservations = sqliteTable("inventory_reservations", {
  id: text("id").primaryKey(),
  sku: text("sku")
    .notNull()
    .references(() => inventoryProducts.sku),
  quantity: integer("quantity").notNull(),
  draftBillId: text("draft_bill_id").notNull(),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});
