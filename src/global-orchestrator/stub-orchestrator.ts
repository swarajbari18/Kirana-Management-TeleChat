import type { ExecutionResult } from "../worker-telegram-adapter/contracts/index.js";
import { STUB_GREETING } from "./constants.js";
import type { ConversationContext } from "./types.js";

export function orchestrate(_context: ConversationContext): ExecutionResult {
  return {
    status: "ok",
    messages: [{ type: "text", text: STUB_GREETING }],
    attachments: [],
  };
}
