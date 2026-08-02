import type { Env } from "../env.js";
import type { ApplicationRequest } from "./contracts/index.js";
import { GENERIC_ERROR_MESSAGE } from "./constants.js";
import type { ResolvedStore } from "./do-resolver.js";
import { emitTransportLog } from "./observability.js";
import { normalizeRequest } from "./request-normalizer.js";
import type { SupportedUpdate } from "./update-parser.js";
import * as telegramClient from "./telegram-client.js";

export interface DispatchContext {
  workerRequestId: string;
  startTime: number;
}

// Part 2.9 — fast-ack DO RPC; no ctx.waitUntil for orchestration.
export async function dispatchToStore(
  env: Env,
  resolved: ResolvedStore,
  applicationRequest: ApplicationRequest,
  supported: SupportedUpdate,
  storeId: string,
  dispatchContext: DispatchContext,
): Promise<void> {
  try {
    await resolved.stub.handleApplicationRequest(applicationRequest);

    emitTransportLog({
      layer: "transport",
      workerRequestId: dispatchContext.workerRequestId,
      updateId: supported.updateId,
      messageId: supported.messageId,
      chatId: supported.chatId,
      storeId,
      durableObjectId: resolved.durableObjectId,
      durationMs: Date.now() - dispatchContext.startTime,
      resultStatus: "accepted",
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

export function buildApplicationRequest(
  supported: SupportedUpdate,
  storeId: string,
): ApplicationRequest {
  return normalizeRequest(supported, storeId);
}
