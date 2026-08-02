import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  getShopProfile,
  updateShopProfile,
} from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";

export async function updateInstructionPreference(
  db: StoreDatabase,
  input: { instruction: string; mode?: "append" | "replace" },
): Promise<Record<string, unknown>> {
  const current = await getShopProfile(db);
  const mode = input.mode ?? "append";
  const instructions =
    mode === "replace"
      ? [input.instruction]
      : [...current.instructions, input.instruction];

  const updated = await updateShopProfile(db, { instructions });
  return { instructions: updated.instructions };
}
