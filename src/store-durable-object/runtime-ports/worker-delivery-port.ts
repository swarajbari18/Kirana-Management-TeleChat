import type { Env } from "../../env.js";
import type { StoreDatabase } from "../persistence/db.js";
import {
  insertPendingConfirmation,
  resolvePendingConfirmation,
} from "../persistence/repositories/pending-confirmation-repository.js";
import {
  ConfirmationRegistry,
  waitForConfirmation as waitForConfirmationOutcome,
} from "./confirmation-registry.js";
import type { RuntimePorts } from "./types.js";

export interface WorkerDeliveryPortContext {
  env: Env;
  db: StoreDatabase;
  storeId: string;
  correlationId: string;
  updateId: number;
  confirmationRegistry: ConfirmationRegistry;
}

export function createWorkerDeliveryPort(
  ctx: WorkerDeliveryPortContext,
): RuntimePorts {
  return {
    async deliverConfirmation(input) {
      await ctx.env.TELEGRAM_DELIVERY.deliverConfirmation({
        storeId: ctx.storeId,
        confirmationId: input.confirmationId,
        chatId: input.chatId,
        text: input.text,
        replyMarkup: input.replyMarkup,
        correlationId: ctx.correlationId,
      });
    },

    async deliverOutbound(input) {
      await ctx.env.TELEGRAM_DELIVERY.deliverOutbound({
        storeId: ctx.storeId,
        chatId: input.chatId,
        result: input.result,
        replyToMessageId: input.replyToMessageId,
        correlationId: ctx.correlationId,
      });
    },

    async waitForConfirmation(confirmationId, timeoutMs) {
      return waitForConfirmationOutcome(
        ctx.confirmationRegistry,
        confirmationId,
        timeoutMs,
      );
    },
  };
}

export async function persistPendingConfirmation(
  db: StoreDatabase,
  input: {
    confirmationId: string;
    updateId: number;
    correlationId: string;
    toolName: string;
    displayPayload: Record<string, unknown>;
    pendingWrite: Record<string, unknown>;
  },
): Promise<void> {
  await insertPendingConfirmation(db, {
    id: input.confirmationId,
    updateId: input.updateId,
    correlationId: input.correlationId,
    toolName: input.toolName,
    displayPayloadJson: JSON.stringify(input.displayPayload),
    pendingWriteJson: JSON.stringify(input.pendingWrite),
  });
}

export async function finalizeConfirmationResolution(
  db: StoreDatabase,
  input: {
    confirmationId: string;
    status: "approved" | "denied" | "expired";
    callbackQueryId?: string;
  },
): Promise<void> {
  await resolvePendingConfirmation(db, {
    id: input.confirmationId,
    status: input.status,
    callbackQueryId: input.callbackQueryId,
  });
}
