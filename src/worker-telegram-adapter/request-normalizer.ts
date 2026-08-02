import type { ApplicationRequest } from "./contracts/index.js";
import type { SupportedUpdate } from "./update-parser.js";

export function normalizeRequest(
  supported: SupportedUpdate,
  storeId: string,
): ApplicationRequest {
  return {
    storeId,
    delivery: {
      chatId: supported.chatId,
      replyToMessageId: supported.messageId,
    },
    transport: {
      source: "telegram",
      updateId: supported.updateId,
      messageId: supported.messageId,
      userId: supported.userId,
      timestamp: supported.timestamp,
    },
    inbound: {
      kind: supported.inboundKind,
      text: supported.text,
      command: supported.command,
      entities: supported.entities?.map((e) => ({
        type: e.type,
        offset: e.offset,
        length: e.length,
      })),
    },
    conversation: {
      resetRequested: supported.resetRequested,
    },
  };
}
