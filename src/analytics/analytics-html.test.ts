import { describe, expect, it } from "vitest";
import { renderAnalysisHtml } from "./artifact/render-analysis-html.js";
import {
  paymentSlicesFromBreakdown,
  renderPieChart,
} from "./artifact/chart-helpers.js";
import type { AnalysisSnapshot } from "./types.js";

function sampleSnapshot(): AnalysisSnapshot {
  const period = {
    periodId: "daily",
    label: "Today",
    rangeStartIso: "2026-08-11T00:00:00.000Z",
    rangeEndIso: "2026-08-11T10:00:00.000Z",
    totalSalesPaise: 12000,
    billCount: 2,
    gstCollectedPaise: 600,
    paymentBreakdown: {
      cash: { paise: 7000, count: 1 },
      upi: { paise: 5000, count: 1 },
      khata: { paise: 0, count: 0 },
    },
    khataCreditsInPeriod: { creditSalePaise: 0, manualCreditPaise: 0 },
    topItems: [
      {
        sku: "maggi",
        productName: '<script>alert("x")</script>',
        revenuePaise: 7000,
        quantity: 2,
      },
    ],
    totalOutstandingUdharPaise: 25000,
  };

  return {
    generatedAtIso: "2026-08-11T10:00:00.000Z",
    shopName: "Test Shop",
    daily: period,
    currentWeek: { ...period, periodId: "current_week", days: [] },
    weekly: { ...period, periodId: "weekly" },
    currentMonth: { ...period, periodId: "current_month" },
    monthly: { ...period, periodId: "monthly" },
    yearly: { ...period, periodId: "yearly" },
    lowStockProducts: [],
  };
}

describe("HTML-01", () => {
  it("escapes product names in rendered HTML", () => {
    const html = renderAnalysisHtml(sampleSnapshot());
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain('<script>alert("x")</script>');
  });
});

describe("HTML-02", () => {
  it("includes SVG charts when payment breakdown is non-zero", () => {
    const slices = paymentSlicesFromBreakdown(
      sampleSnapshot().daily.paymentBreakdown,
    );
    const chart = renderPieChart(slices);
    expect(chart).toContain("<svg");
    expect(chart).toContain("<path");
  });
});
