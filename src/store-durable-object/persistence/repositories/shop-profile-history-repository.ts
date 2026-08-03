import type { StoreDatabase } from "../db.js";
import { shopProfileHistory } from "../schema.js";
import type { ShopProfileSnapshot } from "./shop-profile-repository.js";

export type ProfileHistoryField =
  | "shop_name"
  | "owner_name"
  | "gstin"
  | "gst_registered"
  | "instructions";

export interface ProfileHistoryProvenance {
  updateId: number;
  correlationId: string;
}

function serializeValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(value);
}

export async function appendShopProfileHistory(
  db: StoreDatabase,
  before: ShopProfileSnapshot,
  after: ShopProfileSnapshot,
  provenance: ProfileHistoryProvenance,
): Promise<void> {
  const appliedAt = new Date().toISOString();
  const changes: Array<{
    field: ProfileHistoryField;
    oldValue: string | null;
    newValue: string | null;
  }> = [];

  if (before.shopName !== after.shopName) {
    changes.push({
      field: "shop_name",
      oldValue: serializeValue(before.shopName),
      newValue: serializeValue(after.shopName),
    });
  }
  if (before.ownerName !== after.ownerName) {
    changes.push({
      field: "owner_name",
      oldValue: serializeValue(before.ownerName),
      newValue: serializeValue(after.ownerName),
    });
  }
  if (before.gstRegistered !== after.gstRegistered) {
    changes.push({
      field: "gst_registered",
      oldValue: serializeValue(before.gstRegistered),
      newValue: serializeValue(after.gstRegistered),
    });
  }
  if (before.gstin !== after.gstin) {
    changes.push({
      field: "gstin",
      oldValue: serializeValue(before.gstin),
      newValue: serializeValue(after.gstin),
    });
  }
  if (JSON.stringify(before.instructions) !== JSON.stringify(after.instructions)) {
    changes.push({
      field: "instructions",
      oldValue: serializeValue(before.instructions),
      newValue: serializeValue(after.instructions),
    });
  }

  for (const change of changes) {
    await db.insert(shopProfileHistory).values({
      id: crypto.randomUUID(),
      updateId: provenance.updateId,
      correlationId: provenance.correlationId,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      appliedAt,
    });
  }
}
