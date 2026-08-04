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
import {
  executeInventory,
  INVENTORY_TOOL_SURFACE,
} from "../inventory/index.js";
import {
  executeBilling,
  BILLING_TOOL_SURFACE,
} from "../billing/index.js";
import {
  executeKhata,
  KHATA_TOOL_SURFACE,
} from "../khata/index.js";
import {
  executeAnalytics,
  ANALYTICS_TOOL_SURFACE,
} from "../analytics/index.js";

export interface BusinessObjective {
  objectiveId: string;
  description: string;
  draftTarget?: "implicit_latest" | "new" | "by_customer" | "ambiguous";
  customerName?: string;
  priorObjectiveResults?: Record<string, Record<string, unknown>>;
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
    "Use when the owner mentions receiving stock, adding a product/SKU, checking how much of something is left, low stock, holding stock aside for a customer (allocate/reserve), or committing stock after a finalized sale (commit_bill_sale). Does not update khata or create bills by itself.",
  billing:
    "Use when the owner wants to make, edit, or finalize a bill/invoice for a sale — line items, totals, GST breakdown, payment type. Billing persists the bill only; it does not update stock or khata (those are separate post-finalize objectives).",
  khata:
    "Use when the owner records credit (udhar), takes a payment, asks a customer's outstanding balance, or records bill credit after a khata sale. Khata owns the credit ledger; billing does not write khata rows.",
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

async function importInventoryFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  const { buildInventoryFactRecords } = await import(
    "../global-orchestrator/verified-facts/inventory-fact-registry.js"
  );
  return (objectiveId, capabilityId, toolName, verifiedFacts) =>
    buildInventoryFactRecords(
      objectiveId,
      capabilityId,
      toolName,
      verifiedFacts,
    );
}

let inventoryFaithfulnessBuilder: FaithfulnessBuilder | undefined;

async function ensureInventoryFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  if (!inventoryFaithfulnessBuilder) {
    inventoryFaithfulnessBuilder = await importInventoryFaithfulnessBuilder();
  }
  return inventoryFaithfulnessBuilder;
}

async function importBillingFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  const { buildBillingFactRecords } = await import(
    "../global-orchestrator/verified-facts/billing-fact-registry.js"
  );
  return (objectiveId, capabilityId, toolName, verifiedFacts) =>
    buildBillingFactRecords(
      objectiveId,
      capabilityId,
      toolName,
      verifiedFacts,
    );
}

let billingFaithfulnessBuilder: FaithfulnessBuilder | undefined;

async function ensureBillingFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  if (!billingFaithfulnessBuilder) {
    billingFaithfulnessBuilder = await importBillingFaithfulnessBuilder();
  }
  return billingFaithfulnessBuilder;
}

async function importKhataFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  const { buildKhataFactRecords } = await import(
    "../global-orchestrator/verified-facts/khata-fact-registry.js"
  );
  return (objectiveId, capabilityId, toolName, verifiedFacts) =>
    buildKhataFactRecords(
      objectiveId,
      capabilityId,
      toolName,
      verifiedFacts,
    );
}

let khataFaithfulnessBuilder: FaithfulnessBuilder | undefined;

async function ensureKhataFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  if (!khataFaithfulnessBuilder) {
    khataFaithfulnessBuilder = await importKhataFaithfulnessBuilder();
  }
  return khataFaithfulnessBuilder;
}

async function importAnalyticsFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  const { buildAnalyticsFactRecords } = await import(
    "../global-orchestrator/verified-facts/analytics-fact-registry.js"
  );
  return (objectiveId, capabilityId, toolName, verifiedFacts) =>
    buildAnalyticsFactRecords(
      objectiveId,
      capabilityId,
      toolName,
      verifiedFacts,
    );
}

let analyticsFaithfulnessBuilder: FaithfulnessBuilder | undefined;

async function ensureAnalyticsFaithfulnessBuilder(): Promise<FaithfulnessBuilder> {
  if (!analyticsFaithfulnessBuilder) {
    analyticsFaithfulnessBuilder = await importAnalyticsFaithfulnessBuilder();
  }
  return analyticsFaithfulnessBuilder;
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
    handler: executeInventory,
    implemented: true,
    toolSurface: INVENTORY_TOOL_SURFACE,
  },
  billing: {
    id: "billing",
    kind: "business",
    description: LOCKED_DESCRIPTIONS.billing,
    handler: executeBilling,
    implemented: true,
    toolSurface: BILLING_TOOL_SURFACE,
  },
  khata: {
    id: "khata",
    kind: "business",
    description: LOCKED_DESCRIPTIONS.khata,
    handler: executeKhata,
    implemented: true,
    toolSurface: KHATA_TOOL_SURFACE,
  },
  analytics: {
    id: "analytics",
    kind: "business",
    description: LOCKED_DESCRIPTIONS.analytics,
    handler: executeAnalytics,
    implemented: true,
    toolSurface: ANALYTICS_TOOL_SURFACE,
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
  lines.push(`inventory tools: ${INVENTORY_TOOL_SURFACE.join(", ")}`);
  lines.push(`billing tools: ${BILLING_TOOL_SURFACE.join(", ")}`);
  lines.push(`khata tools: ${KHATA_TOOL_SURFACE.join(", ")}`);
  lines.push(`analytics tools: ${ANALYTICS_TOOL_SURFACE.join(", ")}`);
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
  if (capabilityId === "inventory") {
    return ensureInventoryFaithfulnessBuilder();
  }
  if (capabilityId === "billing") {
    return ensureBillingFaithfulnessBuilder();
  }
  if (capabilityId === "khata") {
    return ensureKhataFaithfulnessBuilder();
  }
  if (capabilityId === "analytics") {
    return ensureAnalyticsFaithfulnessBuilder();
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
