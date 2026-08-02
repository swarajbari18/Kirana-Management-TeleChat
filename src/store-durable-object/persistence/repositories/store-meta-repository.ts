import { eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import { storeMeta } from "../schema.js";

const STORE_META_ID = 1;

export async function getOrCreateStoreMeta(db: StoreDatabase) {
  const existing = await db
    .select()
    .from(storeMeta)
    .where(eq(storeMeta.id, STORE_META_ID))
    .get();

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  await db.insert(storeMeta).values({
    id: STORE_META_ID,
    initializedAt: null,
    createdAt: now,
  });

  return {
    id: STORE_META_ID,
    initializedAt: null,
    createdAt: now,
  };
}

export async function setInitializedAt(
  db: StoreDatabase,
  initializedAt: string,
): Promise<void> {
  await db
    .update(storeMeta)
    .set({ initializedAt })
    .where(eq(storeMeta.id, STORE_META_ID));
}

export function isStoreInitialized(meta: {
  initializedAt: string | null;
}): boolean {
  return meta.initializedAt !== null;
}
