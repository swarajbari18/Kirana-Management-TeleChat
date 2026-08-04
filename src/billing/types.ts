import type { PaymentMethod } from "../store-durable-object/persistence/repositories/billing-repository.js";

export type DraftTarget =
  | "implicit_latest"
  | "new"
  | "by_customer"
  | "ambiguous";

export type ManageDraftOperation =
  | "start_bill"
  | "set_customer"
  | "set_notes"
  | "add_item"
  | "remove_item"
  | "change_item_quantity"
  | "set_payment_method"
  | "set_payment_reference"
  | "show_draft"
  | "list_open_drafts"
  | "cancel_draft";

export interface DraftLine {
  lineRef: string;
  lineNo: number;
  sku: string;
  productName: string;
  quantity: number;
  unit: string;
  sellPricePaise: number;
  costPricePaise: number;
  hsnCode: string;
  gstRate: number;
}

export interface DraftProjection {
  billId: string;
  started: boolean;
  customerName?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  lines: DraftLine[];
  lastEventAt?: string;
}

export interface LineTaxBreakdown {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  lineTotalPaise: number;
}

export interface DraftTotals {
  subtotalPaise: number;
  cgstTotalPaise: number;
  sgstTotalPaise: number;
  grandTotalPaise: number;
}

export interface OutboundAttachmentDescriptor {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}
