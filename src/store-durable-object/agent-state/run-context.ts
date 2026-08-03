import type { CapabilityResult } from "../../my-shop-profile/types.js";
import type { StoreDatabase } from "../persistence/db.js";
import { insertTraceEvent } from "../persistence/repositories/agent-trace-repository.js";
import type {
  DecisionResult,
  OrchestrationContext,
  StructuredCapabilityPlan,
} from "../../global-orchestrator/types.js";
import type { PlanVerificationResult } from "../../global-orchestrator/execution-engine/plan-verification.js";
import type { ExecutionPhaseResult } from "../../global-orchestrator/execution-engine/types.js";
import type {
  FactCatalogEntry,
  OutcomeCatalogEntry,
  OutcomeRecord,
  VerifiedFactRecord,
} from "../../global-orchestrator/verified-facts/types.js";
import {
  buildOutcomeCatalogFromPhaseResult,
  buildRegistryFromPhaseResult,
  factsForDecision,
} from "../../global-orchestrator/verified-facts/registry-builder.js";

export type TraceStage =
  | "CONTEXT_ASSEMBLED"
  | "CAPABILITY_PLAN"
  | "PLAN_VERIFIED"
  | "PLAN_VERIFICATION_FAILED"
  | "CAPABILITY_INVOKED"
  | "CAPABILITY_STEP_COMPLETED"
  | "TOOL_PLAN"
  | "TOOL_PLAN_VERIFIED"
  | "TOOL_PLAN_VERIFICATION_FAILED"
  | "PARAMETER_GROUNDING_FAILED"
  | "TOOL_EXECUTED"
  | "CONFIRMATION_REQUESTED"
  | "CONFIRMATION_RESOLVED"
  | "DECISION"
  | "RESPONSE_GENERATED"
  | "FAITHFULNESS_VERIFIED"
  | "FAITHFULNESS_FAILED"
  | "ORCHESTRATION_ERROR";

export type TraceLayer =
  | "go"
  | "capability"
  | "verify"
  | "faithfulness"
  | "transport";

export type ObjectiveStatus =
  | "pending"
  | "running"
  | "completed"
  | "clarification_needed"
  | "denied"
  | "error"
  | "skipped_blocked";

export interface LlmInvocationTrace {
  step: string;
  model: string;
  invocation: {
    systemInstruction: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  };
  output: {
    content: string;
    reasoning?: string;
    parsed?: unknown;
  };
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  durationMs: number;
  error?: string;
}

export interface ReplanHistoryEntry {
  planVersion: number;
  plan: StructuredCapabilityPlan;
  phaseResult: ExecutionPhaseResult;
  decision?: DecisionResult;
}

export interface BcInvocationState {
  priorToolPlan?: unknown;
  priorResults?: CapabilityResult;
}

function stripNewCommandPrefix(text: string): string {
  return text.replace(/^\/new\s*/i, "").trim();
}

export class RunContext {
  readonly correlationId: string;
  readonly updateId: number;
  readonly storeId: string;

  strategicRound = 0;
  planVersion = 1;
  currentPlan: StructuredCapabilityPlan | null = null;
  businessIntent: string | null = null;
  objectiveStates = new Map<
    string,
    { status: ObjectiveStatus; result?: CapabilityResult }
  >();
  replanHistory: ReplanHistoryEntry[] = [];
  bcInvocationState = new Map<string, BcInvocationState>();
  verifiedFactRegistry = new Map<string, VerifiedFactRecord>();
  outcomeRegistry = new Map<string, OutcomeRecord>();
  priorDecisions: DecisionResult[] = [];
  nextSeq = 1;
  contextAssembled = false;

  constructor(
    readonly db: StoreDatabase,
    readonly ctx: OrchestrationContext,
  ) {
    this.correlationId = ctx.correlationId;
    this.updateId = ctx.updateId;
    this.storeId = ctx.storeId;
  }

  resolveBusinessIntent(): string {
    if (this.businessIntent?.trim()) {
      return this.businessIntent.trim();
    }
    const stripped = stripNewCommandPrefix(this.ctx.inbound.text);
    return stripped || this.ctx.inbound.text;
  }

  async ensureContextAssembled(): Promise<void> {
    if (this.contextAssembled) {
      return;
    }
    await this.appendTrace("go", "global_orchestrator", "CONTEXT_ASSEMBLED", {
      planVersion: this.planVersion,
      storeInitialized: this.ctx.storeInitialized,
    });
    this.contextAssembled = true;
  }

  buildRegistryFromPhaseResult(
    plan: StructuredCapabilityPlan,
    phaseResult: ExecutionPhaseResult,
  ): void {
    this.verifiedFactRegistry = buildRegistryFromPhaseResult(plan, phaseResult);
    this.outcomeRegistry = buildOutcomeCatalogFromPhaseResult(phaseResult);
  }

  factCatalogForResponse(): FactCatalogEntry[] {
    return [...this.verifiedFactRegistry.values()].map((r) => ({
      factId: r.factId,
      catalogLabel: r.catalogLabel,
      field: r.field,
      valueType: r.valueType,
    }));
  }

  outcomeCatalogForResponse(): OutcomeCatalogEntry[] {
    return [...this.outcomeRegistry.values()].map((o) => ({
      outcomeId: o.outcomeId,
      catalogLabel: o.catalogLabel,
      kind: o.kind,
    }));
  }

  planningContextSlice(
    mode: "initial" | "strategic_replan" | "harness_retry",
    harnessRetry?: PlanVerificationResult,
  ): string {
    const conversation = this.ctx.turns
      .map((t) => `${t.role}: ${t.contextText}`)
      .join("\n");

    const parts: string[] = [
      `Store initialized: ${this.ctx.storeInitialized}`,
      `Owner profile: ${JSON.stringify(this.ctx.ownerProfile)}`,
      `Latest user message: ${this.ctx.inbound.text}`,
      `Conversation history:\n${conversation}`,
    ];

    if (this.businessIntent) {
      parts.push(`Prior business intent: ${this.businessIntent}`);
    }

    if (mode === "strategic_replan") {
      if (this.currentPlan) {
        parts.push(
          `Prior capability plan:\n${JSON.stringify(this.currentPlan, null, 2)}`,
        );
      }
      for (const entry of this.replanHistory) {
        parts.push(
          `Replan v${entry.planVersion} results:\n${JSON.stringify(entry.phaseResult, null, 2)}`,
        );
      }
      const lastDecision = this.priorDecisions.at(-1);
      if (lastDecision) {
        parts.push(`Prior decision:\n${JSON.stringify(lastDecision, null, 2)}`);
      }
      if (this.verifiedFactRegistry.size > 0) {
        parts.push(
          `Verified facts:\n${JSON.stringify(factsForDecision(this.verifiedFactRegistry))}`,
        );
      }
    }

    if (mode === "harness_retry" && harnessRetry) {
      parts.push(
        `Plan verification failed. Diagnostics: ${JSON.stringify(harnessRetry.diagnostics ?? [harnessRetry.reason])}`,
      );
      if (this.currentPlan) {
        parts.push(
          `Invalid plan attempt:\n${JSON.stringify(this.currentPlan, null, 2)}`,
        );
      }
    }

    return parts.join("\n\n");
  }

  harnessRetryContextSlice(verification: PlanVerificationResult): string {
    return this.planningContextSlice("harness_retry", verification);
  }

  decisionContextSlice(phaseResult: ExecutionPhaseResult): string {
    const parts: string[] = [
      `Business intent: ${this.resolveBusinessIntent()}`,
      `Execution plan:\n${JSON.stringify(this.currentPlan, null, 2)}`,
      `Plan version: ${this.planVersion}`,
      `Objective results:\n${JSON.stringify(phaseResult, null, 2)}`,
      `Verified facts:\n${JSON.stringify(factsForDecision(this.verifiedFactRegistry))}`,
    ];

    if (this.priorDecisions.length > 0) {
      parts.push(
        `Prior decisions:\n${JSON.stringify(this.priorDecisions, null, 2)}`,
      );
    }
    if (this.replanHistory.length > 0) {
      parts.push(
        `Replan history summaries:\n${JSON.stringify(
          this.replanHistory.map((r) => ({
            planVersion: r.planVersion,
            objectiveCount: r.plan.objectives.length,
          })),
        )}`,
      );
    }

    return parts.join("\n\n");
  }

  clarifyContextSlice(phaseResult: ExecutionPhaseResult): string {
    const clarifications = Object.entries(phaseResult.objectives)
      .filter(([, v]) => v.result?.status === "clarification_needed")
      .map(([, v]) => v.result);

    const completed = Object.entries(phaseResult.objectives)
      .filter(([, v]) => v.result?.status === "completed")
      .map(([, v]) => v.result);

    return [
      `Clarification needs:\n${JSON.stringify(clarifications)}`,
      `Completed acknowledgments:\n${JSON.stringify(completed)}`,
      `User message: ${this.ctx.inbound.text}`,
    ].join("\n\n");
  }

  respondContextSlice(phaseResult: ExecutionPhaseResult): string {
    const denied = Object.entries(phaseResult.objectives)
      .filter(([, v]) => v.result?.status === "denied")
      .map(([, v]) => v.result);

    return [
      `Verified facts:\n${JSON.stringify(factsForDecision(this.verifiedFactRegistry))}`,
      `Denied outcomes:\n${JSON.stringify(denied)}`,
      `User message: ${this.ctx.inbound.text}`,
      `Owner instructions: ${JSON.stringify(this.ctx.ownerProfile.instructions)}`,
    ].join("\n\n");
  }

  recordReplanVersion(
    plan: StructuredCapabilityPlan,
    phaseResult: ExecutionPhaseResult,
    decision?: DecisionResult,
  ): void {
    this.replanHistory.push({
      planVersion: this.planVersion,
      plan,
      phaseResult,
      decision,
    });
    this.planVersion += 1;
    this.currentPlan = null;
    this.objectiveStates.clear();
  }

  getBcPriorPlan(objectiveId: string): unknown | undefined {
    return this.bcInvocationState.get(objectiveId)?.priorToolPlan;
  }

  getBcPriorResults(objectiveId: string): CapabilityResult | undefined {
    return this.bcInvocationState.get(objectiveId)?.priorResults;
  }

  storeBcInvocation(
    objectiveId: string,
    toolPlan: unknown,
    result: CapabilityResult,
  ): void {
    this.bcInvocationState.set(objectiveId, {
      priorToolPlan: toolPlan,
      priorResults: result,
    });
  }

  async appendTrace(
    layer: TraceLayer,
    component: string,
    stage: TraceStage,
    payload: unknown,
    parentEventId?: string | null,
  ): Promise<string> {
    const eventId = crypto.randomUUID();
    const seq = this.nextSeq++;
    await insertTraceEvent(this.db, {
      eventId,
      updateId: this.updateId,
      correlationId: this.correlationId,
      seq,
      parentEventId: parentEventId ?? null,
      layer,
      component,
      stage,
      payload: { ...((payload as object) ?? {}), planVersion: this.planVersion },
    });
    return eventId;
  }

  async traceLlmInvocation(
    layer: TraceLayer,
    component: string,
    stage: TraceStage,
    trace: LlmInvocationTrace,
    parentEventId?: string | null,
  ): Promise<string> {
    return this.appendTrace(
      layer,
      component,
      stage,
      { llm: trace },
      parentEventId,
    );
  }

  discard(): void {
    // L1 cleared by GC when reference drops after terminal delivery.
  }
}

export function createRunContext(
  db: StoreDatabase,
  ctx: OrchestrationContext,
): RunContext {
  return new RunContext(db, ctx);
}
