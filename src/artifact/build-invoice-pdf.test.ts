import { describe, expect, it, vi } from "vitest";
import { htmlToPdf } from "./html-to-pdf.js";
import { buildInvoicePdf } from "./build-invoice-pdf.js";
import { MINIMAL_PDF_BYTES, isPdfBytes } from "./minimal-pdf-bytes.js";
import type { BrowserRunBinding } from "./types.js";

describe("INV-PDF-01", () => {
  it("htmlToPdf returns bytes from browser binding", async () => {
    const html = "<html><body>Invoice</body></html>";
    const browser: BrowserRunBinding = {
      quickAction: vi.fn(async () => new Response(MINIMAL_PDF_BYTES)),
    };

    const bytes = await htmlToPdf(browser, html);
    expect(isPdfBytes(bytes)).toBe(true);
    expect(browser.quickAction).toHaveBeenCalledWith(
      "pdf",
      expect.objectContaining({ html }),
    );
  });

  it("buildInvoicePdf uses artifact service", async () => {
    const artifacts = {
      htmlToPdf: vi.fn(async () => new Uint8Array(MINIMAL_PDF_BYTES)),
    };

    const bytes = await buildInvoicePdf(artifacts, {
      shop: {
        shopName: "Test Shop",
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
        billId: "bill-12345678-abcd",
        customerName: "Ramesh",
        notes: null,
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
          billId: "bill-12345678-abcd",
          lineNo: 1,
          sku: "maggi",
          productName: "Maggi",
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

    expect(isPdfBytes(bytes)).toBe(true);
    expect(artifacts.htmlToPdf).toHaveBeenCalledOnce();
  });
});
