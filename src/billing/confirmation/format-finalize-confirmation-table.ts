import type { DraftLine } from "../types.js";
import { computeLineTax, formatPaiseAsRupees, isBelowCost } from "../gst.js";

export interface FinalizeConfirmationInput {
  customerName: string;
  notes?: string;
  paymentMethod: string;
  paymentReference?: string;
  lines: DraftLine[];
  subtotalPaise: number;
  cgstTotalPaise: number;
  sgstTotalPaise: number;
  grandTotalPaise: number;
}

export function formatFinalizeConfirmationTable(
  input: FinalizeConfirmationInput,
): string {
  const rows: string[] = [
    "Finalize bill?",
    "",
    "| # | Product | Qty | Rate | Taxable | CGST | SGST | Total |",
    "|---|---------|-----|------|---------|------|------|-------|",
  ];

  input.lines.forEach((line, index) => {
    const tax = computeLineTax(
      line.quantity,
      line.sellPricePaise,
      line.gstRate,
    );
    rows.push(
      `| ${index + 1} | ${line.productName} | ${line.quantity} ${line.unit} | ${formatPaiseAsRupees(line.sellPricePaise)} | ${formatPaiseAsRupees(tax.taxablePaise)} | ${formatPaiseAsRupees(tax.cgstPaise)} | ${formatPaiseAsRupees(tax.sgstPaise)} | ${formatPaiseAsRupees(tax.lineTotalPaise)} |`,
    );
    if (isBelowCost(line)) {
      rows.push(
        `| | **SELLING BELOW COST — cost ${formatPaiseAsRupees(line.costPricePaise)}, sell ${formatPaiseAsRupees(line.sellPricePaise)}** | | | | | | |`,
      );
    }
  });

  rows.push(
    "",
    `Customer: ${input.customerName}`,
    `Payment: ${input.paymentMethod}${input.paymentReference ? ` (${input.paymentReference})` : ""}`,
  );
  if (input.notes) {
    rows.push(`Notes: ${input.notes}`);
  }
  rows.push(
    `Subtotal: ${formatPaiseAsRupees(input.subtotalPaise)}`,
    `CGST: ${formatPaiseAsRupees(input.cgstTotalPaise)}`,
    `SGST: ${formatPaiseAsRupees(input.sgstTotalPaise)}`,
    `Grand total: ${formatPaiseAsRupees(input.grandTotalPaise)}`,
    "",
    "Confirm?",
  );

  return rows.join("\n");
}
