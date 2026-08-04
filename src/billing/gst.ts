import type { DraftLine, DraftTotals, LineTaxBreakdown } from "./types.js";

export function roundPaise(amountPaise: number): number {
  return Math.round(amountPaise);
}

export function computeLineTax(
  quantity: number,
  sellPricePaise: number,
  gstRate: number,
): LineTaxBreakdown {
  const taxablePaise = roundPaise(quantity * sellPricePaise);
  const gstPaise = roundPaise((taxablePaise * gstRate) / 100);
  const cgstPaise = roundPaise(gstPaise / 2);
  const sgstPaise = roundPaise(gstPaise / 2);
  const lineTotalPaise = taxablePaise + cgstPaise + sgstPaise;
  return { taxablePaise, cgstPaise, sgstPaise, lineTotalPaise };
}

export function computeDraftTotals(lines: DraftLine[]): DraftTotals {
  let subtotalPaise = 0;
  let cgstTotalPaise = 0;
  let sgstTotalPaise = 0;

  for (const line of lines) {
    const tax = computeLineTax(
      line.quantity,
      line.sellPricePaise,
      line.gstRate,
    );
    subtotalPaise += tax.taxablePaise;
    cgstTotalPaise += tax.cgstPaise;
    sgstTotalPaise += tax.sgstPaise;
  }

  return {
    subtotalPaise,
    cgstTotalPaise,
    sgstTotalPaise,
    grandTotalPaise: subtotalPaise + cgstTotalPaise + sgstTotalPaise,
  };
}

export function formatPaiseAsRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function isBelowCost(line: DraftLine): boolean {
  return line.costPricePaise > line.sellPricePaise;
}
