import { eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import { shopProfile } from "../schema.js";

export interface ShopProfileSnapshot {
  shopName: string | null;
  ownerName: string | null;
  gstRegistered: boolean | null;
  gstin: string | null;
  instructions: string[];
  confirmationTimeoutMs: number;
  completeAutonomy: boolean;
}

const DEFAULT_PROFILE: ShopProfileSnapshot = {
  shopName: null,
  ownerName: null,
  gstRegistered: null,
  gstin: null,
  instructions: [],
  confirmationTimeoutMs: 300_000,
  completeAutonomy: false,
};

function parseInstructions(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return [];
}

function rowToSnapshot(row: typeof shopProfile.$inferSelect): ShopProfileSnapshot {
  return {
    shopName: row.shopName,
    ownerName: row.ownerName,
    gstRegistered: row.gstRegistered,
    gstin: row.gstin,
    instructions: parseInstructions(row.instructionsJson),
    confirmationTimeoutMs: row.confirmationTimeoutMs,
    completeAutonomy: row.completeAutonomy,
  };
}

export async function getShopProfile(
  db: StoreDatabase,
): Promise<ShopProfileSnapshot> {
  const row = await db.select().from(shopProfile).where(eq(shopProfile.id, 1)).get();
  if (!row) {
    return { ...DEFAULT_PROFILE };
  }
  return rowToSnapshot(row);
}

export async function ensureShopProfileRow(db: StoreDatabase): Promise<void> {
  const existing = await db
    .select()
    .from(shopProfile)
    .where(eq(shopProfile.id, 1))
    .get();
  if (existing) {
    return;
  }
  await db.insert(shopProfile).values({
    id: 1,
    instructionsJson: "[]",
    confirmationTimeoutMs: 300_000,
    completeAutonomy: false,
    updatedAt: new Date().toISOString(),
  });
}

export interface ShopProfileWrite {
  shopName?: string | null;
  ownerName?: string | null;
  gstRegistered?: boolean | null;
  gstin?: string | null;
  instructions?: string[];
  confirmationTimeoutMs?: number;
  completeAutonomy?: boolean;
}

export async function updateShopProfile(
  db: StoreDatabase,
  write: ShopProfileWrite,
): Promise<ShopProfileSnapshot> {
  await ensureShopProfileRow(db);
  const current = await getShopProfile(db);
  const updated: ShopProfileSnapshot = {
    shopName: write.shopName !== undefined ? write.shopName : current.shopName,
    ownerName:
      write.ownerName !== undefined ? write.ownerName : current.ownerName,
    gstRegistered:
      write.gstRegistered !== undefined
        ? write.gstRegistered
        : current.gstRegistered,
    gstin: write.gstin !== undefined ? write.gstin : current.gstin,
    instructions:
      write.instructions !== undefined
        ? write.instructions
        : current.instructions,
    confirmationTimeoutMs:
      write.confirmationTimeoutMs ?? current.confirmationTimeoutMs,
    completeAutonomy:
      write.completeAutonomy !== undefined
        ? write.completeAutonomy
        : current.completeAutonomy,
  };

  await db
    .update(shopProfile)
    .set({
      shopName: updated.shopName,
      ownerName: updated.ownerName,
      gstRegistered: updated.gstRegistered,
      gstin: updated.gstin,
      instructionsJson: JSON.stringify(updated.instructions),
      confirmationTimeoutMs: updated.confirmationTimeoutMs,
      completeAutonomy: updated.completeAutonomy,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(shopProfile.id, 1));

  return updated;
}
