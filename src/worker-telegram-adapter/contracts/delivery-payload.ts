import type { InlineKeyboardYesNo } from "../callback-parser.js";

export interface DeliverConfirmationPayload {
  storeId: string;
  confirmationId: string;
  chatId: number;
  text: string;
  replyMarkup: InlineKeyboardYesNo;
  correlationId: string;
}

export interface DeliverOutboundPayload {
  storeId: string;
  chatId: number;
  result: import("./execution-result.js").ExecutionResult;
  replyToMessageId?: number;
  correlationId: string;
}
