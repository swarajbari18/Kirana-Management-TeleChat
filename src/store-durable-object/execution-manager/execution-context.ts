import type { ApplicationRequest } from "../../worker-telegram-adapter/contracts/index.js";

export interface ExecutionContext {
  correlationId: string;
  storeId: string;
  updateId: number;
  startTime: number;
}

export function createExecutionContext(
  request: ApplicationRequest,
): ExecutionContext {
  return {
    correlationId: crypto.randomUUID(),
    storeId: request.storeId,
    updateId: request.transport.updateId,
    startTime: Date.now(),
  };
}
