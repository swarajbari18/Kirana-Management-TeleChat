import { describe, expect, it, vi } from "vitest";
import { queryBill } from "./query-bill.js";
import { createStubArtifactServices } from "../../artifact/create-artifact-services.js";
import { MINIMAL_PDF_BYTES } from "../../artifact/minimal-pdf-bytes.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";

vi.mock(
  "../../store-durable-object/persistence/repositories/billing-repository.js",
  () => ({
    buildOpenDraftSummaries: vi.fn(),
    getFinalizedBill: vi.fn(),
    listFinalizedBillLines: vi.fn(),
    listRecentFinalizedBills: vi.fn(),
  }),
);

vi.mock(
  "../../store-durable-object/persistence/repositories/shop-profile-repository.js",
  () => ({
    getShopProfile: vi.fn(),
  }),
);

import {
  getFinalizedBill,
  listFinalizedBillLines,
} from "../../store-durable-object/persistence/repositories/billing-repository.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";

const mockedGetBill = vi.mocked(getFinalizedBill);
const mockedListLines = vi.mocked(listFinalizedBillLines);
const mockedGetProfile = vi.mocked(getShopProfile);

function runtimePorts(): RuntimePorts {
  return {
    deliverConfirmation: vi.fn(),
    deliverOutbound: vi.fn(),
    waitForConfirmation: vi.fn(),
    artifacts: createStubArtifactServices(),
  };
}

describe("BILL-QUERY-PDF", () => {
  it("render_invoice_pdf returns PDF attachment", async () => {
    mockedGetProfile.mockResolvedValue({
      shopName: "Shop",
      ownerName: null,
      gstRegistered: true,
      gstin: "29ABCDE1234F1Z5",
      instructions: [],
      confirmationTimeoutMs: 60_000,
      completeAutonomy: false,
      artifactsEnabled: true,
      defaultPaymentMethod: null,
    });
    mockedGetBill.mockResolvedValue({
      billId: "bill-abcdef12",
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
    });
    mockedListLines.mockResolvedValue([
      {
        id: "l1",
        billId: "bill-abcdef12",
        lineNo: 1,
        sku: "maggi",
        productName: "Maggi",
        quantity: 1,
        unit: "pkt",
        sellPricePaise: 10000,
        hsnCode: "1902",
        gstRate: 18,
        taxablePaise: 8475,
        cgstPaise: 763,
        sgstPaise: 763,
        lineTotalPaise: 10000,
      },
    ]);

    const result = await queryBill({} as never, runtimePorts(), {
      operation: "render_invoice_pdf",
      bill_id: "bill-abcdef12",
    });

    expect(result.attachments?.[0]?.mimeType).toBe("application/pdf");
    expect(result.verifiedFacts.invoice_attached).toBe(true);
    expect(result.attachments?.[0]?.bytes).toEqual(MINIMAL_PDF_BYTES);
  });
});
