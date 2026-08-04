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
  const shortBillId = bill.billId.slice(0, 8).toUpperCase();
  const lineRows = lines
    .map(
      (line, index) =>
        `<tr class="${index % 2 === 0 ? "even" : "odd"}">
          <td class="col-no">${line.lineNo}</td>
          <td class="col-product">${escapeHtml(line.productName)}</td>
          <td class="col-hsn">${escapeHtml(line.hsnCode)}</td>
          <td class="col-qty">${line.quantity} ${escapeHtml(line.unit)}</td>
          <td class="col-money">${formatPaiseAsRupees(line.sellPricePaise)}</td>
          <td class="col-money">${formatPaiseAsRupees(line.taxablePaise)}</td>
          <td class="col-money">${formatPaiseAsRupees(line.cgstPaise)}</td>
          <td class="col-money">${formatPaiseAsRupees(line.sgstPaise)}</td>
          <td class="col-money col-total">${formatPaiseAsRupees(line.lineTotalPaise)}</td>
        </tr>`,
    )
    .join("\n");

  const gstBlock =
    shop.gstRegistered && shop.gstin
      ? `<div class="gstin">GSTIN: ${escapeHtml(shop.gstin)}</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Tax Invoice ${escapeHtml(shortBillId)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 11pt;
      color: #1f2937;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice { max-width: 180mm; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #3949ab;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .shop-name { font-size: 20pt; font-weight: 700; color: #1a237e; margin: 0 0 4px; }
    .gstin { font-size: 10pt; color: #4b5563; }
    .doc-title {
      text-align: right;
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #3949ab;
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 24px;
      margin-bottom: 16px;
      font-size: 10pt;
    }
    .meta dt { font-weight: 600; color: #6b7280; margin: 0; }
    .meta dd { margin: 0 0 8px; }
    table.lines {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 9.5pt;
    }
    table.lines thead th {
      background: #3949ab;
      color: #fff;
      padding: 8px 6px;
      text-align: left;
      font-weight: 600;
    }
    table.lines tbody td {
      padding: 7px 6px;
      border-bottom: 1px solid #e5e7eb;
    }
    table.lines tbody tr.even { background: #f8fafc; }
    .col-no { width: 28px; }
    .col-hsn { width: 52px; }
    .col-qty { width: 64px; }
    .col-money { text-align: right; white-space: nowrap; }
    .col-total { font-weight: 600; }
    .totals {
      margin-left: auto;
      width: 280px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .totals-row.grand {
      background: #eef2ff;
      font-size: 12pt;
      font-weight: 700;
      color: #1a237e;
      border-bottom: none;
    }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px dashed #d1d5db;
      font-size: 9pt;
      color: #6b7280;
    }
    .notes { margin: 12px 0; padding: 8px 12px; background: #f9fafb; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="invoice">
    <header class="header">
      <div>
        <h1 class="shop-name">${escapeHtml(shop.shopName ?? "Shop")}</h1>
        ${gstBlock}
      </div>
      <div class="doc-title">TAX INVOICE</div>
    </header>

    <dl class="meta">
      <div><dt>Invoice No.</dt><dd>${escapeHtml(shortBillId)}</dd></div>
      <div><dt>Date</dt><dd>${escapeHtml(bill.finalizedAt)}</dd></div>
      <div><dt>Customer</dt><dd>${escapeHtml(bill.customerName)}</dd></div>
      <div><dt>Payment</dt><dd>${escapeHtml(bill.paymentMethod)}${bill.paymentReference ? ` (${escapeHtml(bill.paymentReference)})` : ""}</dd></div>
    </dl>

    ${bill.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(bill.notes)}</div>` : ""}

    <table class="lines">
      <thead>
        <tr>
          <th>#</th>
          <th>Product</th>
          <th>HSN</th>
          <th>Qty</th>
          <th class="col-money">Rate</th>
          <th class="col-money">Taxable</th>
          <th class="col-money">CGST</th>
          <th class="col-money">SGST</th>
          <th class="col-money">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${formatPaiseAsRupees(bill.subtotalPaise)}</span></div>
      <div class="totals-row"><span>CGST</span><span>${formatPaiseAsRupees(bill.cgstTotalPaise)}</span></div>
      <div class="totals-row"><span>SGST</span><span>${formatPaiseAsRupees(bill.sgstTotalPaise)}</span></div>
      <div class="totals-row grand"><span>Grand Total</span><span>${formatPaiseAsRupees(bill.grandTotalPaise)}</span></div>
    </div>

    <footer class="footer">
      Computer-generated GST invoice. Amounts in INR (₹).
    </footer>
  </div>
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
