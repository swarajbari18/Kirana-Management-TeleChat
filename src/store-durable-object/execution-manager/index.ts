import type { ApplicationRequest } from "../../worker-telegram-adapter/contracts/index.js";
import type { ExecutionResult } from "../../worker-telegram-adapter/contracts/index.js";
import { orchestrate } from "../../global-orchestrator/index.js";
import {
  WELCOME_MESSAGE,
  WELCOME_MESSAGE_FIRST_START,
} from "../constants.js";
import { process as processConversation } from "../conversation-manager/index.js";
import {
  emitDeliveryConfirmedLog,
  emitRuntimeLog,
} from "../observability.js";
import type { StoreDatabase } from "../persistence/db.js";
import {
  findLedgerByUpdateId,
  markTelegramDelivered,
  recordLedgerEntry,
} from "../persistence/repositories/execution-ledger-repository.js";
import { setInitializedAt } from "../persistence/repositories/store-meta-repository.js";
import { createExecutionContext } from "./execution-context.js";

const EMPTY_OK: ExecutionResult = {
  status: "ok",
  messages: [],
  attachments: [],
};

const ERROR_RESULT: ExecutionResult = {
  status: "error",
  messages: [],
  attachments: [],
};

export async function execute(
  request: ApplicationRequest,
  db: StoreDatabase,
): Promise<ExecutionResult> {
  const ctx = createExecutionContext(request);
  const startTime = ctx.startTime;

  const existing = await findLedgerByUpdateId(db, request.transport.updateId);
  if (existing) {
    if (existing.telegramDelivered) {
      emitRuntimeLog({
        layer: "runtime",
        correlationId: ctx.correlationId,
        updateId: request.transport.updateId,
        storeId: request.storeId,
        terminalStatus: "skipped_duplicate",
        ledgerHit: true,
        durationMs: Date.now() - startTime,
        participatingComponents: ["execution-manager"],
        failureReason: null,
      });
      return EMPTY_OK;
    }

    if (existing.resultJson) {
      emitRuntimeLog({
        layer: "runtime",
        correlationId: ctx.correlationId,
        updateId: request.transport.updateId,
        storeId: request.storeId,
        terminalStatus: "replay_cached",
        ledgerHit: true,
        durationMs: Date.now() - startTime,
        participatingComponents: ["execution-manager"],
        failureReason: null,
      });
      return JSON.parse(existing.resultJson) as ExecutionResult;
    }

    emitRuntimeLog({
      layer: "runtime",
      correlationId: ctx.correlationId,
      updateId: request.transport.updateId,
      storeId: request.storeId,
      terminalStatus: "skipped_duplicate",
      ledgerHit: true,
      durationMs: Date.now() - startTime,
      participatingComponents: ["execution-manager"],
      failureReason: null,
    });
    return EMPTY_OK;
  }

  const participatingComponents = ["execution-manager"];
  let sessionId: string | undefined;
  let failureReason: string | null = null;

  try {
    const conversationContext = await processConversation(request, db, ctx);
    participatingComponents.push("conversation-manager");
    sessionId = conversationContext.activeSessionId;

    let result: ExecutionResult;
    if (
      request.inbound.kind === "command" &&
      request.inbound.command === "start"
    ) {
      result = await handleStart(db, conversationContext.storeInitialized);
    } else {
      participatingComponents.push("stub-orchestrator");
      result = orchestrate(conversationContext);
    }

    const handedToWorker =
      result.status === "ok" &&
      (result.messages.length > 0 || result.attachments.length > 0);

    // Component 2: text-only results. When attachments contain ArrayBuffer,
    // result_json serialization must use base64 (future Billing capability).
    const resultJson = handedToWorker ? JSON.stringify(result) : null;

    await recordLedgerEntry(db, {
      updateId: request.transport.updateId,
      correlationId: ctx.correlationId,
      terminalStatus: result.status === "ok" ? "ok" : "error",
      handedToWorker,
      telegramDelivered: false,
      resultJson,
      completedAt: new Date().toISOString(),
    });

    emitRuntimeLog({
      layer: "runtime",
      correlationId: ctx.correlationId,
      updateId: request.transport.updateId,
      storeId: request.storeId,
      sessionId,
      terminalStatus: result.status,
      ledgerHit: false,
      durationMs: Date.now() - startTime,
      participatingComponents,
      failureReason: null,
    });

    return result;
  } catch (error) {
    failureReason = error instanceof Error ? error.message : "UnknownError";

    try {
      await recordLedgerEntry(db, {
        updateId: request.transport.updateId,
        correlationId: ctx.correlationId,
        terminalStatus: "error",
        handedToWorker: false,
        telegramDelivered: false,
        resultJson: null,
        failureReason,
        completedAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort ledger record on failure path.
    }

    emitRuntimeLog({
      layer: "runtime",
      correlationId: ctx.correlationId,
      updateId: request.transport.updateId,
      storeId: request.storeId,
      sessionId,
      terminalStatus: "error",
      ledgerHit: false,
      durationMs: Date.now() - startTime,
      participatingComponents,
      failureReason,
    });

    return ERROR_RESULT;
  }
}

export async function confirmTelegramDelivery(
  db: StoreDatabase,
  updateId: number,
): Promise<void> {
  const existing = await findLedgerByUpdateId(db, updateId);
  if (!existing) {
    console.warn(
      JSON.stringify({
        layer: "runtime",
        action: "telegram_delivery_confirm_missing",
        updateId,
      }),
    );
    return;
  }

  await markTelegramDelivered(db, updateId);

  emitDeliveryConfirmedLog({
    layer: "runtime",
    action: "telegram_delivery_confirmed",
    updateId,
  });
}

async function handleStart(
  db: StoreDatabase,
  alreadyInitialized: boolean,
): Promise<ExecutionResult> {
  if (!alreadyInitialized) {
    await setInitializedAt(db, new Date().toISOString());
    return {
      status: "ok",
      messages: [{ type: "text", text: WELCOME_MESSAGE_FIRST_START }],
      attachments: [],
    };
  }

  return {
    status: "ok",
    messages: [{ type: "text", text: WELCOME_MESSAGE }],
    attachments: [],
  };
}
