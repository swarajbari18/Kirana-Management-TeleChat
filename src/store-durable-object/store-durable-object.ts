import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.js";
import type { ApplicationRequest } from "../worker-telegram-adapter/contracts/index.js";
import type { ExecutionResult } from "../worker-telegram-adapter/contracts/index.js";
import {
  confirmTelegramDelivery as confirmDelivery,
  execute,
} from "./execution-manager/index.js";
import {
  createDatabase,
  runDrizzleMigrations,
  type StoreDatabase,
} from "./persistence/db.js";

export class StoreDurableObject extends DurableObject {
  private db: StoreDatabase;

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
    return execute(request, this.db);
  }

  async confirmTelegramDelivery(updateId: number): Promise<void> {
    return confirmDelivery(this.db, updateId);
  }
}
