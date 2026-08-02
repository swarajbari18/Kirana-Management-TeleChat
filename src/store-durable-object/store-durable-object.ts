import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.js";
import type {
  ApplicationRequest,
  ConfirmationCallbackRequest,
  ExecutionResult,
} from "../worker-telegram-adapter/contracts/index.js";
import {
  confirmTelegramDelivery as confirmDelivery,
  enqueueRequest,
  handleConfirmationCallback as resolveConfirmation,
} from "./execution-manager/index.js";
import {
  createDatabase,
  runDrizzleMigrations,
  type StoreDatabase,
} from "./persistence/db.js";
import { ConfirmationRegistry } from "./runtime-ports/confirmation-registry.js";
import { scheduleAlarmIfNeeded } from "./work-processor/alarm-scheduler.js";
import { processWorkQueue } from "./work-processor/index.js";

const EMPTY_OK: ExecutionResult = {
  status: "ok",
  messages: [],
  attachments: [],
};

export class StoreDurableObject extends DurableObject<Env> {
  private db: StoreDatabase;
  private readonly confirmationRegistry = new ConfirmationRegistry();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = createDatabase(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      await runDrizzleMigrations(this.db);
    });
  }

  async handleApplicationRequest(
    request: ApplicationRequest,
  ): Promise<ExecutionResult> {
    const enqueued = await enqueueRequest(request, this.db);
    if (enqueued) {
      await scheduleAlarmIfNeeded(this.ctx.storage);
    }
    return EMPTY_OK;
  }

  async handleConfirmationCallback(
    request: ConfirmationCallbackRequest,
  ): Promise<void> {
    await resolveConfirmation(
      request,
      this.db,
      this.confirmationRegistry,
    );
  }

  async alarm(): Promise<void> {
    await processWorkQueue({
      db: this.db,
      env: this.env,
      storage: this.ctx.storage,
      confirmationRegistry: this.confirmationRegistry,
      confirmTelegramDelivery: (updateId) =>
        confirmDelivery(this.db, updateId),
    });
  }

  async confirmTelegramDelivery(updateId: number): Promise<void> {
    return confirmDelivery(this.db, updateId);
  }
}
