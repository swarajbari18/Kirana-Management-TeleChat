import { eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import { agentTraceEvents } from "../schema.js";

export interface InsertTraceEventInput {
  eventId: string;
  updateId: number;
  correlationId: string;
  seq: number;
  parentEventId?: string | null;
  layer: string;
  component: string;
  stage: string;
  payload: unknown;
  createdAt?: string;
}

export async function insertTraceEvent(
  db: StoreDatabase,
  input: InsertTraceEventInput,
): Promise<void> {
  await db.insert(agentTraceEvents).values({
    eventId: input.eventId,
    updateId: input.updateId,
    correlationId: input.correlationId,
    seq: input.seq,
    parentEventId: input.parentEventId ?? null,
    layer: input.layer,
    component: input.component,
    stage: input.stage,
    payloadJson: JSON.stringify(input.payload),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export async function listTraceEventsByUpdateId(
  db: StoreDatabase,
  updateId: number,
): Promise<
  Array<{
    eventId: string;
    seq: number;
    parentEventId: string | null;
    layer: string;
    component: string;
    stage: string;
    payloadJson: string;
    createdAt: string;
  }>
> {
  const rows = await db
    .select({
      eventId: agentTraceEvents.eventId,
      seq: agentTraceEvents.seq,
      parentEventId: agentTraceEvents.parentEventId,
      layer: agentTraceEvents.layer,
      component: agentTraceEvents.component,
      stage: agentTraceEvents.stage,
      payloadJson: agentTraceEvents.payloadJson,
      createdAt: agentTraceEvents.createdAt,
    })
    .from(agentTraceEvents)
    .where(eq(agentTraceEvents.updateId, updateId))
    .orderBy(agentTraceEvents.seq)
    .all();

  return rows;
}
