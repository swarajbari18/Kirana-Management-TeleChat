import { WorkerEntrypoint } from "cloudflare:workers";
import type { Env } from "../env.js";
import type {
  DeliverConfirmationPayload,
  DeliverOutboundPayload,
} from "./contracts/delivery-payload.js";
import { deliver } from "./execution-result-adapter.js";
import * as telegramClient from "./telegram-client.js";

export class TelegramDeliveryService extends WorkerEntrypoint<Env> {
  async deliverConfirmation(payload: DeliverConfirmationPayload): Promise<void> {
    await telegramClient.sendMessage(this.env.BOT_TOKEN, payload.chatId, payload.text, {
      replyMarkup: payload.replyMarkup,
    });
  }

  async deliverOutbound(payload: DeliverOutboundPayload): Promise<void> {
    await deliver(
      payload.result,
      {
        chatId: payload.chatId,
        replyToMessageId: payload.replyToMessageId,
      },
      this.env.BOT_TOKEN,
    );
  }
}
