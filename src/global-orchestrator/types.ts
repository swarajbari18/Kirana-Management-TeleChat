import type { ShopProfileSnapshot } from "../store-durable-object/persistence/repositories/shop-profile-repository.js";
import type { ApplicationRequest } from "../worker-telegram-adapter/contracts/index.js";

export interface ConversationTurn {
  id: string;
  contextText: string;
  rawText: string;
  role: string;
  createdAt: string;
}

export interface ConversationContext {
  activeSessionId: string;
  turns: ConversationTurn[];
  storeInitialized: boolean;
  ownerProfile: ShopProfileSnapshot;
}

export interface OrchestrationContext extends ConversationContext {
  storeId: string;
  correlationId: string;
  updateId: number;
  chatId: number;
  inbound: ApplicationRequest["inbound"];
  geminiApiKey: string;
}

export interface CapabilityPlanStep {
  objectiveId: string;
  objectiveDescription: string;
  capabilityId: string;
  dependencies: string[];
}

export interface StructuredCapabilityPlan {
  objectives: CapabilityPlanStep[];
}

export type DecisionAction = "respond" | "clarify";

export interface DecisionResult {
  action: DecisionAction;
  clarificationQuestion?: string;
}
