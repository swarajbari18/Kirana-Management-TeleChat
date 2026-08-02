import { eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import { pendingConfirmations } from "../schema.js";

export type ConfirmationStatus = "awaiting" | "approved" | "denied" | "expired";

export interface PendingConfirmationRow {
  id: string;
  updateId: number;
  correlationId: string;
  toolName: string;
  displayPayloadJson: string;
  pendingWriteJson: string;
  status: ConfirmationStatus;
  callbackQueryId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export async function insertPendingConfirmation(
  db: StoreDatabase,
  input: {
    id: string;
    updateId: number;
    correlationId: string;
    toolName: string;
    displayPayloadJson: string;
    pendingWriteJson: string;
  },
): Promise<void> {
  await db.insert(pendingConfirmations).values({
    id: input.id,
    updateId: input.updateId,
    correlationId: input.correlationId,
    toolName: input.toolName,
    displayPayloadJson: input.displayPayloadJson,
    pendingWriteJson: input.pendingWriteJson,
    status: "awaiting",
    createdAt: new Date().toISOString(),
  });
}

export async function getPendingConfirmation(
  db: StoreDatabase,
  id: string,
): Promise<PendingConfirmationRow | null> {
  const row = await db
    .select()
    .from(pendingConfirmations)
    .where(eq(pendingConfirmations.id, id))
    .get();
  if (!row) {
    return null;
  }
  return row as PendingConfirmationRow;
}

export async function resolvePendingConfirmation(
  db: StoreDatabase,
  input: {
    id: string;
    status: ConfirmationStatus;
    callbackQueryId?: string;
  },
): Promise<void> {
  await db
    .update(pendingConfirmations)
    .set({
      status: input.status,
      callbackQueryId: input.callbackQueryId ?? null,
      resolvedAt: new Date().toISOString(),
    })
    .where(eq(pendingConfirmations.id, input.id));
}
