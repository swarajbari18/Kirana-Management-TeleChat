export type RuntimeTerminalStatus =
  | "ok"
  | "error"
  | "skipped_duplicate"
  | "replay_cached";

export interface RuntimeLogEntry {
  layer: "runtime";
  correlationId: string;
  updateId: number;
  storeId: string;
  sessionId?: string;
  terminalStatus: RuntimeTerminalStatus;
  ledgerHit: boolean;
  durationMs: number;
  participatingComponents: string[];
  failureReason: string | null;
}

export interface DeliveryConfirmedLogEntry {
  layer: "runtime";
  action: "telegram_delivery_confirmed";
  updateId: number;
  storeId?: string;
}

export function emitRuntimeLog(entry: RuntimeLogEntry): void {
  console.log(JSON.stringify(entry));
}

export function emitDeliveryConfirmedLog(
  entry: DeliveryConfirmedLogEntry,
): void {
  console.log(JSON.stringify(entry));
}
