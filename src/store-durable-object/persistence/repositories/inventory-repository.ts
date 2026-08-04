import { and, eq, sql } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import {
  inventoryMovements,
  inventoryProductAliases,
  inventoryProducts,
  inventoryReservations,
} from "../schema.js";

export type ItemType = "packaged" | "loose";
export type Unit =
  | "packet"
  | "kg"
  | "g"
  | "litre"
  | "ml"
  | "dozen"
  | "piece";
export type GstRate = 0 | 5 | 12 | 18;
export type MovementType = "receive" | "reserve" | "commit" | "release" | "sale";
export type ReservationStatus = "reserved" | "committed" | "released";

export interface InventoryProductRow {
  sku: string;
  productName: string;
  itemType: ItemType;
  unit: Unit;
  quantityOnHand: number;
  costPrice: number;
  sellPrice: number;
  hsnCode: string;
  gstRate: GstRate;
  reorderLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMatch {
  sku: string;
  productName: string;
  quantityOnHand: number;
  costPrice: number;
  sellPrice: number;
  reorderLevel: number;
  itemType: ItemType;
  unit: Unit;
  hsnCode: string;
  gstRate: GstRate;
}

export function normalizeProductKey(value: string): string {
  return value.trim().toLowerCase();
}

function rowToProduct(row: typeof inventoryProducts.$inferSelect): InventoryProductRow {
  return {
    sku: row.sku,
    productName: row.productName,
    itemType: row.itemType as ItemType,
    unit: row.unit as Unit,
    quantityOnHand: row.quantityOnHand,
    costPrice: row.costPrice,
    sellPrice: row.sellPrice,
    hsnCode: row.hsnCode,
    gstRate: row.gstRate as GstRate,
    reorderLevel: row.reorderLevel,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToMatch(row: InventoryProductRow): ProductMatch {
  return {
    sku: row.sku,
    productName: row.productName,
    quantityOnHand: row.quantityOnHand,
    costPrice: row.costPrice,
    sellPrice: row.sellPrice,
    reorderLevel: row.reorderLevel,
    itemType: row.itemType,
    unit: row.unit,
    hsnCode: row.hsnCode,
    gstRate: row.gstRate,
  };
}

export async function listActiveProducts(
  db: StoreDatabase,
): Promise<InventoryProductRow[]> {
  const rows = await db
    .select()
    .from(inventoryProducts)
    .where(eq(inventoryProducts.isActive, true));
  return rows.map(rowToProduct);
}

export async function getProductBySku(
  db: StoreDatabase,
  sku: string,
): Promise<InventoryProductRow | null> {
  const row = await db
    .select()
    .from(inventoryProducts)
    .where(eq(inventoryProducts.sku, sku))
    .get();
  return row ? rowToProduct(row) : null;
}

export async function exactSearchProducts(
  db: StoreDatabase,
  productName: string,
): Promise<ProductMatch[]> {
  const normalized = normalizeProductKey(productName);
  const products = await listActiveProducts(db);
  const aliasRows = await db.select().from(inventoryProductAliases);
  const aliasBySku = new Map<string, string[]>();
  for (const alias of aliasRows) {
    const list = aliasBySku.get(alias.sku) ?? [];
    list.push(alias.alias);
    aliasBySku.set(alias.sku, list);
  }

  const matches: ProductMatch[] = [];
  for (const product of products) {
    if (normalizeProductKey(product.productName) === normalized) {
      matches.push(rowToMatch(product));
      continue;
    }
    const aliases = aliasBySku.get(product.sku) ?? [];
    if (aliases.some((alias) => normalizeProductKey(alias) === normalized)) {
      matches.push(rowToMatch(product));
    }
  }
  return matches;
}

export async function listLowStockProducts(
  db: StoreDatabase,
): Promise<ProductMatch[]> {
  const products = await listActiveProducts(db);
  return products
    .filter((p) => p.quantityOnHand < p.reorderLevel)
    .map(rowToMatch);
}

export async function listAllSkus(db: StoreDatabase): Promise<string[]> {
  const rows = await db.select({ sku: inventoryProducts.sku }).from(inventoryProducts);
  return rows.map((r) => r.sku);
}

export function generateSku(productName: string, existingSkus: string[]): string {
  const base = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "product";
  let suffix = 1;
  let sku = `${base}-${String(suffix).padStart(3, "0")}`;
  while (existingSkus.includes(sku)) {
    suffix += 1;
    sku = `${base}-${String(suffix).padStart(3, "0")}`;
  }
  return sku;
}

export function defaultReorderLevel(initialQuantity: number): number {
  return Math.max(1, Math.floor(initialQuantity * 0.2));
}

export async function getActiveReservedQuantity(
  db: StoreDatabase,
  sku: string,
): Promise<number> {
  const rows = await db
    .select()
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.sku, sku),
        eq(inventoryReservations.status, "reserved"),
      ),
    );
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

export interface CreateProductInput {
  sku: string;
  productName: string;
  itemType: ItemType;
  unit: Unit;
  quantity: number;
  costPrice: number;
  sellPrice: number;
  hsnCode: string;
  gstRate: GstRate;
  reorderLevel: number;
  aliases: string[];
  updateId: number;
  correlationId: string;
}

export async function createProductWithMovement(
  db: StoreDatabase,
  input: CreateProductInput,
): Promise<InventoryProductRow> {
  const now = new Date().toISOString();
  const movementId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(inventoryProducts).values({
      sku: input.sku,
      productName: input.productName,
      itemType: input.itemType,
      unit: input.unit,
      quantityOnHand: input.quantity,
      costPrice: input.costPrice,
      sellPrice: input.sellPrice,
      hsnCode: input.hsnCode,
      gstRate: input.gstRate,
      reorderLevel: input.reorderLevel,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    for (const alias of input.aliases) {
      const normalized = normalizeProductKey(alias);
      if (!normalized) {
        continue;
      }
      await tx.insert(inventoryProductAliases).values({
        sku: input.sku,
        alias: normalized,
      });
    }

    await tx.insert(inventoryMovements).values({
      id: movementId,
      sku: input.sku,
      movementType: "receive",
      quantityDelta: input.quantity,
      balanceBefore: 0,
      balanceAfter: input.quantity,
      referenceType: "register_inventory",
      referenceId: input.sku,
      updateId: input.updateId,
      correlationId: input.correlationId,
      createdAt: now,
    });
  });

  const created = await getProductBySku(db, input.sku);
  if (!created) {
    throw new Error("Post-create verify failed: product not found");
  }
  if (created.quantityOnHand !== input.quantity) {
    throw new Error("Post-create verify failed: quantity mismatch");
  }
  return created;
}

export interface UpdateProductInput {
  sku: string;
  quantityDelta?: number;
  costPrice?: number;
  sellPrice?: number;
  reorderLevel?: number;
  updateId: number;
  correlationId: string;
}

export async function updateProductWithMovement(
  db: StoreDatabase,
  input: UpdateProductInput,
): Promise<InventoryProductRow> {
  const current = await getProductBySku(db, input.sku);
  if (!current) {
    throw new Error(`Product not found: ${input.sku}`);
  }

  const beforeQty = current.quantityOnHand;
  const afterQty = beforeQty + (input.quantityDelta ?? 0);
  const now = new Date().toISOString();
  const movementId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .update(inventoryProducts)
      .set({
        quantityOnHand: afterQty,
        costPrice: input.costPrice ?? current.costPrice,
        sellPrice: input.sellPrice ?? current.sellPrice,
        reorderLevel: input.reorderLevel ?? current.reorderLevel,
        updatedAt: now,
      })
      .where(eq(inventoryProducts.sku, input.sku));

    if (input.quantityDelta && input.quantityDelta > 0) {
      await tx.insert(inventoryMovements).values({
        id: movementId,
        sku: input.sku,
        movementType: "receive",
        quantityDelta: input.quantityDelta,
        balanceBefore: beforeQty,
        balanceAfter: afterQty,
        referenceType: "update_inventory",
        referenceId: input.sku,
        updateId: input.updateId,
        correlationId: input.correlationId,
        createdAt: now,
      });
    }
  });

  const updated = await getProductBySku(db, input.sku);
  if (!updated) {
    throw new Error("Post-update verify failed: product not found");
  }
  if (updated.quantityOnHand !== afterQty) {
    throw new Error("Post-update verify failed: quantity mismatch");
  }
  return updated;
}

export interface ReserveInventoryInput {
  sku: string;
  quantity: number;
  draftBillId: string;
  idempotencyKey: string;
  updateId: number;
  correlationId: string;
}

export async function findReservationByIdempotencyKey(
  db: StoreDatabase,
  idempotencyKey: string,
) {
  return db
    .select()
    .from(inventoryReservations)
    .where(eq(inventoryReservations.idempotencyKey, idempotencyKey))
    .get();
}

export async function reserveInventory(
  db: StoreDatabase,
  input: ReserveInventoryInput,
): Promise<{ reservationId: string; availableAfter: number }> {
  const existing = await findReservationByIdempotencyKey(db, input.idempotencyKey);
  if (existing) {
    const onHand = (await getProductBySku(db, input.sku))?.quantityOnHand ?? 0;
    const reserved = await getActiveReservedQuantity(db, input.sku);
    return {
      reservationId: existing.id,
      availableAfter: onHand - reserved,
    };
  }

  const product = await getProductBySku(db, input.sku);
  if (!product) {
    throw new Error(`Product not found: ${input.sku}`);
  }

  const reserved = await getActiveReservedQuantity(db, input.sku);
  const available = product.quantityOnHand - reserved;
  if (input.quantity > available) {
    throw new Error(
      `insufficient_stock: requested ${input.quantity}, available ${available}`,
    );
  }

  const reservationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const movementId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(inventoryReservations).values({
      id: reservationId,
      sku: input.sku,
      quantity: input.quantity,
      draftBillId: input.draftBillId,
      status: "reserved",
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      resolvedAt: null,
    });

    await tx.insert(inventoryMovements).values({
      id: movementId,
      sku: input.sku,
      movementType: "reserve",
      quantityDelta: input.quantity,
      balanceBefore: product.quantityOnHand,
      balanceAfter: product.quantityOnHand,
      referenceType: "allocate_inventory",
      referenceId: reservationId,
      updateId: input.updateId,
      correlationId: input.correlationId,
      createdAt: now,
    });
  });

  const reservedAfter = await getActiveReservedQuantity(db, input.sku);
  return {
    reservationId,
    availableAfter: product.quantityOnHand - reservedAfter,
  };
}

export async function resolveReservation(
  db: StoreDatabase,
  input: {
    idempotencyKey: string;
    operation: "commit" | "release";
    updateId: number;
    correlationId: string;
  },
): Promise<{ reservationId: string; status: ReservationStatus }> {
  const existing = await findReservationByIdempotencyKey(db, input.idempotencyKey);
  if (!existing) {
    throw new Error(`Reservation not found for idempotency key: ${input.idempotencyKey}`);
  }

  if (existing.status === input.operation) {
    return { reservationId: existing.id, status: existing.status as ReservationStatus };
  }

  if (existing.status !== "reserved") {
    return {
      reservationId: existing.id,
      status: existing.status as ReservationStatus,
    };
  }

  const product = await getProductBySku(db, existing.sku);
  if (!product) {
    throw new Error(`Product not found: ${existing.sku}`);
  }

  const now = new Date().toISOString();
  const movementId = crypto.randomUUID();
  const newStatus: ReservationStatus =
    input.operation === "commit" ? "committed" : "released";

  await db.transaction(async (tx) => {
    await tx
      .update(inventoryReservations)
      .set({ status: newStatus, resolvedAt: now })
      .where(eq(inventoryReservations.id, existing.id));

    await tx.insert(inventoryMovements).values({
      id: movementId,
      sku: existing.sku,
      movementType: input.operation,
      quantityDelta: existing.quantity,
      balanceBefore: product.quantityOnHand,
      balanceAfter: product.quantityOnHand,
      referenceType: "allocate_inventory",
      referenceId: existing.id,
      updateId: input.updateId,
      correlationId: input.correlationId,
      createdAt: now,
    });
  });

  return { reservationId: existing.id, status: newStatus };
}

export async function countMovementsForSku(
  db: StoreDatabase,
  sku: string,
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.sku, sku))
    .get();
  return result?.count ?? 0;
}

export interface BillSaleLineCommit {
  sku: string;
  productName: string;
  quantity: number;
  beforeQty: number;
  afterQty: number;
}

export async function findSaleMovementsForBill(
  db: StoreDatabase,
  billId: string,
): Promise<typeof inventoryMovements.$inferSelect[]> {
  return db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.referenceType, "billing"),
        eq(inventoryMovements.referenceId, billId),
        eq(inventoryMovements.movementType, "sale"),
      ),
    );
}

export async function commitBillSale(
  db: StoreDatabase,
  input: {
    billId: string;
    lines: Array<{ sku: string; productName: string; quantity: number }>;
    updateId: number;
    correlationId: string;
  },
): Promise<{ alreadyCommitted: boolean; lines: BillSaleLineCommit[] }> {
  const existing = await findSaleMovementsForBill(db, input.billId);
  if (existing.length > 0) {
    const lines: BillSaleLineCommit[] = [];
    for (const movement of existing) {
      lines.push({
        sku: movement.sku,
        productName: input.lines.find((l) => l.sku === movement.sku)?.productName ?? movement.sku,
        quantity: Math.abs(movement.quantityDelta),
        beforeQty: movement.balanceBefore,
        afterQty: movement.balanceAfter,
      });
    }
    return { alreadyCommitted: true, lines };
  }

  const committed: BillSaleLineCommit[] = [];
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    for (const line of input.lines) {
      const product = await tx
        .select()
        .from(inventoryProducts)
        .where(eq(inventoryProducts.sku, line.sku))
        .get();
      if (!product) {
        throw new Error(`Product not found for commit_bill_sale: ${line.sku}`);
      }

      const reserved = await tx
        .select()
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.sku, line.sku),
            eq(inventoryReservations.status, "reserved"),
          ),
        );
      const reservedQty = reserved.reduce((sum, row) => sum + row.quantity, 0);
      const sellable = product.quantityOnHand - reservedQty;

      if (line.quantity > sellable) {
        throw new Error(
          `insufficient_stock: ${line.productName}: requested ${line.quantity}, sellable ${sellable}`,
        );
      }

      const balanceBefore = product.quantityOnHand;
      const balanceAfter = balanceBefore - line.quantity;

      await tx
        .update(inventoryProducts)
        .set({
          quantityOnHand: balanceAfter,
          updatedAt: now,
        })
        .where(eq(inventoryProducts.sku, line.sku));

      await tx.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        sku: line.sku,
        movementType: "sale",
        quantityDelta: -line.quantity,
        balanceBefore,
        balanceAfter,
        referenceType: "billing",
        referenceId: input.billId,
        updateId: input.updateId,
        correlationId: input.correlationId,
        createdAt: now,
      });

      committed.push({
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        beforeQty: balanceBefore,
        afterQty: balanceAfter,
      });
    }
  });

  for (const line of committed) {
    const actual = await getProductBySku(db, line.sku);
    if (!actual || actual.quantityOnHand !== line.afterQty) {
      throw new Error(`Post-commit verify failed: ${line.sku} quantity mismatch`);
    }
  }

  return { alreadyCommitted: false, lines: committed };
}
