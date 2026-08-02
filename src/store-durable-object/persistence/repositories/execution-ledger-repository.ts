import { eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import { executionLedger } from "../schema.js";

export async function findLedgerByUpdateId(
  db: StoreDatabase,
  updateId: number,
) {
  return db
    .select()
    .from(executionLedger)
    .where(eq(executionLedger.updateId, updateId))
    .get();
}

export interface LedgerRecordInput {
  updateId: number;
  correlationId: string;
  terminalStatus: "ok" | "error";
  handedToWorker: boolean;
  telegramDelivered: boolean;
  resultJson?: string | null;
  failureReason?: string | null;
  completedAt: string;
}

export async function recordLedgerEntry(
  db: StoreDatabase,
  input: LedgerRecordInput,
): Promise<void> {
  await db.insert(executionLedger).values({
    updateId: input.updateId,
    correlationId: input.correlationId,
    terminalStatus: input.terminalStatus,
    handedToWorker: input.handedToWorker,
    telegramDelivered: input.telegramDelivered,
    resultJson: input.resultJson ?? null,
    failureReason: input.failureReason ?? null,
    completedAt: input.completedAt,
  });
}

export async function markTelegramDelivered(
  db: StoreDatabase,
  updateId: number,
): Promise<void> {
  await db
    .update(executionLedger)
    .set({ telegramDelivered: true })
    .where(eq(executionLedger.updateId, updateId));
}
