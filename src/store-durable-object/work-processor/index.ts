import type { Env } from "../../env.js";
import type { ApplicationRequest } from "../../worker-telegram-adapter/contracts/index.js";
import { processWorkItem } from "../execution-manager/index.js";
import type { StoreDatabase } from "../persistence/db.js";
import {
  claimNextPendingItem,
  hasPendingWork,
  markWorkItemCompleted,
  markWorkItemFailed,
} from "../persistence/repositories/work-queue-repository.js";
import { ConfirmationRegistry } from "../runtime-ports/confirmation-registry.js";
import {
  clearAlarmIfIdle,
  rescheduleAlarm,
} from "./alarm-scheduler.js";

export interface WorkProcessorDeps {
  db: StoreDatabase;
  env: Env;
  storage: DurableObjectStorage;
  confirmationRegistry: ConfirmationRegistry;
  confirmTelegramDelivery: (updateId: number) => Promise<void>;
}

export async function processWorkQueue(
  deps: WorkProcessorDeps,
): Promise<void> {
  while (true) {
    const correlationId = crypto.randomUUID();
    const item = await claimNextPendingItem(deps.db, correlationId);
    if (!item) {
      break;
    }

    let request: ApplicationRequest;
    try {
      request = JSON.parse(item.requestJson) as ApplicationRequest;
    } catch {
      await markWorkItemFailed(deps.db, item.updateId, "Invalid request_json");
      continue;
    }

    try {
      await processWorkItem({
        request,
        db: deps.db,
        env: deps.env,
        correlationId,
        confirmationRegistry: deps.confirmationRegistry,
        confirmTelegramDelivery: deps.confirmTelegramDelivery,
      });
      await markWorkItemCompleted(deps.db, item.updateId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "UnknownError";
      await markWorkItemFailed(deps.db, item.updateId, reason);
    }
  }

  const pending = await hasPendingWork(deps.db);
  if (pending) {
    await rescheduleAlarm(deps.storage);
  } else {
    await clearAlarmIfIdle(deps.storage, false);
  }
}
