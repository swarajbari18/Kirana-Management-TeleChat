import type { Env } from "../env.js";
import { parseConfirmationCallbackData } from "./callback-parser.js";
import type { ConfirmationCallbackRequest } from "./contracts/index.js";
import type { ResolvedStore } from "./do-resolver.js";
import { emitTransportLog } from "./observability.js";
import type { CallbackQueryUpdate } from "./update-parser.js";
import * as telegramClient from "./telegram-client.js";

export interface CallbackDispatchContext {
  workerRequestId: string;
  startTime: number;
}

export async function dispatchConfirmationCallback(
  env: Env,
  resolved: ResolvedStore,
  callback: CallbackQueryUpdate,
  storeId: string,
  dispatchContext: CallbackDispatchContext,
): Promise<void> {
  const parsed = parseConfirmationCallbackData(callback.data);
  if (!parsed) {
    emitTransportLog({
      layer: "transport",
      workerRequestId: dispatchContext.workerRequestId,
      updateId: callback.updateId,
      chatId: callback.chatId ?? 0,
      storeId,
      durableObjectId: resolved.durableObjectId,
      durationMs: Date.now() - dispatchContext.startTime,
      resultStatus: "unsupported",
      inboundKind: "callback_query",
    });
    return;
  }

  const request: ConfirmationCallbackRequest = {
    storeId,
    confirmationId: parsed.confirmationId,
    approved: parsed.approved,
    callbackQueryId: callback.callbackQueryId,
    transport: {
      updateId: callback.updateId,
      userId: callback.userId,
      timestamp: callback.timestamp,
    },
  };

  try {
    await resolved.stub.handleConfirmationCallback(request);

    await telegramClient.answerCallbackQuery(
      env.BOT_TOKEN,
      callback.callbackQueryId,
    );

    emitTransportLog({
      layer: "transport",
      workerRequestId: dispatchContext.workerRequestId,
      updateId: callback.updateId,
      chatId: callback.chatId ?? 0,
      storeId,
      durableObjectId: resolved.durableObjectId,
      durationMs: Date.now() - dispatchContext.startTime,
      resultStatus: "success",
      inboundKind: "callback_query",
    });
  } catch (error) {
    const errorCode =
      error instanceof Error ? error.name : "UnknownError";

    emitTransportLog({
      layer: "transport",
      workerRequestId: dispatchContext.workerRequestId,
      updateId: callback.updateId,
      chatId: callback.chatId ?? 0,
      storeId,
      durableObjectId: resolved.durableObjectId,
      durationMs: Date.now() - dispatchContext.startTime,
      resultStatus: "error",
      inboundKind: "callback_query",
      errorCode,
    });
  }
}
