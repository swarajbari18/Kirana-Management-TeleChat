import type { ExecutionResult } from "../../worker-telegram-adapter/contracts/index.js";

/**
 * Deliver every ExecutionResult except EMPTY_OK (duplicate ledger skip).
 * Error results with messages must reach Telegram — same as C1 deliver().
 */
export function shouldDeliverOutbound(result: ExecutionResult): boolean {
  return !(
    result.status === "ok" &&
    result.messages.length === 0 &&
    result.attachments.length === 0
  );
}
