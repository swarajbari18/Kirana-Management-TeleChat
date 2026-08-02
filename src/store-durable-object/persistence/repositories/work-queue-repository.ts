import { asc, eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import { workQueue } from "../schema.js";

export type WorkQueueStatus = "pending" | "processing" | "completed" | "failed";

export interface WorkQueueItem {
  updateId: number;
  requestJson: string;
  status: WorkQueueStatus;
  correlationId: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
}

export async function enqueueWorkItem(
  db: StoreDatabase,
  input: { updateId: number; requestJson: string },
): Promise<void> {
  const existing = await db
    .select()
    .from(workQueue)
    .where(eq(workQueue.updateId, input.updateId))
    .get();
  if (existing) {
    return;
  }

  await db.insert(workQueue).values({
    updateId: input.updateId,
    requestJson: input.requestJson,
    status: "pending",
    enqueuedAt: new Date().toISOString(),
  });
}

export async function claimNextPendingItem(
  db: StoreDatabase,
  correlationId: string,
): Promise<WorkQueueItem | null> {
  const next = await db
    .select()
    .from(workQueue)
    .where(eq(workQueue.status, "pending"))
    .orderBy(asc(workQueue.enqueuedAt))
    .limit(1)
    .get();

  if (!next) {
    return null;
  }

  const now = new Date().toISOString();
  await db
    .update(workQueue)
    .set({
      status: "processing",
      correlationId,
      startedAt: now,
    })
    .where(eq(workQueue.updateId, next.updateId));

  return {
    updateId: next.updateId,
    requestJson: next.requestJson,
    status: "processing",
    correlationId,
    enqueuedAt: next.enqueuedAt,
    startedAt: now,
    completedAt: null,
    failureReason: null,
  };
}

export async function markWorkItemCompleted(
  db: StoreDatabase,
  updateId: number,
): Promise<void> {
  await db
    .update(workQueue)
    .set({
      status: "completed",
      completedAt: new Date().toISOString(),
    })
    .where(eq(workQueue.updateId, updateId));
}

export async function markWorkItemFailed(
  db: StoreDatabase,
  updateId: number,
  failureReason: string,
): Promise<void> {
  await db
    .update(workQueue)
    .set({
      status: "failed",
      failureReason,
      completedAt: new Date().toISOString(),
    })
    .where(eq(workQueue.updateId, updateId));
}

export async function hasPendingWork(db: StoreDatabase): Promise<boolean> {
  const row = await db
    .select()
    .from(workQueue)
    .where(eq(workQueue.status, "pending"))
    .limit(1)
    .get();
  return row !== undefined;
}
