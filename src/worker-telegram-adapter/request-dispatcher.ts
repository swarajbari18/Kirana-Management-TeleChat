import type { Env } from "../env.js";
import type { ApplicationRequest } from "./contracts/index.js";
import { GENERIC_ERROR_MESSAGE } from "./constants.js";
import type { ResolvedStore } from "./do-resolver.js";
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
    await deliver(result, {
      chatId: supported.chatId,
      replyToMessageId: supported.messageId,
    }, env.BOT_TOKEN);

    emitTransportLog({
      layer: "transport",
      workerRequestId: dispatchContext.workerRequestId,
      updateId: supported.updateId,
      messageId: supported.messageId,
      chatId: supported.chatId,
      storeId,
      durableObjectId: resolved.durableObjectId,
      durationMs: Date.now() - dispatchContext.startTime,
      resultStatus: "success",
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
