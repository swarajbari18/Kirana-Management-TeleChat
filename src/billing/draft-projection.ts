import type { DraftEventRow } from "../store-durable-object/persistence/repositories/billing-repository.js";
import { listDraftEvents } from "../store-durable-object/persistence/repositories/billing-repository.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { DraftLine, DraftProjection } from "./types.js";

function replayEvents(events: DraftEventRow[]): DraftProjection | null {
  if (events.length === 0) {
    return null;
  }

  const billId = events[0]!.billId;
  const projection: DraftProjection = {
    billId,
    started: false,
    lines: [],
  };

  const lineByRef = new Map<string, DraftLine>();
  let lineCounter = 0;

  for (const event of events) {
    projection.lastEventAt = event.createdAt;

    switch (event.eventType) {
      case "bill_started": {
        projection.started = true;
        if (typeof event.payload.customer_name === "string") {
          projection.customerName = event.payload.customer_name;
        }
        if (typeof event.payload.notes === "string") {
          projection.notes = event.payload.notes;
        }
        break;
      }
      case "customer_set": {
        projection.customerName = String(event.payload.customer_name ?? "");
        break;
      }
      case "notes_set": {
        projection.notes = String(event.payload.notes ?? "");
        break;
      }
      case "item_added": {
        lineCounter += 1;
        const lineRef = String(event.payload.line_ref);
        const line: DraftLine = {
          lineRef,
          lineNo: lineCounter,
          sku: String(event.payload.sku),
          productName: String(event.payload.product_name),
          quantity: Number(event.payload.quantity),
          unit: String(event.payload.unit),
          sellPricePaise: Number(event.payload.sell_price_paise),
          costPricePaise: Number(event.payload.cost_price_paise),
          hsnCode: String(event.payload.hsn_code),
          gstRate: Number(event.payload.gst_rate),
        };
        lineByRef.set(lineRef, line);
        break;
      }
      case "item_removed": {
        const lineRef = event.payload.line_ref as string | undefined;
        const productName = event.payload.product_name as string | undefined;
        if (lineRef) {
          lineByRef.delete(lineRef);
        } else if (productName) {
          const normalized = productName.toLowerCase();
          for (const [ref, line] of lineByRef) {
            if (line.productName.toLowerCase() === normalized) {
              lineByRef.delete(ref);
              break;
            }
          }
        }
        break;
      }
      case "item_qty_changed": {
        const lineRef = event.payload.line_ref as string | undefined;
        const productName = event.payload.product_name as string | undefined;
        const quantity = Number(event.payload.quantity);
        let target: DraftLine | undefined;
        if (lineRef) {
          target = lineByRef.get(lineRef);
        } else if (productName) {
          const normalized = productName.toLowerCase();
          target = [...lineByRef.values()].find(
            (line) => line.productName.toLowerCase() === normalized,
          );
        }
        if (target) {
          target.quantity = quantity;
        }
        break;
      }
      case "payment_method_set": {
        projection.paymentMethod = event.payload.payment_method as DraftProjection["paymentMethod"];
        break;
      }
      case "payment_reference_set": {
        projection.paymentReference = String(event.payload.payment_reference ?? "");
        break;
      }
      default:
        break;
    }
  }

  projection.lines = [...lineByRef.values()].sort(
    (a, b) => a.lineNo - b.lineNo,
  );
  return projection;
}

export async function loadDraftProjection(
  db: StoreDatabase,
  billId: string,
): Promise<DraftProjection | null> {
  const events = await listDraftEvents(db, billId);
  return replayEvents(events);
}

export function projectDraftFromEvents(
  events: DraftEventRow[],
): DraftProjection | null {
  return replayEvents(events);
}
