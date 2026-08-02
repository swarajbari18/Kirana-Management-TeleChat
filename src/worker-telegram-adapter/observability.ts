export type TransportResultStatus =
  | "success"
  | "skipped_delivery"
  | "unsupported"
  | "rejected"
  | "error"
  | "accepted";

export interface TransportLogEntry {
  layer: "transport";
  workerRequestId: string;
  updateId: number;
  messageId?: number;
  chatId: number;
  storeId?: string;
  durableObjectId?: string;
  durationMs: number;
  resultStatus: TransportResultStatus;
  inboundKind?: "text" | "command" | "callback_query";
  errorCode?: string;
}

export function emitTransportLog(entry: TransportLogEntry): void {
  console.log(JSON.stringify(entry));
}
