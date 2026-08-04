import type { DraftProjection } from "../types.js";
import { computeDraftTotals, formatPaiseAsRupees } from "../gst.js";

export function formatCancelDraftConfirmationTable(
  projection: DraftProjection,
): string {
  const totals = computeDraftTotals(projection.lines);
  const lines = [
    "Cancel this draft?",
    "",
    `Customer: ${projection.customerName ?? "—"}`,
    `Lines: ${projection.lines.length}`,
  ];

  for (const line of projection.lines) {
    lines.push(
      `- ${line.productName}: ${line.quantity} ${line.unit} @ ${formatPaiseAsRupees(line.sellPricePaise)}`,
    );
  }

  if (projection.notes) {
    lines.push(`Notes: ${projection.notes}`);
  }
  if (projection.paymentMethod) {
    lines.push(`Payment: ${projection.paymentMethod}`);
  }

  lines.push(
    `Draft total (info): ${formatPaiseAsRupees(totals.grandTotalPaise)}`,
    "",
    "Confirm cancellation?",
  );

  return lines.join("\n");
}
