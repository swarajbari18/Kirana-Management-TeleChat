import { and, desc, eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import {
  billingBillLines,
  billingBills,
  billingDraftEvents,
  billingDrafts,
} from "../schema.js";
import { normalizeProductKey } from "./inventory-repository.js";

export type DraftStatus = "open" | "finalized" | "cancelled";
export type PaymentMethod = "cash" | "upi" | "khata";

export type DraftEventType =
  | "bill_started"
  | "customer_set"
  | "notes_set"
  | "item_added"
  | "item_removed"
  | "item_qty_changed"
  | "payment_method_set"
  | "payment_reference_set";

export interface DraftEventRow {
  id: string;
  billId: string;
  eventType: DraftEventType;
  payload: Record<string, unknown>;
  updateId: number;
  correlationId: string;
  createdAt: string;
}

export interface DraftHeaderRow {
  billId: string;
  status: DraftStatus;
  customerName: string | null;
  lastEventAt: string;
  createdAt: string;
  finalizedAt: string | null;
}

export interface OpenDraftSummary {
  billId: string;
  customerName: string | null;
  lineCount: number;
  lastEventAt: string;
}

export interface FinalizedBillRow {
  billId: string;
  customerName: string;
  notes: string | null;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  subtotalPaise: number;
  cgstTotalPaise: number;
  sgstTotalPaise: number;
  grandTotalPaise: number;
  finalizedAt: string;
  updateId: number;
  correlationId: string;
}

export interface FinalizedBillLineRow {
  id: string;
  billId: string;
  lineNo: number;
  sku: string;
  productName: string;
  quantity: number;
  unit: string;
  sellPricePaise: number;
  hsnCode: string;
  gstRate: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  lineTotalPaise: number;
}

export interface FinalizeBillLineInput {
  lineNo: number;
  sku: string;
  productName: string;
  quantity: number;
  unit: string;
  sellPricePaise: number;
  costPricePaise: number;
  hsnCode: string;
  gstRate: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  lineTotalPaise: number;
}

export interface FinalizeBillInput {
  billId: string;
  customerName: string;
  notes: string | null;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  subtotalPaise: number;
  cgstTotalPaise: number;
  sgstTotalPaise: number;
  grandTotalPaise: number;
  lines: FinalizeBillLineInput[];
  updateId: number;
  correlationId: string;
}

export function normalizeCustomerNameForMatch(name: string): string {
  return normalizeProductKey(name);
}

export async function listOpenDraftHeaders(
  db: StoreDatabase,
): Promise<DraftHeaderRow[]> {
  const rows = await db
    .select()
    .from(billingDrafts)
    .where(eq(billingDrafts.status, "open"))
    .orderBy(desc(billingDrafts.lastEventAt));
  return rows.map((row) => ({
    billId: row.billId,
    status: row.status as DraftStatus,
    customerName: row.customerName,
    lastEventAt: row.lastEventAt,
    createdAt: row.createdAt,
    finalizedAt: row.finalizedAt,
  }));
}

export async function getDraftHeader(
  db: StoreDatabase,
  billId: string,
): Promise<DraftHeaderRow | null> {
  const row = await db
    .select()
    .from(billingDrafts)
    .where(eq(billingDrafts.billId, billId))
    .get();
  if (!row) {
    return null;
  }
  return {
    billId: row.billId,
    status: row.status as DraftStatus,
    customerName: row.customerName,
    lastEventAt: row.lastEventAt,
    createdAt: row.createdAt,
    finalizedAt: row.finalizedAt,
  };
}

export async function listDraftEvents(
  db: StoreDatabase,
  billId: string,
): Promise<DraftEventRow[]> {
  const rows = await db
    .select()
    .from(billingDraftEvents)
    .where(eq(billingDraftEvents.billId, billId))
    .orderBy(billingDraftEvents.createdAt);
  return rows.map((row) => ({
    id: row.id,
    billId: row.billId,
    eventType: row.eventType as DraftEventType,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    updateId: row.updateId,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  }));
}

export async function countDraftLines(
  db: StoreDatabase,
  billId: string,
): Promise<number> {
  const events = await listDraftEvents(db, billId);
  let count = 0;
  for (const event of events) {
    if (event.eventType === "item_added") {
      count += 1;
    }
    if (event.eventType === "item_removed") {
      count -= 1;
    }
  }
  return Math.max(0, count);
}

export async function buildOpenDraftSummaries(
  db: StoreDatabase,
): Promise<OpenDraftSummary[]> {
  const headers = await listOpenDraftHeaders(db);
  const summaries: OpenDraftSummary[] = [];
  for (const header of headers) {
    summaries.push({
      billId: header.billId,
      customerName: header.customerName,
      lineCount: await countDraftLines(db, header.billId),
      lastEventAt: header.lastEventAt,
    });
  }
  return summaries;
}

export async function createDraftHeader(
  db: StoreDatabase,
  billId: string,
  customerName?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(billingDrafts).values({
    billId,
    status: "open",
    customerName: customerName ?? null,
    lastEventAt: now,
    createdAt: now,
    finalizedAt: null,
  });
}

export async function appendDraftEvent(
  db: StoreDatabase,
  input: {
    billId: string;
    eventType: DraftEventType;
    payload: Record<string, unknown>;
    updateId: number;
    correlationId: string;
    customerName?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(billingDraftEvents).values({
      id: eventId,
      billId: input.billId,
      eventType: input.eventType,
      payloadJson: JSON.stringify(input.payload),
      updateId: input.updateId,
      correlationId: input.correlationId,
      createdAt: now,
    });

    await tx
      .update(billingDrafts)
      .set({
        lastEventAt: now,
        ...(input.customerName !== undefined
          ? { customerName: input.customerName }
          : {}),
      })
      .where(eq(billingDrafts.billId, input.billId));
  });
}

export async function hardDeleteDraft(
  db: StoreDatabase,
  billId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(billingDraftEvents)
      .where(eq(billingDraftEvents.billId, billId));
    await tx.delete(billingDrafts).where(eq(billingDrafts.billId, billId));
  });
}

export async function findOpenDraftsByCustomer(
  db: StoreDatabase,
  customerName: string,
): Promise<OpenDraftSummary[]> {
  const normalized = normalizeCustomerNameForMatch(customerName);
  const headers = await listOpenDraftHeaders(db);
  const matches: OpenDraftSummary[] = [];
  for (const header of headers) {
    if (
      header.customerName &&
      normalizeCustomerNameForMatch(header.customerName) === normalized
    ) {
      matches.push({
        billId: header.billId,
        customerName: header.customerName,
        lineCount: await countDraftLines(db, header.billId),
        lastEventAt: header.lastEventAt,
      });
    }
  }
  return matches;
}

export async function getLatestOpenDraft(
  db: StoreDatabase,
): Promise<DraftHeaderRow | null> {
  const row = await db
    .select()
    .from(billingDrafts)
    .where(eq(billingDrafts.status, "open"))
    .orderBy(desc(billingDrafts.lastEventAt))
    .get();
  if (!row) {
    return null;
  }
  return {
    billId: row.billId,
    status: row.status as DraftStatus,
    customerName: row.customerName,
    lastEventAt: row.lastEventAt,
    createdAt: row.createdAt,
    finalizedAt: row.finalizedAt,
  };
}

export async function finalizeBillTransaction(
  db: StoreDatabase,
  input: FinalizeBillInput,
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.insert(billingBills).values({
      billId: input.billId,
      customerName: input.customerName,
      notes: input.notes,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      subtotalPaise: input.subtotalPaise,
      cgstTotalPaise: input.cgstTotalPaise,
      sgstTotalPaise: input.sgstTotalPaise,
      grandTotalPaise: input.grandTotalPaise,
      finalizedAt: now,
      updateId: input.updateId,
      correlationId: input.correlationId,
    });

    for (const line of input.lines) {
      await tx.insert(billingBillLines).values({
        id: crypto.randomUUID(),
        billId: input.billId,
        lineNo: line.lineNo,
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        unit: line.unit,
        sellPricePaise: line.sellPricePaise,
        hsnCode: line.hsnCode,
        gstRate: line.gstRate,
        taxablePaise: line.taxablePaise,
        cgstPaise: line.cgstPaise,
        sgstPaise: line.sgstPaise,
        lineTotalPaise: line.lineTotalPaise,
      });
    }

    await tx
      .delete(billingDraftEvents)
      .where(eq(billingDraftEvents.billId, input.billId));
    await tx.delete(billingDrafts).where(eq(billingDrafts.billId, input.billId));
  });
}

export async function getFinalizedBill(
  db: StoreDatabase,
  billId: string,
): Promise<FinalizedBillRow | null> {
  const row = await db
    .select()
    .from(billingBills)
    .where(eq(billingBills.billId, billId))
    .get();
  if (!row) {
    return null;
  }
  return {
    billId: row.billId,
    customerName: row.customerName,
    notes: row.notes,
    paymentMethod: row.paymentMethod as PaymentMethod,
    paymentReference: row.paymentReference,
    subtotalPaise: row.subtotalPaise,
    cgstTotalPaise: row.cgstTotalPaise,
    sgstTotalPaise: row.sgstTotalPaise,
    grandTotalPaise: row.grandTotalPaise,
    finalizedAt: row.finalizedAt,
    updateId: row.updateId,
    correlationId: row.correlationId,
  };
}

export async function listFinalizedBillLines(
  db: StoreDatabase,
  billId: string,
): Promise<FinalizedBillLineRow[]> {
  const rows = await db
    .select()
    .from(billingBillLines)
    .where(eq(billingBillLines.billId, billId))
    .orderBy(billingBillLines.lineNo);
  return rows.map((row) => ({
    id: row.id,
    billId: row.billId,
    lineNo: row.lineNo,
    sku: row.sku,
    productName: row.productName,
    quantity: row.quantity,
    unit: row.unit,
    sellPricePaise: row.sellPricePaise,
    hsnCode: row.hsnCode,
    gstRate: row.gstRate,
    taxablePaise: row.taxablePaise,
    cgstPaise: row.cgstPaise,
    sgstPaise: row.sgstPaise,
    lineTotalPaise: row.lineTotalPaise,
  }));
}

export async function listRecentFinalizedBills(
  db: StoreDatabase,
  limit = 5,
): Promise<FinalizedBillRow[]> {
  const rows = await db
    .select()
    .from(billingBills)
    .orderBy(desc(billingBills.finalizedAt))
    .limit(limit);
  return rows.map((row) => ({
    billId: row.billId,
    customerName: row.customerName,
    notes: row.notes,
    paymentMethod: row.paymentMethod as PaymentMethod,
    paymentReference: row.paymentReference,
    subtotalPaise: row.subtotalPaise,
    cgstTotalPaise: row.cgstTotalPaise,
    sgstTotalPaise: row.sgstTotalPaise,
    grandTotalPaise: row.grandTotalPaise,
    finalizedAt: row.finalizedAt,
    updateId: row.updateId,
    correlationId: row.correlationId,
  }));
}
