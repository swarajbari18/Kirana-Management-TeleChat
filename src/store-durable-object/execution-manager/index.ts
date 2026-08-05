import type { Env } from "../../env.js";
import type { ApplicationRequest } from "../../worker-telegram-adapter/contracts/index.js";
import type { ConfirmationCallbackRequest } from "../../worker-telegram-adapter/contracts/index.js";
import type { ExecutionResult } from "../../worker-telegram-adapter/contracts/index.js";
import { orchestrate } from "../../global-orchestrator/index.js";
import { createRunContext } from "../agent-state/run-context.js";
import {
  NEW_CONVERSATION_MESSAGE,
  WELCOME_MESSAGE,
  WELCOME_MESSAGE_FIRST_START,
} from "../constants.js";
import {
  persistAssistantTurn,
  process as processConversation,
} from "../conversation-manager/index.js";
import { stripNewCommand } from "../conversation-manager/new-command-strip.js";
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
import { enqueueWorkItem } from "../persistence/repositories/work-queue-repository.js";
import { getPendingConfirmation } from "../persistence/repositories/pending-confirmation-repository.js";
import { setInitializedAt } from "../persistence/repositories/store-meta-repository.js";
import type { ConfirmationRegistry } from "../runtime-ports/confirmation-registry.js";
import {
  createWorkerDeliveryPort,
  finalizeConfirmationResolution,
} from "../runtime-ports/worker-delivery-port.js";
import { createExecutionContext } from "./execution-context.js";
import { shouldDeliverOutbound } from "./delivery-policy.js";

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

export async function enqueueRequest(
  request: ApplicationRequest,
  db: StoreDatabase,
): Promise<boolean> {
  const existing = await findLedgerByUpdateId(db, request.transport.updateId);
  if (existing?.telegramDelivered) {
    return false;
  }

  await enqueueWorkItem(db, {
    updateId: request.transport.updateId,
    requestJson: JSON.stringify(request),
  });
  return true;
}

export interface ProcessWorkItemInput {
  request: ApplicationRequest;
  db: StoreDatabase;
  env: Env;
  correlationId: string;
  confirmationRegistry: ConfirmationRegistry;
  confirmTelegramDelivery: (updateId: number) => Promise<void>;
}

export async function processWorkItem(
  input: ProcessWorkItemInput,
): Promise<void> {
  const { request, db, env, correlationId, confirmationRegistry } = input;
  const ctx = createExecutionContext(request, correlationId);
  const startTime = ctx.startTime;

  const existing = await findLedgerByUpdateId(db, request.transport.updateId);
  if (existing?.telegramDelivered) {
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
    return;
  }

  if (existing?.resultJson && existing.telegramDelivered) {
    return;
  }

  const runtimePorts = createWorkerDeliveryPort({
    env,
    db,
    storeId: request.storeId,
    correlationId: ctx.correlationId,
    updateId: request.transport.updateId,
    confirmationRegistry,
  });

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
      participatingComponents.push("start-handler");
    } else if (
      request.inbound.kind === "command" &&
      request.inbound.command === "new" &&
      stripNewCommand(request.inbound.text) === ""
    ) {
      result = handleNewConversation();
      participatingComponents.push("new-handler");
    } else {
      participatingComponents.push("global-orchestrator");
      const runContext = createRunContext(db, {
        ...conversationContext,
        storeId: request.storeId,
        correlationId: ctx.correlationId,
        updateId: request.transport.updateId,
        chatId: request.delivery.chatId,
        inbound: request.inbound,
        geminiApiKey: env.GEMINI_API_KEY,
      });
      result = await orchestrate(
        {
          ...conversationContext,
          storeId: request.storeId,
          correlationId: ctx.correlationId,
          updateId: request.transport.updateId,
          chatId: request.delivery.chatId,
          inbound: request.inbound,
          geminiApiKey: env.GEMINI_API_KEY,
        },
        runtimePorts,
        db,
        runContext,
      );
    }

    const deliver = shouldDeliverOutbound(result);

    if (deliver) {
      await runtimePorts.deliverOutbound({
        chatId: request.delivery.chatId,
        result,
        replyToMessageId: request.delivery.replyToMessageId,
      });

      if (result.status === "ok") {
        for (const message of result.messages) {
          if (message.type === "text") {
            await persistAssistantTurn(db, {
              sessionId,
              text: message.text,
              updateId: request.transport.updateId,
            });
          }
        }
      }
    }

    const resultJson = deliver ? JSON.stringify(result) : null;
    const orchestrationFailure =
      result.status === "error" ? "orchestration_error" : null;

    await recordLedgerEntry(db, {
      updateId: request.transport.updateId,
      correlationId: ctx.correlationId,
      terminalStatus: result.status === "ok" ? "ok" : "error",
      handedToWorker: deliver,
      telegramDelivered: deliver,
      resultJson,
      failureReason: orchestrationFailure,
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

    await runtimePorts.deliverOutbound({
      chatId: request.delivery.chatId,
      result: ERROR_RESULT,
      replyToMessageId: request.delivery.replyToMessageId,
    });
  }
}

export async function handleConfirmationCallback(
  request: ConfirmationCallbackRequest,
  db: StoreDatabase,
  confirmationRegistry: ConfirmationRegistry,
): Promise<void> {
  const row = await getPendingConfirmation(db, request.confirmationId);
  if (!row || row.status !== "awaiting") {
    return;
  }

  const outcome = request.approved ? "approved" : "denied";
  const resolved = confirmationRegistry.resolve(
    request.confirmationId,
    outcome,
  );

  await finalizeConfirmationResolution(db, {
    confirmationId: request.confirmationId,
    status: outcome,
    callbackQueryId: request.callbackQueryId,
  });

  if (!resolved) {
    // Isolate may have restarted — callback still persisted in SQLite.
    console.log(
      JSON.stringify({
        layer: "runtime",
        action: "confirmation_callback_persisted",
        confirmationId: request.confirmationId,
        outcome,
      }),
    );
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

function handleNewConversation(): ExecutionResult {
  return {
    status: "ok",
    messages: [{ type: "text", text: NEW_CONVERSATION_MESSAGE }],
    attachments: [],
  };
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
