import type { Env } from "../env.js";
import type { ApplicationRequest } from "./contracts/index.js";
import { GENERIC_ERROR_MESSAGE } from "./constants.js";
import type { ResolvedStore, StoreDurableObjectRpc } from "./do-resolver.js";
import { deliver } from "./execution-result-adapter.js";
import { emitTransportLog } from "./observability.js";
import { normalizeRequest } from "./request-normalizer.js";
import type { SupportedUpdate } from "./update-parser.js";
import * as telegramClient from "./telegram-client.js";

export interface DispatchContext {
  workerRequestId: string;
  startTime: number;
}

export function scheduleDispatch(
  ctx: ExecutionContext,
  env: Env,
  supported: SupportedUpdate,
  storeId: string,
  resolved: ResolvedStore,
  dispatchContext: DispatchContext,
): void {
  const applicationRequest = normalizeRequest(supported, storeId);

  ctx.waitUntil(
    dispatchPipeline(
      env,
      resolved,
      applicationRequest,
      supported,
      storeId,
      dispatchContext,
    ),
  );
}

async function confirmTelegramDeliveryWithRetry(
  stub: StoreDurableObjectRpc,
  updateId: number,
): Promise<void> {
  try {
    await stub.confirmTelegramDelivery(updateId);
  } catch {
    await stub.confirmTelegramDelivery(updateId);
  }
}

async function dispatchPipeline(
  env: Env,
  resolved: ResolvedStore,
  applicationRequest: ApplicationRequest,
  supported: SupportedUpdate,
  storeId: string,
  dispatchContext: DispatchContext,
): Promise<void> {
  try {
    const result = await resolved.stub.handleApplicationRequest(applicationRequest);

    const hadOutbound =
      result.status === "ok" &&
      (result.messages.length > 0 || result.attachments.length > 0);

    await deliver(result, {
      chatId: supported.chatId,
      replyToMessageId: supported.messageId,
    }, env.BOT_TOKEN);

    if (hadOutbound) {
      try {
        await confirmTelegramDeliveryWithRetry(
          resolved.stub,
          applicationRequest.transport.updateId,
        );
      } catch {
        emitTransportLog({
          layer: "transport",
          workerRequestId: dispatchContext.workerRequestId,
          updateId: supported.updateId,
          messageId: supported.messageId,
          chatId: supported.chatId,
          storeId,
          durableObjectId: resolved.durableObjectId,
          durationMs: Date.now() - dispatchContext.startTime,
          resultStatus: "error",
          inboundKind: supported.inboundKind,
          errorCode: "ConfirmDeliveryFailed",
        });
        return;
      }
    }

    const skippedDelivery =
      result.status === "ok" &&
      result.messages.length === 0 &&
      result.attachments.length === 0;

    emitTransportLog({
      layer: "transport",
      workerRequestId: dispatchContext.workerRequestId,
      updateId: supported.updateId,
      messageId: supported.messageId,
      chatId: supported.chatId,
      storeId,
      durableObjectId: resolved.durableObjectId,
      durationMs: Date.now() - dispatchContext.startTime,
      resultStatus: skippedDelivery ? "skipped_delivery" : "success",
      inboundKind: supported.inboundKind,
    });
  } catch (error) {
    const errorCode =
      error instanceof Error ? error.name : "UnknownError";

    emitTransportLog({
      layer: "transport",
      workerRequestId: dispatchContext.workerRequestId,
      updateId: supported.updateId,
      messageId: supported.messageId,
      chatId: supported.chatId,
      storeId,
      durableObjectId: resolved.durableObjectId,
      durationMs: Date.now() - dispatchContext.startTime,
      resultStatus: "error",
      inboundKind: supported.inboundKind,
      errorCode,
    });

    try {
      await telegramClient.sendMessage(
        env.BOT_TOKEN,
        supported.chatId,
        GENERIC_ERROR_MESSAGE,
        { replyToMessageId: supported.messageId },
      );
    } catch {
      // Best-effort user notification; transport log already recorded.
    }
  }
}
