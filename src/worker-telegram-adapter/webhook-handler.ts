import type { Env } from "../env.js";
import { UNSUPPORTED_MESSAGE } from "./constants.js";
import { dispatchConfirmationCallback } from "./callback-dispatcher.js";
import { resolveStoreDurableObject } from "./do-resolver.js";
import { IdentityError, resolveStoreId } from "./identity-resolver.js";
import { emitTransportLog } from "./observability.js";
import {
  buildApplicationRequest,
  dispatchToStore,
} from "./request-dispatcher.js";
import { parseUpdate } from "./update-parser.js";
import * as telegramClient from "./telegram-client.js";

export async function handleWebhook(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secretHeader !== env.WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const workerRequestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const parsed = parseUpdate(update as Parameters<typeof parseUpdate>[0]);

    if (parsed.kind === "unsupported") {
      let outboundErrorCode: string | undefined;

      if (parsed.chatId !== undefined) {
        try {
          await telegramClient.sendMessage(
            env.BOT_TOKEN,
            parsed.chatId,
            UNSUPPORTED_MESSAGE,
          );
        } catch (error) {
          outboundErrorCode =
            error instanceof telegramClient.TelegramApiError
              ? "TelegramApiError"
              : error instanceof Error
                ? error.name
                : "UnknownError";
          console.error("Unsupported inbound reply failed:", error);
        }
      }

      emitTransportLog({
        layer: "transport",
        workerRequestId,
        updateId: parsed.updateId,
        chatId: parsed.chatId ?? 0,
        durationMs: Date.now() - startTime,
        resultStatus: outboundErrorCode ? "error" : "unsupported",
        errorCode: outboundErrorCode,
      });

      return new Response("OK", { status: 200 });
    }

    if (parsed.kind === "callback_query") {
      const storeId = String(parsed.userId);
      const resolved = resolveStoreDurableObject(env, storeId);

      await dispatchConfirmationCallback(
        env,
        resolved,
        parsed,
        storeId,
        { workerRequestId, startTime },
      );

      return new Response("OK", { status: 200 });
    }

    const storeId = resolveStoreId(parsed);
    const resolved = resolveStoreDurableObject(env, storeId);
    const applicationRequest = buildApplicationRequest(parsed, storeId);

    await dispatchToStore(
      env,
      resolved,
      applicationRequest,
      parsed,
      storeId,
      { workerRequestId, startTime },
    );

    return new Response("OK", { status: 200 });
  } catch (error) {
    if (error instanceof IdentityError) {
      emitTransportLog({
        layer: "transport",
        workerRequestId,
        updateId: 0,
        chatId: 0,
        durationMs: Date.now() - startTime,
        resultStatus: "rejected",
        errorCode: error.name,
      });
      return new Response("Bad Request", { status: 400 });
    }

    console.error("Webhook handler error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
