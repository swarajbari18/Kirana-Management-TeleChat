import type { ShopProfileSnapshot } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import type {
  FinalizedBillLineRow,
  FinalizedBillRow,
} from "../../store-durable-object/persistence/repositories/billing-repository.js";
import { formatPaiseAsRupees } from "../gst.js";

export function renderInvoiceHtml(input: {
  shop: ShopProfileSnapshot;
  bill: FinalizedBillRow;
  lines: FinalizedBillLineRow[];
}): string {
  const { shop, bill, lines } = input;
  const lineRows = lines
    .map(
      (line) =>
        `<tr>
          <td>${line.lineNo}</td>
          <td>${escapeHtml(line.productName)}</td>
          <td>${escapeHtml(line.hsnCode)}</td>
          <td>${line.quantity} ${escapeHtml(line.unit)}</td>
          <td>${formatPaiseAsRupees(line.sellPricePaise)}</td>
          <td>${formatPaiseAsRupees(line.taxablePaise)}</td>
          <td>${formatPaiseAsRupees(line.cgstPaise)}</td>
          <td>${formatPaiseAsRupees(line.sgstPaise)}</td>
          <td>${formatPaiseAsRupees(line.lineTotalPaise)}</td>
        </tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${escapeHtml(bill.billId.slice(0, 8))}</title></head>
<body>
  <h1>${escapeHtml(shop.shopName ?? "Shop")}</h1>
  ${shop.gstRegistered && shop.gstin ? `<p>GSTIN: ${escapeHtml(shop.gstin)}</p>` : ""}
  <p>Bill: ${escapeHtml(bill.billId.slice(0, 8))} | Date: ${escapeHtml(bill.finalizedAt)}</p>
  <p>Customer: ${escapeHtml(bill.customerName)}</p>
  ${bill.notes ? `<p>Notes: ${escapeHtml(bill.notes)}</p>` : ""}
  <table border="1" cellpadding="4" cellspacing="0">
    <thead>
      <tr>
        <th>#</th><th>Product</th><th>HSN</th><th>Qty</th><th>Rate</th>
        <th>Taxable</th><th>CGST</th><th>SGST</th><th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
  </table>
  <p>Subtotal: ${formatPaiseAsRupees(bill.subtotalPaise)}</p>
  <p>CGST: ${formatPaiseAsRupees(bill.cgstTotalPaise)} | SGST: ${formatPaiseAsRupees(bill.sgstTotalPaise)}</p>
  <p><strong>Grand total: ${formatPaiseAsRupees(bill.grandTotalPaise)}</strong></p>
  <p>Payment: ${escapeHtml(bill.paymentMethod)}${bill.paymentReference ? ` (${escapeHtml(bill.paymentReference)})` : ""}</p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
