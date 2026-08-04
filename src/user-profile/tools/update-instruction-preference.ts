import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  getShopProfile,
  updateShopProfile,
} from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import { appendShopProfileHistory } from "../../store-durable-object/persistence/repositories/shop-profile-history-repository.js";

export async function updateInstructionPreference(
  db: StoreDatabase,
  input: {
    instruction: string;
    mode?: "append" | "replace";
    updateId?: number;
    correlationId?: string;
  },
): Promise<Record<string, unknown>> {
  const current = await getShopProfile(db);
  const mode = input.mode ?? "append";
  const instructions =
    mode === "replace"
      ? [input.instruction]
      : [...current.instructions, input.instruction];

  const before = await getShopProfile(db);
  const updated = await updateShopProfile(db, { instructions });

  if (input.updateId !== undefined && input.correlationId !== undefined) {
    await appendShopProfileHistory(db, before, updated, {
      updateId: input.updateId,
      correlationId: input.correlationId,
    });
  }

  return { instructions: updated.instructions };
}
