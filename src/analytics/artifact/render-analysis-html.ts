import { formatPaiseAsRupees } from "../../billing/gst.js";
import type { AnalysisSnapshot, DayRowMetrics, PeriodMetrics } from "../types.js";
import {
  paymentSlicesFromBreakdown,
  renderHorizontalBarChart,
  renderMiniBarChart,
  renderPieChart,
} from "./chart-helpers.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPaymentTable(breakdown: PeriodMetrics["paymentBreakdown"]): string {
  return `<table class="metric-table">
    <tr><th>Mode</th><th>Bills</th><th>Amount</th></tr>
    <tr><td>Cash</td><td>${breakdown.cash.count}</td><td>${formatPaiseAsRupees(breakdown.cash.paise)}</td></tr>
    <tr><td>UPI</td><td>${breakdown.upi.count}</td><td>${formatPaiseAsRupees(breakdown.upi.paise)}</td></tr>
    <tr><td>Khata</td><td>${breakdown.khata.count}</td><td>${formatPaiseAsRupees(breakdown.khata.paise)}</td></tr>
  </table>`;
}

function renderTopItemsTable(period: PeriodMetrics): string {
  if (period.topItems.length === 0) {
    return `<p class="muted">No line items in this period.</p>`;
  }
  const rows = period.topItems
    .map(
      (item) =>
        `<tr>
          <td>${escapeHtml(item.productName)}</td>
          <td>${item.quantity}</td>
          <td>${formatPaiseAsRupees(item.revenuePaise)}</td>
        </tr>`,
    )
    .join("");
  return `<table class="metric-table">
    <tr><th>Product</th><th>Qty</th><th>Revenue</th></tr>
    ${rows}
  </table>`;
}

function renderPeriodSection(
  period: PeriodMetrics,
  options?: { includeDayChart?: boolean; dayRows?: DayRowMetrics[] },
): string {
  const pie = renderPieChart(
    paymentSlicesFromBreakdown(period.paymentBreakdown),
    160,
    "Payment split",
  );
  const topBars = renderHorizontalBarChart(
    period.topItems.map((item) => ({
      label: item.productName,
      value: item.revenuePaise,
    })),
    320,
    "Top items by revenue",
    escapeHtml,
  );
  const dayChart =
    options?.includeDayChart && options.dayRows
      ? renderMiniBarChart(
          options.dayRows.map((day) => ({
            label: day.dateIso.slice(5),
            value: day.totalSalesPaise,
          })),
          320,
          120,
          "Daily sales",
        )
      : "";

  const topCallout =
    period.topItems[0] != null
      ? `<p class="callout">${escapeHtml(period.topItems[0].productName)} led sales at ${formatPaiseAsRupees(period.topItems[0].revenuePaise)}.</p>`
      : "";

  return `<section class="period-section">
    <h2>${escapeHtml(period.label)}</h2>
    <p class="range">${escapeHtml(period.rangeStartIso)} → ${escapeHtml(period.rangeEndIso)}</p>
    <div class="kpi-grid">
      <div class="kpi"><span class="kpi-label">Sales</span><span class="kpi-value">${formatPaiseAsRupees(period.totalSalesPaise)}</span></div>
      <div class="kpi"><span class="kpi-label">Bills</span><span class="kpi-value">${period.billCount}</span></div>
      <div class="kpi"><span class="kpi-label">GST</span><span class="kpi-value">${formatPaiseAsRupees(period.gstCollectedPaise)}</span></div>
      <div class="kpi"><span class="kpi-label">Outstanding udhar (as of report)</span><span class="kpi-value">${formatPaiseAsRupees(period.totalOutstandingUdharPaise)}</span></div>
    </div>
    ${topCallout}
    <div class="charts-row">
      ${pie}
      ${topBars}
      ${dayChart}
    </div>
    ${renderPaymentTable(period.paymentBreakdown)}
    <h3>Top items</h3>
    ${renderTopItemsTable(period)}
    <p class="muted">Khata credits in period — credit sale: ${formatPaiseAsRupees(period.khataCreditsInPeriod.creditSalePaise)}; manual: ${formatPaiseAsRupees(period.khataCreditsInPeriod.manualCreditPaise)}</p>
  </section>`;
}

function renderCurrentWeekDays(days: DayRowMetrics[]): string {
  const rows = days
    .map(
      (day) =>
        `<tr>
          <td>${escapeHtml(day.dateIso)}</td>
          <td>${day.billCount}</td>
          <td>${formatPaiseAsRupees(day.totalSalesPaise)}</td>
          <td>${formatPaiseAsRupees(day.gstCollectedPaise)}</td>
        </tr>`,
    )
    .join("");
  return `<table class="metric-table">
    <tr><th>Date</th><th>Bills</th><th>Sales</th><th>GST</th></tr>
    ${rows}
  </table>`;
}

function renderCurrentWeekSection(snapshot: AnalysisSnapshot): string {
  const period = snapshot.currentWeek;
  const pie = renderPieChart(
    paymentSlicesFromBreakdown(period.paymentBreakdown),
    160,
    "Payment split",
  );
  const topBars = renderHorizontalBarChart(
    period.topItems.map((item) => ({
      label: item.productName,
      value: item.revenuePaise,
    })),
    320,
    "Top items by revenue",
    escapeHtml,
  );
  const dayChart = renderMiniBarChart(
    period.days.map((day) => ({
      label: day.dateIso.slice(5),
      value: day.totalSalesPaise,
    })),
    320,
    120,
    "Daily sales",
  );

  return `<section class="period-section">
    <h2>${escapeHtml(period.label)}</h2>
    <p class="range">${escapeHtml(period.rangeStartIso)} → ${escapeHtml(period.rangeEndIso)}</p>
    <h3>Daily breakdown</h3>
    ${renderCurrentWeekDays(period.days)}
    <div class="kpi-grid">
      <div class="kpi"><span class="kpi-label">Week sales</span><span class="kpi-value">${formatPaiseAsRupees(period.totalSalesPaise)}</span></div>
      <div class="kpi"><span class="kpi-label">Bills</span><span class="kpi-value">${period.billCount}</span></div>
      <div class="kpi"><span class="kpi-label">GST</span><span class="kpi-value">${formatPaiseAsRupees(period.gstCollectedPaise)}</span></div>
    </div>
    <div class="charts-row">${pie}${topBars}${dayChart}</div>
    ${renderPaymentTable(period.paymentBreakdown)}
    <h3>Top items</h3>
    ${renderTopItemsTable(period)}
  </section>`;
}

function renderLowStock(snapshot: AnalysisSnapshot): string {
  if (snapshot.lowStockProducts.length === 0) {
    return `<section><h2>Stock health</h2><p class="muted">No low-stock SKUs right now.</p></section>`;
  }
  const rows = snapshot.lowStockProducts
    .map(
      (product) =>
        `<tr>
          <td>${escapeHtml(product.productName)}</td>
          <td>${escapeHtml(product.sku)}</td>
          <td>${product.quantityOnHand}</td>
          <td>${product.reorderLevel}</td>
        </tr>`,
    )
    .join("");
  return `<section>
    <h2>Stock health</h2>
    <table class="metric-table">
      <tr><th>Product</th><th>SKU</th><th>On hand</th><th>Reorder level</th></tr>
      ${rows}
    </table>
  </section>`;
}

function renderKhataSummary(snapshot: AnalysisSnapshot): string {
  return `<section>
    <h2>Khata summary</h2>
    <p>Total outstanding udhar (as of report time): <strong>${formatPaiseAsRupees(snapshot.daily.totalOutstandingUdharPaise)}</strong></p>
    <p class="muted">Period khata credits are shown inside each period section above.</p>
  </section>`;
}

export function renderAnalysisHtml(snapshot: AnalysisSnapshot): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(snapshot.shopName)} — Shop analysis</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; }
    body { margin: 0; background: #f4f6fb; color: #1f2937; }
    .page { max-width: 960px; margin: 0 auto; padding: 32px 20px 48px; }
    .cover { background: linear-gradient(135deg, #1a237e, #3949ab); color: #fff; border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    .cover h1 { margin: 0 0 8px; font-size: 2rem; }
    .cover p { margin: 0; opacity: 0.9; }
    .period-section, section { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
    h2 { margin-top: 0; }
    h3 { margin-bottom: 8px; }
    .range, .muted { color: #6b7280; font-size: 0.92rem; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 16px 0; }
    .kpi { background: #f8fafc; border-radius: 10px; padding: 12px; }
    .kpi-label { display: block; font-size: 0.82rem; color: #64748b; }
    .kpi-value { font-size: 1.2rem; font-weight: 700; }
    .charts-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; margin: 16px 0; }
    .chart-wrap { min-width: 180px; }
    .chart-title { font-weight: 600; margin-bottom: 8px; }
    .legend { margin-top: 8px; font-size: 0.85rem; }
    .legend-item { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .legend-swatch { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
    .metric-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .metric-table th, .metric-table td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
    .bar-row { display: grid; grid-template-columns: 120px 1fr 72px; gap: 8px; align-items: center; margin-bottom: 8px; }
    .bar-label { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { background: #e5e7eb; border-radius: 999px; height: 10px; overflow: hidden; }
    .bar-fill { background: #3949ab; height: 100%; border-radius: 999px; }
    .bar-value { font-size: 0.82rem; text-align: right; }
    .callout { background: #eef2ff; border-left: 4px solid #3949ab; padding: 10px 12px; border-radius: 8px; }
    .mini-label { font-size: 9px; fill: #64748b; }
    .chart-empty { color: #94a3b8; font-style: italic; }
  </style>
</head>
<body>
  <div class="page">
    <header class="cover">
      <h1>${escapeHtml(snapshot.shopName)}</h1>
      <p>Shop analysis report · Generated ${escapeHtml(snapshot.generatedAtIso)} (IST calendar periods)</p>
    </header>
    ${renderPeriodSection(snapshot.daily)}
    ${renderCurrentWeekSection(snapshot)}
    ${renderPeriodSection(snapshot.weekly)}
    ${renderPeriodSection(snapshot.currentMonth)}
    ${renderPeriodSection(snapshot.monthly, { includeDayChart: false })}
    ${renderPeriodSection(snapshot.yearly)}
    ${renderLowStock(snapshot)}
    ${renderKhataSummary(snapshot)}
  </div>
</body>
</html>`;
}
