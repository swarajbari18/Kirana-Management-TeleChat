import type { ExecutionResult } from "./contracts/index.js";
import { GENERIC_ERROR_MESSAGE } from "./constants.js";
import * as telegramClient from "./telegram-client.js";

export interface DeliveryTarget {
  chatId: number;
  replyToMessageId?: number;
}

export async function deliver(
  result: ExecutionResult,
  delivery: DeliveryTarget,
  botToken: string,
): Promise<void> {
  // Empty ok result = delivery skip (duplicate updateId ledger hit in DO).
  if (
    result.status === "ok" &&
    result.messages.length === 0 &&
    result.attachments.length === 0
  ) {
    return;
  }

  if (
    result.status === "error" &&
    result.messages.length === 0 &&
    result.attachments.length === 0
  ) {
    await telegramClient.sendMessage(
      botToken,
      delivery.chatId,
      GENERIC_ERROR_MESSAGE,
      { replyToMessageId: delivery.replyToMessageId },
    );
    return;
  }

  for (const message of result.messages) {
    if (message.type === "text") {
      await telegramClient.sendMessage(
        botToken,
        delivery.chatId,
        message.text,
        {
          parseMode: message.parseMode,
          replyToMessageId: delivery.replyToMessageId,
        },
      );
    }
  }

  for (const attachment of result.attachments) {
    if (attachment.type === "document") {
      await telegramClient.sendDocument(
        botToken,
        delivery.chatId,
        attachment,
        { replyToMessageId: delivery.replyToMessageId },
      );
    }
  }
}
