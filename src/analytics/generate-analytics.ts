import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import { countFinalizedBills } from "../store-durable-object/persistence/repositories/analytics-repository.js";
import type { CapabilityResult } from "../capability-registry/types.js";
import { buildAnalysisSnapshot } from "./build-analysis-snapshot.js";
import { renderAnalysisHtml } from "./artifact/render-analysis-html.js";
import { formatIstFilenameTimestamp } from "./period-boundaries.js";
import type { AnalysisSnapshot } from "./types.js";

function mapDailyVerifiedFacts(snapshot: AnalysisSnapshot): Record<string, unknown> {
  const facts: Record<string, unknown> = {
    today_total_sales_paise: snapshot.daily.totalSalesPaise,
    today_bill_count: snapshot.daily.billCount,
    today_gst_collected_paise: snapshot.daily.gstCollectedPaise,
    total_outstanding_udhar_paise: snapshot.daily.totalOutstandingUdharPaise,
    analysis_attached: true,
  };

  const { cash, upi, khata } = snapshot.daily.paymentBreakdown;
  if (cash.paise > 0) {
    facts.today_payment_cash_paise = cash.paise;
  }
  if (upi.paise > 0) {
    facts.today_payment_upi_paise = upi.paise;
  }
  if (khata.paise > 0) {
    facts.today_payment_khata_paise = khata.paise;
  }

  return facts;
}

export async function generateAnalytics(
  db: StoreDatabase,
): Promise<{ result: CapabilityResult; snapshot: AnalysisSnapshot | null }> {
  const billCount = await countFinalizedBills(db);
  if (billCount === 0) {
    return {
      result: {
        status: "completed",
        verifiedFacts: {},
        refusalMessage: "No sales recorded yet — nothing to analyze.",
      },
      snapshot: null,
    };
  }

  const snapshot = await buildAnalysisSnapshot(db);
  const html = renderAnalysisHtml(snapshot);
  const filename = `shop-analysis-${formatIstFilenameTimestamp(new Date(snapshot.generatedAtIso))}.html`;

  return {
    result: {
      status: "completed",
      verifiedFacts: mapDailyVerifiedFacts(snapshot),
      attachments: [
        {
          filename,
          mimeType: "text/html",
          bytes: new TextEncoder().encode(html),
        },
      ],
    },
    snapshot,
  };
}

export function analyticsTracePayload(
  snapshot: AnalysisSnapshot,
  attachmentFilename: string,
  emptyShop: boolean,
): Record<string, unknown> {
  return {
    generatedAtIso: snapshot.generatedAtIso,
    periodLabels: {
      daily: snapshot.daily.label,
      currentWeek: snapshot.currentWeek.label,
      weekly: snapshot.weekly.label,
      currentMonth: snapshot.currentMonth.label,
      monthly: snapshot.monthly.label,
      yearly: snapshot.yearly.label,
    },
    billCounts: {
      daily: snapshot.daily.billCount,
      currentWeek: snapshot.currentWeek.billCount,
      weekly: snapshot.weekly.billCount,
      currentMonth: snapshot.currentMonth.billCount,
      monthly: snapshot.monthly.billCount,
      yearly: snapshot.yearly.billCount,
    },
    attachmentFilename,
    emptyShop,
  };
}
