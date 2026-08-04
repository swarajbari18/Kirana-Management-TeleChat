import { describe, expect, it } from "vitest";
import {
  aggregateBillsInRange,
  aggregateKhataCreditsInRange,
  aggregateTopItemsInRange,
  countFinalizedBills,
  getTotalOutstandingUdharPaise,
} from "../store-durable-object/persistence/repositories/analytics-repository.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";

function billsDb(rows: Array<Record<string, unknown>>): StoreDatabase {
  return {
    select: () => ({
      from: () => ({
        where: async () => rows,
        get: async () => ({ count: rows.length }),
      }),
    }),
  } as unknown as StoreDatabase;
}

function topItemsDb(
  rows: Array<{
    sku: string;
    productName: string;
    revenuePaise: number;
    quantity: number;
  }>,
): StoreDatabase {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: () => ({
              orderBy: () => ({
                limit: async () => rows,
              }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as StoreDatabase;
}

function ledgerDb(rows: Array<Record<string, unknown>>): StoreDatabase {
  return {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  } as unknown as StoreDatabase;
}

describe("REPO-01", () => {
  it("aggregateBillsInRange sums seeded bills", async () => {
    const result = await aggregateBillsInRange(
      billsDb([
        {
          grandTotalPaise: 10000,
          cgstTotalPaise: 250,
          sgstTotalPaise: 250,
          paymentMethod: "cash",
        },
        {
          grandTotalPaise: 5000,
          cgstTotalPaise: 125,
          sgstTotalPaise: 125,
          paymentMethod: "upi",
        },
      ]),
      "2026-08-11T00:00:00.000Z",
      "2026-08-12T00:00:00.000Z",
    );
    expect(result.totalSalesPaise).toBe(15000);
    expect(result.billCount).toBe(2);
    expect(result.gstCollectedPaise).toBe(750);
    expect(result.paymentBreakdown.cash.paise).toBe(10000);
    expect(result.paymentBreakdown.upi.paise).toBe(5000);
  });
});

describe("REPO-02", () => {
  it("orders top items by revenue", async () => {
    const top = await aggregateTopItemsInRange(
      topItemsDb([
        {
          sku: "b",
          productName: "Sugar",
          revenuePaise: 8000,
          quantity: 1,
        },
        {
          sku: "a",
          productName: "Maggi",
          revenuePaise: 5000,
          quantity: 2,
        },
      ]),
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
      5,
    );
    expect(top[0]?.productName).toBe("Sugar");
    expect(top[0]?.revenuePaise).toBe(8000);
  });
});

describe("REPO-03", () => {
  it("splits khata credits by entry_type", async () => {
    const credits = await aggregateKhataCreditsInRange(
      ledgerDb([
        { entryType: "credit_sale", amountPaise: 3000 },
        { entryType: "manual_credit", amountPaise: 2000 },
        { entryType: "payment", amountPaise: 1000 },
      ]),
      "2026-08-11T00:00:00.000Z",
      "2026-08-12T00:00:00.000Z",
    );
    expect(credits.creditSalePaise).toBe(3000);
    expect(credits.manualCreditPaise).toBe(2000);
  });
});

describe("REPO-04", () => {
  it("counts finalized bills for empty gate", async () => {
    await expect(countFinalizedBills(billsDb([{}, {}]))).resolves.toBe(2);
  });

  it("outstanding udhar sums latest balances per customer", async () => {
    let customerPass = true;
    const db = {
      select: () => ({
        from: () => {
          if (customerPass) {
            customerPass = false;
            return [{ id: "c1" }, { id: "c2" }];
          }
          return {
            where: () => ({
              orderBy: () => ({
                get: async () => ({ balanceAfterPaise: 1500 }),
              }),
            }),
          };
        },
      }),
    } as unknown as StoreDatabase;

    await expect(getTotalOutstandingUdharPaise(db)).resolves.toBe(3000);
  });
});
