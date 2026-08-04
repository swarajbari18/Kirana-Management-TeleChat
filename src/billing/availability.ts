import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import {
  getActiveReservedQuantity,
  getProductBySku,
} from "../store-durable-object/persistence/repositories/inventory-repository.js";
import type { DraftLine } from "./types.js";

export interface AvailabilityFailure {
  sku: string;
  productName: string;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  requestedQuantity: number;
}

export async function checkLineAvailability(
  db: StoreDatabase,
  line: DraftLine,
): Promise<AvailabilityFailure | null> {
  const product = await getProductBySku(db, line.sku);
  if (!product) {
    return {
      sku: line.sku,
      productName: line.productName,
      quantityOnHand: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      requestedQuantity: line.quantity,
    };
  }

  const reservedQuantity = await getActiveReservedQuantity(db, line.sku);
  const availableQuantity = product.quantityOnHand - reservedQuantity;

  if (line.quantity > availableQuantity) {
    return {
      sku: line.sku,
      productName: line.productName,
      quantityOnHand: product.quantityOnHand,
      reservedQuantity,
      availableQuantity,
      requestedQuantity: line.quantity,
    };
  }

  return null;
}

export function formatAvailabilityRefusal(
  failures: AvailabilityFailure[],
): string {
  const parts = failures.map(
    (f) =>
      `${f.productName}: requested ${f.requestedQuantity}, available ${f.availableQuantity} (${f.quantityOnHand} on hand, ${f.reservedQuantity} reserved)`,
  );
  return `Cannot finalize — insufficient sellable stock:\n${parts.join("\n")}`;
}

export function availabilityVerifiedFacts(
  failures: AvailabilityFailure[],
): Record<string, unknown> {
  if (failures.length === 1) {
    const f = failures[0]!;
    return {
      sku: f.sku,
      productName: f.productName,
      quantityOnHand: f.quantityOnHand,
      reservedQuantity: f.reservedQuantity,
      availableQuantity: f.availableQuantity,
      requestedQuantity: f.requestedQuantity,
    };
  }
  return { availabilityFailures: failures };
}
