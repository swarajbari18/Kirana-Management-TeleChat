import type { InlineKeyboardYesNo } from "../../worker-telegram-adapter/callback-parser.js";
import type { ExecutionResult } from "../../worker-telegram-adapter/contracts/index.js";

export interface RuntimePorts {
  deliverConfirmation(input: {
    confirmationId: string;
    chatId: number;
    text: string;
    replyMarkup: InlineKeyboardYesNo;
  }): Promise<void>;

  deliverOutbound(input: {
    chatId: number;
    result: ExecutionResult;
    replyToMessageId?: number;
  }): Promise<void>;

  waitForConfirmation(
    confirmationId: string,
    timeoutMs: number,
  ): Promise<"approved" | "denied" | "expired">;
}
