import type { Update } from "@grammyjs/types";
import { parseBotCommand } from "./telegram/command-parser.js";

export interface SupportedUpdate {
  kind: "supported";
  updateId: number;
  messageId: number;
  chatId: number;
  userId: number;
  timestamp: number;
  text: string;
  inboundKind: "text" | "command";
  command?: string;
  resetRequested: boolean;
}

export interface UnsupportedUpdate {
  kind: "unsupported";
  updateId: number;
  chatId?: number;
}

export type ParsedUpdate = SupportedUpdate | UnsupportedUpdate;

export function parseUpdate(update: Update): ParsedUpdate {
  const updateId = update.update_id;

  if (update.edited_message || update.callback_query || update.inline_query) {
    return { kind: "unsupported", updateId };
  }

  const message = update.message;
  if (!message) {
    return { kind: "unsupported", updateId };
  }

  if (!message.text || !message.from) {
    return {
      kind: "unsupported",
      updateId,
      chatId: message.chat?.id,
    };
  }

  const parsedCommand = parseBotCommand(message.text, message.entities);

  return {
    kind: "supported",
    updateId,
    messageId: message.message_id,
    chatId: message.chat.id,
    userId: message.from.id,
    timestamp: message.date,
    text: message.text,
    inboundKind: parsedCommand ? "command" : "text",
    command: parsedCommand?.command,
    resetRequested: parsedCommand?.resetRequested ?? false,
  };
}
