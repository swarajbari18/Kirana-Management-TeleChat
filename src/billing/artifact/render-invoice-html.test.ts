import { describe, expect, it } from "vitest";
import { renderInvoiceHtml } from "./render-invoice-html.js";

describe("INV-HTML-01", () => {
  it("renders premium GST invoice with escaped dynamic fields", () => {
    const html = renderInvoiceHtml({
      shop: {
        shopName: "Kirana &amp; Co",
        gstRegistered: true,
        gstin: "29ABCDE1234F1Z5",
        artifactsEnabled: true,
        completeAutonomy: false,
        confirmationTimeoutMs: 60_000,
        defaultPaymentMethod: null,
        ownerName: null,
        instructions: [],
      },
      bill: {
        billId: "bill-abcdef12-0000",
        customerName: "Ramesh <test>",
        notes: "Loose pack",
        paymentMethod: "cash",
        paymentReference: null,
        subtotalPaise: 10000,
        cgstTotalPaise: 900,
        sgstTotalPaise: 900,
        grandTotalPaise: 11800,
        finalizedAt: "2026-08-11T10:00:00.000Z",
        updateId: 1,
        correlationId: "c1",
      },
      lines: [
        {
          id: "line-1",
          billId: "bill-abcdef12-0000",
          lineNo: 1,
          sku: "maggi",
          productName: "Maggi & Noodles",
          quantity: 2,
          unit: "pkt",
          sellPricePaise: 5000,
          hsnCode: "1902",
          gstRate: 18,
          taxablePaise: 8475,
          cgstPaise: 763,
          sgstPaise: 763,
          lineTotalPaise: 10000,
        },
      ],
    });

    expect(html).toContain("TAX INVOICE");
    expect(html).toContain("Kirana &amp;amp; Co");
    expect(html).toContain("29ABCDE1234F1Z5");
    expect(html).toContain("Maggi &amp; Noodles");
    expect(html).toContain("Ramesh &lt;test&gt;");
    expect(html).toContain("₹118.00");
    expect(html).toContain("@page");
    expect(html).not.toContain("<script");
  });
});
