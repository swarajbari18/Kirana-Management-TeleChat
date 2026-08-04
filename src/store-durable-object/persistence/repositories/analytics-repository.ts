import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import {
  billingBillLines,
  billingBills,
  inventoryProducts,
  khataCustomers,
  khataLedgerEntries,
} from "../schema.js";
import type { PaymentSlice } from "../../../analytics/types.js";
import {
  billFinalizedAtToIstDateIso,
  isWithinRange,
} from "../../../analytics/period-boundaries.js";

export interface BillAggregation {
  totalSalesPaise: number;
  billCount: number;
  gstCollectedPaise: number;
  paymentBreakdown: {
    cash: PaymentSlice;
    upi: PaymentSlice;
    khata: PaymentSlice;
  };
}

export interface TopItemRow {
  sku: string;
  productName: string;
  revenuePaise: number;
  quantity: number;
}

export interface KhataCreditsAggregation {
  creditSalePaise: number;
  manualCreditPaise: number;
}

export interface DailyBillRow {
  dateIso: string;
  totalSalesPaise: number;
  billCount: number;
  gstCollectedPaise: number;
  paymentBreakdown: BillAggregation["paymentBreakdown"];
}

export interface LowStockProductRow {
  sku: string;
  productName: string;
  quantityOnHand: number;
  reorderLevel: number;
}

function emptyPaymentBreakdown(): BillAggregation["paymentBreakdown"] {
  return {
    cash: { paise: 0, count: 0 },
    upi: { paise: 0, count: 0 },
    khata: { paise: 0, count: 0 },
  };
}

function addPaymentSlice(
  breakdown: BillAggregation["paymentBreakdown"],
  method: string,
  amountPaise: number,
): void {
  if (method === "cash" || method === "upi" || method === "khata") {
    breakdown[method].paise += amountPaise;
    breakdown[method].count += 1;
  }
}

export async function countFinalizedBills(db: StoreDatabase): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(billingBills)
    .get();
  return result?.count ?? 0;
}

export async function aggregateBillsInRange(
  db: StoreDatabase,
  startIso: string,
  endIso: string,
): Promise<BillAggregation> {
  const rows = await db
    .select()
    .from(billingBills)
    .where(
      and(
        gte(billingBills.finalizedAt, startIso),
        lt(billingBills.finalizedAt, endIso),
      ),
    );

  const paymentBreakdown = emptyPaymentBreakdown();
  let totalSalesPaise = 0;
  let gstCollectedPaise = 0;

  for (const row of rows) {
    totalSalesPaise += row.grandTotalPaise;
    gstCollectedPaise += row.cgstTotalPaise + row.sgstTotalPaise;
    addPaymentSlice(paymentBreakdown, row.paymentMethod, row.grandTotalPaise);
  }

  return {
    totalSalesPaise,
    billCount: rows.length,
    gstCollectedPaise,
    paymentBreakdown,
  };
}

export async function aggregateTopItemsInRange(
  db: StoreDatabase,
  startIso: string,
  endIso: string,
  limit = 5,
): Promise<TopItemRow[]> {
  const rows = await db
    .select({
      sku: billingBillLines.sku,
      productName: billingBillLines.productName,
      revenuePaise: sql<number>`sum(${billingBillLines.lineTotalPaise})`,
      quantity: sql<number>`sum(${billingBillLines.quantity})`,
    })
    .from(billingBillLines)
    .innerJoin(billingBills, eq(billingBillLines.billId, billingBills.billId))
    .where(
      and(
        gte(billingBills.finalizedAt, startIso),
        lt(billingBills.finalizedAt, endIso),
      ),
    )
    .groupBy(billingBillLines.sku, billingBillLines.productName)
    .orderBy(desc(sql`sum(${billingBillLines.lineTotalPaise})`))
    .limit(limit);

  return rows.map((row) => ({
    sku: row.sku,
    productName: row.productName,
    revenuePaise: Number(row.revenuePaise ?? 0),
    quantity: Number(row.quantity ?? 0),
  }));
}

export async function aggregateKhataCreditsInRange(
  db: StoreDatabase,
  startIso: string,
  endIso: string,
): Promise<KhataCreditsAggregation> {
  const rows = await db
    .select()
    .from(khataLedgerEntries)
    .where(
      and(
        gte(khataLedgerEntries.createdAt, startIso),
        lt(khataLedgerEntries.createdAt, endIso),
      ),
    );

  let creditSalePaise = 0;
  let manualCreditPaise = 0;

  for (const row of rows) {
    if (row.entryType === "credit_sale") {
      creditSalePaise += row.amountPaise;
    } else if (row.entryType === "manual_credit") {
      manualCreditPaise += row.amountPaise;
    }
  }

  return { creditSalePaise, manualCreditPaise };
}

export async function getTotalOutstandingUdharPaise(
  db: StoreDatabase,
): Promise<number> {
  const customers = await db.select({ id: khataCustomers.id }).from(khataCustomers);
  let total = 0;

  for (const customer of customers) {
    const latest = await db
      .select({ balanceAfterPaise: khataLedgerEntries.balanceAfterPaise })
      .from(khataLedgerEntries)
      .where(eq(khataLedgerEntries.customerId, customer.id))
      .orderBy(desc(khataLedgerEntries.createdAt))
      .get();
    total += latest?.balanceAfterPaise ?? 0;
  }

  return total;
}

export async function listLowStockProducts(
  db: StoreDatabase,
): Promise<LowStockProductRow[]> {
  const rows = await db
    .select()
    .from(inventoryProducts)
    .where(eq(inventoryProducts.isActive, true));

  return rows
    .filter((row) => row.quantityOnHand <= row.reorderLevel)
    .map((row) => ({
      sku: row.sku,
      productName: row.productName,
      quantityOnHand: row.quantityOnHand,
      reorderLevel: row.reorderLevel,
    }));
}

export async function aggregateBillsByIstDay(
  db: StoreDatabase,
  startIso: string,
  endIso: string,
): Promise<DailyBillRow[]> {
  const rows = await db
    .select()
    .from(billingBills)
    .where(
      and(
        gte(billingBills.finalizedAt, startIso),
        lt(billingBills.finalizedAt, endIso),
      ),
    );

  const byDay = new Map<string, DailyBillRow>();

  for (const row of rows) {
    if (!isWithinRange(row.finalizedAt, startIso, endIso)) {
      continue;
    }
    const dateIso = billFinalizedAtToIstDateIso(row.finalizedAt);
    const existing = byDay.get(dateIso) ?? {
      dateIso,
      totalSalesPaise: 0,
      billCount: 0,
      gstCollectedPaise: 0,
      paymentBreakdown: emptyPaymentBreakdown(),
    };
    existing.totalSalesPaise += row.grandTotalPaise;
    existing.billCount += 1;
    existing.gstCollectedPaise += row.cgstTotalPaise + row.sgstTotalPaise;
    addPaymentSlice(
      existing.paymentBreakdown,
      row.paymentMethod,
      row.grandTotalPaise,
    );
    byDay.set(dateIso, existing);
  }

  return [...byDay.values()].sort((a, b) =>
    a.dateIso.localeCompare(b.dateIso),
  );
}
