import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import { executeMyShopProfile } from "../my-shop-profile/index.js";

export interface BusinessObjective {
  objectiveId: string;
  description: string;
}

export type CapabilityHandler = (
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
) => Promise<import("../my-shop-profile/types.js").CapabilityResult>;

const registry: Record<string, CapabilityHandler> = {
  my_shop_profile: executeMyShopProfile,
};

export function getCapabilityDescriptions(): string {
  return `- my_shop_profile: Manage shop identity (name, owner), GST/tax registration, and agent instructions/preferences.`;
}

export async function invokeCapability(
  capabilityId: string,
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
) {
  const handler = registry[capabilityId];
  if (!handler) {
    return {
      status: "error" as const,
      diagnostics: `Unknown capability: ${capabilityId}`,
    };
  }
  return handler(objective, ctx, runtimePorts, db);
}
