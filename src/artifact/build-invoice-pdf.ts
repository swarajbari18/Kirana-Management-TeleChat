import { renderInvoiceHtml } from "../billing/artifact/render-invoice-html.js";
import type { ShopProfileSnapshot } from "../store-durable-object/persistence/repositories/shop-profile-repository.js";
import type {
  FinalizedBillLineRow,
  FinalizedBillRow,
} from "../store-durable-object/persistence/repositories/billing-repository.js";
import type { ArtifactServices } from "./types.js";

export interface InvoicePdfInput {
  shop: ShopProfileSnapshot;
  bill: FinalizedBillRow;
  lines: FinalizedBillLineRow[];
}

export async function buildInvoicePdf(
  artifacts: ArtifactServices,
  input: InvoicePdfInput,
): Promise<Uint8Array> {
  const html = renderInvoiceHtml(input);
  return artifacts.htmlToPdf(html);
}
