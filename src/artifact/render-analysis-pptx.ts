import PptxGenJS from "pptxgenjs";
import { formatPaiseAsRupees } from "../billing/gst.js";
import type { AnalysisSnapshot, DayRowMetrics, PeriodMetrics } from "../analytics/types.js";
import { ArtifactRenderError } from "./errors.js";

const ACCENT = "3949AB";
const MUTED = "64748B";

type TableRow = PptxGenJS.TableRow;

function tableRow(...cells: string[]): TableRow {
  return cells.map((text) => ({ text }));
}

function tableHeaderRow(...cells: string[]): TableRow {
  return cells.map((text) => ({
    text,
    options: { bold: true, color: ACCENT },
  }));
}

function addTitleSlide(pptx: PptxGenJS, snapshot: AnalysisSnapshot): void {
  const slide = pptx.addSlide();
  slide.background = { color: "1A237E" };
  slide.addText(snapshot.shopName, {
    x: 0.6,
    y: 1.4,
    w: 8.8,
    h: 1,
    fontSize: 32,
    bold: true,
    color: "FFFFFF",
  });
  slide.addText("Sales Analysis", {
    x: 0.6,
    y: 2.4,
    w: 8.8,
    h: 0.6,
    fontSize: 18,
    color: "E8EAF6",
  });
  slide.addText(`Generated ${snapshot.generatedAtIso}`, {
    x: 0.6,
    y: 3.2,
    w: 8.8,
    h: 0.5,
    fontSize: 12,
    color: "C5CAE9",
  });
}

function addKpiSlide(
  pptx: PptxGenJS,
  title: string,
  period: PeriodMetrics,
): void {
  const slide = pptx.addSlide();
  slide.addText(title, {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: ACCENT,
  });
  slide.addText(period.label, {
    x: 0.5,
    y: 0.85,
    w: 9,
    h: 0.35,
    fontSize: 11,
    color: MUTED,
  });

  const kpis = [
    ["Sales", formatPaiseAsRupees(period.totalSalesPaise)],
    ["Bills", String(period.billCount)],
    ["GST collected", formatPaiseAsRupees(period.gstCollectedPaise)],
    [
      "Outstanding udhar",
      formatPaiseAsRupees(period.totalOutstandingUdharPaise),
    ],
  ];

  slide.addTable(
    [
      tableHeaderRow("Metric", "Value"),
      ...kpis.map(([label, value]) => tableRow(label, value)),
    ],
    { x: 0.5, y: 1.4, w: 4.2, colW: [2.2, 2], fontSize: 12 },
  );

  const top = period.topItems[0];
  if (top) {
    slide.addText(
      `${top.productName} led sales at ${formatPaiseAsRupees(top.revenuePaise)}.`,
      {
        x: 0.5,
        y: 4.2,
        w: 9,
        h: 0.5,
        fontSize: 12,
        italic: true,
        color: MUTED,
      },
    );
  }
}

function addPaymentChartSlide(pptx: PptxGenJS, period: PeriodMetrics): void {
  const slide = pptx.addSlide();
  slide.addText("Payment mix (today)", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: ACCENT,
  });

  const { cash, upi, khata } = period.paymentBreakdown;
  const total = cash.paise + upi.paise + khata.paise;

  if (total > 0) {
    slide.addChart(
      pptx.ChartType.pie,
      [
        {
          name: "Payments",
          labels: ["Cash", "UPI", "Khata"],
          values: [cash.paise / 100, upi.paise / 100, khata.paise / 100],
        },
      ],
      { x: 0.5, y: 1.2, w: 5, h: 4, showPercent: true },
    );
  } else {
    slide.addText("No payment data for this period.", {
      x: 0.5,
      y: 2,
      w: 9,
      fontSize: 14,
      color: MUTED,
    });
  }

  slide.addTable(
    [
      tableHeaderRow("Mode", "Bills", "Amount"),
      tableRow("Cash", String(cash.count), formatPaiseAsRupees(cash.paise)),
      tableRow("UPI", String(upi.count), formatPaiseAsRupees(upi.paise)),
      tableRow("Khata", String(khata.count), formatPaiseAsRupees(khata.paise)),
    ],
    { x: 5.8, y: 1.4, w: 3.8, fontSize: 11 },
  );
}

function addTopItemsSlide(pptx: PptxGenJS, period: PeriodMetrics): void {
  const slide = pptx.addSlide();
  slide.addText("Top items (today)", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: ACCENT,
  });

  if (period.topItems.length === 0) {
    slide.addText("No line items in this period.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: MUTED,
    });
    return;
  }

  const rows: TableRow[] = [
    tableHeaderRow("Product", "Qty", "Revenue"),
    ...period.topItems.slice(0, 8).map((item) =>
      tableRow(
        item.productName,
        String(item.quantity),
        formatPaiseAsRupees(item.revenuePaise),
      ),
    ),
  ];

  slide.addTable(rows, { x: 0.5, y: 1.2, w: 9, fontSize: 11 });

  if (period.topItems.length > 0) {
    slide.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Revenue",
          labels: period.topItems.slice(0, 5).map((i) => i.productName),
          values: period.topItems
            .slice(0, 5)
            .map((i) => i.revenuePaise / 100),
        },
      ],
      { x: 0.5, y: 3.8, w: 9, h: 2.8, barDir: "bar" },
    );
  }
}

function addWeekSlide(pptx: PptxGenJS, snapshot: AnalysisSnapshot): void {
  const slide = pptx.addSlide();
  const period = snapshot.currentWeek;
  slide.addText("Current week", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: ACCENT,
  });

  if (period.days.length > 0) {
    slide.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Daily sales",
          labels: period.days.map((d: DayRowMetrics) => d.dateIso.slice(5)),
          values: period.days.map((d) => d.totalSalesPaise / 100),
        },
      ],
      { x: 0.5, y: 1.1, w: 9, h: 3.2 },
    );
  }

  slide.addText(
    `Week sales: ${formatPaiseAsRupees(period.totalSalesPaise)} · Bills: ${period.billCount} · GST: ${formatPaiseAsRupees(period.gstCollectedPaise)}`,
    { x: 0.5, y: 4.6, w: 9, fontSize: 12, color: MUTED },
  );
}

function addPeriodSummarySlide(
  pptx: PptxGenJS,
  title: string,
  period: PeriodMetrics,
): void {
  const slide = pptx.addSlide();
  slide.addText(title, {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: ACCENT,
  });
  slide.addTable(
    [
      tableRow("Sales", formatPaiseAsRupees(period.totalSalesPaise)),
      tableRow("Bills", String(period.billCount)),
      tableRow("GST", formatPaiseAsRupees(period.gstCollectedPaise)),
      tableRow(
        "Khata credits (sale / manual)",
        `${formatPaiseAsRupees(period.khataCreditsInPeriod.creditSalePaise)} / ${formatPaiseAsRupees(period.khataCreditsInPeriod.manualCreditPaise)}`,
      ),
    ],
    { x: 0.5, y: 1.2, w: 5, fontSize: 12 },
  );
}

function addStockSlide(pptx: PptxGenJS, snapshot: AnalysisSnapshot): void {
  const slide = pptx.addSlide();
  slide.addText("Stock health", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: ACCENT,
  });

  if (snapshot.lowStockProducts.length === 0) {
    slide.addText("No low-stock SKUs right now.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: MUTED,
    });
    return;
  }

  slide.addTable(
    [
      tableHeaderRow("Product", "SKU", "On hand", "Reorder"),
      ...snapshot.lowStockProducts.map((p) =>
        tableRow(
          p.productName,
          p.sku,
          String(p.quantityOnHand),
          String(p.reorderLevel),
        ),
      ),
    ],
    { x: 0.5, y: 1.2, w: 9, fontSize: 11 },
  );
}

function addKhataSlide(pptx: PptxGenJS, snapshot: AnalysisSnapshot): void {
  const slide = pptx.addSlide();
  slide.addText("Khata summary", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: ACCENT,
  });
  slide.addText(
    `Total outstanding udhar: ${formatPaiseAsRupees(snapshot.daily.totalOutstandingUdharPaise)}`,
    { x: 0.5, y: 1.3, w: 9, fontSize: 16, bold: true },
  );
  slide.addText(
    "Period khata credits are detailed in each period section of this deck.",
    { x: 0.5, y: 2.1, w: 9, fontSize: 12, color: MUTED },
  );
}

export async function renderAnalysisPptx(
  snapshot: AnalysisSnapshot,
): Promise<Uint8Array> {
  try {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_16x9";
    pptx.author = snapshot.shopName;

    addTitleSlide(pptx, snapshot);
    addKpiSlide(pptx, "Today at a glance", snapshot.daily);
    addPaymentChartSlide(pptx, snapshot.daily);
    addTopItemsSlide(pptx, snapshot.daily);
    addWeekSlide(pptx, snapshot);
    addPeriodSummarySlide(pptx, "Last complete week", snapshot.weekly);
    addPeriodSummarySlide(
      pptx,
      "Month & year",
      snapshot.currentMonth,
    );
    addPeriodSummarySlide(pptx, "Year to date", snapshot.yearly);
    addStockSlide(pptx, snapshot);
    addKhataSlide(pptx, snapshot);

    const output = await pptx.write({ outputType: "arraybuffer" });
    const bytes = new Uint8Array(output as ArrayBuffer);
    if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new ArtifactRenderError(
        "pptx_render_failed",
        "PptxGenJS output is not a valid PPTX zip",
      );
    }
    return bytes;
  } catch (error) {
    if (error instanceof ArtifactRenderError) {
      throw error;
    }
    throw new ArtifactRenderError(
      "pptx_render_failed",
      error instanceof Error ? error.message : "Unknown PPTX render error",
    );
  }
}
