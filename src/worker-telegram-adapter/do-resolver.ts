import type { Env } from "../env.js";
import type { ApplicationRequest, ExecutionResult } from "./contracts/index.js";

export interface StoreDurableObjectRpc {
  handleApplicationRequest(request: ApplicationRequest): Promise<ExecutionResult>;
  confirmTelegramDelivery(updateId: number): Promise<void>;
}

export interface ResolvedStore {
  stub: StoreDurableObjectRpc;
  durableObjectId: string;
}

export function resolveStoreDurableObject(
  env: Env,
  storeId: string,
): ResolvedStore {
  const id = env.STORE_DO.idFromName(storeId);
  const stub = env.STORE_DO.get(id) as unknown as StoreDurableObjectRpc;
  return {
    stub,
    durableObjectId: id.toString(),
  };
}
