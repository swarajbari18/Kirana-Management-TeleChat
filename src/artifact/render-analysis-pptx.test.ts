import { describe, expect, it } from "vitest";
import { renderAnalysisPptx } from "./render-analysis-pptx.js";
import type { AnalysisSnapshot } from "../analytics/types.js";
import { EMPTY_PAYMENT_BREAKDOWN } from "../analytics/types.js";

function makePeriod(overrides: Partial<AnalysisSnapshot["daily"]> = {}) {
  return {
    periodId: "daily",
    label: "Today",
    rangeStartIso: "2026-08-11T00:00:00+05:30",
    rangeEndIso: "2026-08-11T23:59:59+05:30",
    totalSalesPaise: 12000,
    billCount: 2,
    gstCollectedPaise: 600,
    paymentBreakdown: {
      cash: { paise: 7000, count: 1 },
      upi: { paise: 5000, count: 1 },
      khata: { paise: 0, count: 0 },
    },
    khataCreditsInPeriod: {
      creditSalePaise: 1000,
      manualCreditPaise: 500,
    },
    topItems: [
      {
        sku: "maggi",
        productName: "Maggi",
        revenuePaise: 7000,
        quantity: 2,
      },
    ],
    totalOutstandingUdharPaise: 25000,
    ...overrides,
  };
}

function makeSnapshot(): AnalysisSnapshot {
  const daily = makePeriod();
  return {
    generatedAtIso: "2026-08-11T10:00:00.000Z",
    shopName: "Test Shop",
    daily,
    currentWeek: {
      ...makePeriod({ periodId: "current_week", label: "This week" }),
      days: [
        {
          dateIso: "2026-08-11",
          totalSalesPaise: 12000,
          billCount: 2,
          gstCollectedPaise: 600,
          paymentBreakdown: daily.paymentBreakdown,
          khataCreditsInPeriod: daily.khataCreditsInPeriod,
          totalOutstandingUdharPaise: 25000,
        },
      ],
    },
    weekly: makePeriod({ periodId: "weekly", label: "Last week" }),
    currentMonth: makePeriod({ periodId: "current_month", label: "This month" }),
    monthly: makePeriod({ periodId: "monthly", label: "Last month" }),
    yearly: makePeriod({ periodId: "yearly", label: "This year" }),
    lowStockProducts: [],
  };
}

describe("PPTX-01", () => {
  it("renders valid pptx bytes from AnalysisSnapshot", async () => {
    const bytes = await renderAnalysisPptx(makeSnapshot());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});

describe("EMPTY snapshot edge", () => {
  it("handles zero payment breakdown", async () => {
    const snapshot = makeSnapshot();
    snapshot.daily.paymentBreakdown = { ...EMPTY_PAYMENT_BREAKDOWN };
    snapshot.daily.topItems = [];
    const bytes = await renderAnalysisPptx(snapshot);
    expect(bytes[0]).toBe(0x50);
  });
});
