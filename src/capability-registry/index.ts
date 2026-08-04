import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type { VerifiedFactRecord } from "../global-orchestrator/verified-facts/types.js";
import type { CapabilityResult } from "./types.js";
import {
  executeUserProfile,
  USER_PROFILE_TOOL_SURFACE,
} from "../user-profile/index.js";
import { unavailableStub } from "./unavailable-stub.js";

export interface BusinessObjective {
  objectiveId: string;
  description: string;
}

export type CapabilityHandler = (
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: RunContext,
  parentEventId?: string,
) => Promise<CapabilityResult>;

export type FaithfulnessBuilder = (
  objectiveId: string,
  capabilityId: string,
  toolName: string,
  verifiedFacts: Record<string, unknown>,
) => VerifiedFactRecord[];

export type CapabilityKind = "system" | "business";

interface RegistryEntry {
  id: string;
  kind: CapabilityKind;
  description: string;
  handler: CapabilityHandler;
  implemented: boolean;
  faithfulnessBuilder?: FaithfulnessBuilder;
  toolSurface?: string[];
}

const LOCKED_DESCRIPTIONS: Record<string, string> = {
  user_profile:
    "Use when the owner talks about their shop name, owner name, GSTIN, tax registration, or how the bot should reply (language, tone, instructions). Do not use for product stock, sales bills, customer credit, or business reports.",
  inventory:
    "Use when the owner mentions receiving stock, adding a product/SKU, checking how much of something is left, or low stock. Do not use for creating bills, customer balances, shop GST setup, or sales summaries.",
  billing:
    "Use when the owner wants to make, edit, or finalize a bill/invoice for a sale — line items, totals, GST breakdown, payment type. Do not use for stock receipt without billing, credit ledger entries alone, or shop profile changes.",
  khata:
    "Use when the owner records credit (udhar), takes a payment, or asks a customer's outstanding balance. Do not use for inventory quantities, bill creation, or shop configuration.",
  analytics:
    "Use when the owner asks for today's sales, closing the day, weekly analysis, top-selling items, or GST collected — read-only summaries. Do not use for any write operation (stock, bills, credit, profile).",
};

async function importUserProfileFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  const { buildUserProfileFactRecords } = await import(
    "../global-orchestrator/verified-facts/user-profile-fact-registry.js"
  );
  return (objectiveId, capabilityId, toolName, verifiedFacts) =>
    buildUserProfileFactRecords(
      objectiveId,
      capabilityId,
      toolName,
      verifiedFacts,
    );
}

let userProfileFaithfulnessBuilder: FaithfulnessBuilder | undefined;

async function ensureUserProfileFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  if (!userProfileFaithfulnessBuilder) {
    userProfileFaithfulnessBuilder = await importUserProfileFaithfulnessBuilder();
  }
  return userProfileFaithfulnessBuilder;
}

const registry: Record<string, RegistryEntry> = {
  user_profile: {
    id: "user_profile",
    kind: "system",
    description: LOCKED_DESCRIPTIONS.user_profile,
    handler: executeUserProfile,
    implemented: true,
    toolSurface: USER_PROFILE_TOOL_SURFACE,
  },
  inventory: {
    id: "inventory",
    kind: "business",
    description: LOCKED_DESCRIPTIONS.inventory,
    handler: async (objective) => unavailableStub("inventory", objective),
    implemented: false,
    toolSurface: [],
  },
  billing: {
    id: "billing",
    kind: "business",
    description: LOCKED_DESCRIPTIONS.billing,
    handler: async (objective) => unavailableStub("billing", objective),
    implemented: false,
    toolSurface: [],
  },
  khata: {
    id: "khata",
    kind: "business",
    description: LOCKED_DESCRIPTIONS.khata,
    handler: async (objective) => unavailableStub("khata", objective),
    implemented: false,
    toolSurface: [],
  },
  analytics: {
    id: "analytics",
    kind: "business",
    description: LOCKED_DESCRIPTIONS.analytics,
    handler: async (objective) => unavailableStub("analytics", objective),
    implemented: false,
    toolSurface: [],
  },
};

export function getRegisteredCapabilityIds(): string[] {
  return Object.keys(registry);
}

export function getCapabilityDescriptionsForPlanning(): string {
  return getRegisteredCapabilityIds()
    .map((id) => {
      const entry = registry[id]!;
      return `- ${id} (${entry.kind}): ${entry.description}`;
    })
    .join("\n\n");
}

/** @deprecated Use getCapabilityDescriptionsForPlanning */
export function getCapabilityDescriptions(): string {
  return getCapabilityDescriptionsForPlanning();
}

export function getCapabilityContextForDecision(): string {
  const lines = getRegisteredCapabilityIds().map((id) => {
    const entry = registry[id]!;
    return `${id} (${entry.kind}): ${entry.description.split(".")[0]}.`;
  });
  lines.push(
    `user_profile tools: ${USER_PROFILE_TOOL_SURFACE.join(", ")}`,
  );
  return lines.join("\n");
}

export function getFaithfulnessBuilder(
  capabilityId: string,
): FaithfulnessBuilder | undefined {
  const entry = registry[capabilityId];
  if (!entry?.faithfulnessBuilder) {
    return undefined;
  }
  return entry.faithfulnessBuilder;
}

export async function resolveFaithfulnessBuilder(
  capabilityId: string,
): Promise<FaithfulnessBuilder | undefined> {
  if (capabilityId === "user_profile") {
    return ensureUserProfileFaithfulnessBuilder();
  }
  return getFaithfulnessBuilder(capabilityId);
}

export async function invokeCapability(
  capabilityId: string,
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: RunContext,
  parentEventId?: string,
) {
  const entry = registry[capabilityId];
  if (!entry) {
    return {
      status: "error" as const,
      diagnostics: `Unknown capability: ${capabilityId}`,
    };
  }
  return entry.handler(
    objective,
    ctx,
    runtimePorts,
    db,
    runContext,
    parentEventId,
  );
}

export function getRegistryEntry(capabilityId: string): RegistryEntry | undefined {
  return registry[capabilityId];
}
