export interface OutboundAttachmentDescriptor {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export type KhataManageOperation =
  | "create_customer"
  | "record_manual_credit"
  | "record_payment"
  | "record_credit_from_bill";
