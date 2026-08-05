import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateAnalytics, ANALYSIS_PPTX_MIME } from "./generate-analytics.js";
import { buildAnalysisSnapshot } from "./build-analysis-snapshot.js";
import type { AnalysisSnapshot } from "./types.js";

vi.mock(
  "../store-durable-object/persistence/repositories/analytics-repository.js",
  () => ({
    countFinalizedBills: vi.fn(),
    aggregateBillsInRange: vi.fn(),
    aggregateTopItemsInRange: vi.fn(),
    aggregateKhataCreditsInRange: vi.fn(),
    getTotalOutstandingUdharPaise: vi.fn(),
    listLowStockProducts: vi.fn(),
    aggregateBillsByIstDay: vi.fn(),
  }),
);

vi.mock(
  "../store-durable-object/persistence/repositories/shop-profile-repository.js",
  () => ({
    getShopProfile: vi.fn(async () => ({
      shopName: "Test Shop",
      artifactsEnabled: false,
    })),
  }),
);

import {
  countFinalizedBills,
  aggregateBillsInRange,
  aggregateTopItemsInRange,
  aggregateKhataCreditsInRange,
  getTotalOutstandingUdharPaise,
  listLowStockProducts,
  aggregateBillsByIstDay,
} from "../store-durable-object/persistence/repositories/analytics-repository.js";

const mockedCount = vi.mocked(countFinalizedBills);
const mockedAggregateBills = vi.mocked(aggregateBillsInRange);
const mockedTopItems = vi.mocked(aggregateTopItemsInRange);
const mockedKhataCredits = vi.mocked(aggregateKhataCreditsInRange);
const mockedOutstanding = vi.mocked(getTotalOutstandingUdharPaise);
const mockedLowStock = vi.mocked(listLowStockProducts);
const mockedByDay = vi.mocked(aggregateBillsByIstDay);

const emptyBills = {
  totalSalesPaise: 0,
  billCount: 0,
  gstCollectedPaise: 0,
  paymentBreakdown: {
    cash: { paise: 0, count: 0 },
    upi: { paise: 0, count: 0 },
    khata: { paise: 0, count: 0 },
  },
};

function seedRepoDefaults() {
  mockedAggregateBills.mockResolvedValue({
    totalSalesPaise: 12000,
    billCount: 2,
    gstCollectedPaise: 600,
    paymentBreakdown: {
      cash: { paise: 7000, count: 1 },
      upi: { paise: 5000, count: 1 },
      khata: { paise: 0, count: 0 },
    },
  });
  mockedTopItems.mockResolvedValue([
    {
      sku: "maggi",
      productName: "Maggi",
      revenuePaise: 7000,
      quantity: 2,
    },
  ]);
  mockedKhataCredits.mockResolvedValue({
    creditSalePaise: 1000,
    manualCreditPaise: 500,
  });
  mockedOutstanding.mockResolvedValue(25000);
  mockedLowStock.mockResolvedValue([]);
  mockedByDay.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  seedRepoDefaults();
});

describe("GEN-01", () => {
  it("zero bills returns refusal without attachment", async () => {
    mockedCount.mockResolvedValue(0);
    const { result } = await generateAnalytics({} as never);
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.refusalMessage).toContain("No sales recorded");
      expect(result.attachments).toBeUndefined();
      expect(result.verifiedFacts).toEqual({});
    }
  });
});

describe("GEN-02", () => {
  it("with bills returns attachment and daily verifiedFacts", async () => {
    mockedCount.mockResolvedValue(1);
    const { result, rawAttachments } = await generateAnalytics({} as never);
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(rawAttachments[0]?.mimeType).toBe(ANALYSIS_PPTX_MIME);
      expect(rawAttachments[0]?.bytes.byteLength).toBeGreaterThan(0);
      expect(result.verifiedFacts.today_total_sales_paise).toBe(12000);
      expect(result.verifiedFacts.analysis_attached).toBe(true);
    }
  });
});

describe("GEN-03", () => {
  it("still attaches analytics when artifactsEnabled is false", async () => {
    mockedCount.mockResolvedValue(1);
    const { rawAttachments } = await generateAnalytics({} as never);
    expect(rawAttachments).toHaveLength(1);
  });
});

describe("SNAP-01", () => {
  it("buildAnalysisSnapshot populates all six periods", async () => {
    mockedCount.mockResolvedValue(1);
    const snapshot = await buildAnalysisSnapshot(
      {} as never,
      new Date("2026-08-11T10:00:00.000Z"),
    );
    expect(snapshot.daily.periodId).toBe("daily");
    expect(snapshot.currentWeek.periodId).toBe("current_week");
    expect(snapshot.weekly.periodId).toBe("weekly");
    expect(snapshot.currentMonth.periodId).toBe("current_month");
    expect(snapshot.monthly.periodId).toBe("monthly");
    expect(snapshot.yearly.periodId).toBe("yearly");
    expect(snapshot.currentWeek.days.length).toBeGreaterThan(0);
  });
});

describe("FAITH-01", () => {
  it("fact registry emits daily fields only", async () => {
    const { buildAnalyticsFactRecords } = await import(
      "../global-orchestrator/verified-facts/analytics-fact-registry.js"
    );
    const records = buildAnalyticsFactRecords(
      "obj-1",
      "analytics",
      "generate_analytics",
      {
        today_total_sales_paise: 1000,
        today_bill_count: 1,
        today_gst_collected_paise: 100,
        total_outstanding_udhar_paise: 5000,
        today_payment_cash_paise: 1000,
        analysis_attached: true,
        weekly_total_sales_paise: 99999,
      },
    );
    expect(records.some((r) => r.field === "today_total_sales_paise")).toBe(
      true,
    );
    expect(records.some((r) => r.field === "weekly_total_sales_paise")).toBe(
      false,
    );
  });
});
