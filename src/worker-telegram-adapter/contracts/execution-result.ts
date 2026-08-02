export interface OutboundMessage {
  type: "text";
  text: string;
  parseMode?: "Markdown" | "HTML";
}

export interface OutboundAttachment {
  type: "document";
  filename: string;
  mimeType: string;
  data: ArrayBuffer;
  caption?: string;
}

/**
 * When status is "ok" and messages and attachments are both empty,
 * the Worker intentionally sends nothing (duplicate updateId already
 * confirmed at Telegram via execution_ledger.telegram_delivered).
 *
 * A non-empty result on a duplicate updateId is a cached replay for
 * transport retry only — the DO does not re-run Conversation Manager
 * or the orchestrator.
 */
export interface ExecutionResult {
  status: "ok" | "error";
  messages: OutboundMessage[];
  attachments: OutboundAttachment[];
}
