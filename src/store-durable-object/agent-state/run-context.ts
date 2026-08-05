import type { CapabilityResult } from "../../capability-registry/types.js";
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
import { getCapabilityContextForDecision } from "../../capability-registry/index.js";
import type {
  PriorBcQueryState,
  ToolPlanVerifyContext,
} from "../../capability-registry/tool-plan-verify-context.js";

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
  | "COLLABORATION_INVARIANT_FAILED"
  | "COLLABORATION_INVARIANT_SATISFIED"
  | "ANALYTICS_GENERATED"
  | "ARTIFACT_GENERATED"
  | "ARTIFACT_RENDER_FAILED"
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
  | "not_supported"
  | "unavailable"
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

export interface BcToolExecutionRecord {
  operationId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  agentState: Record<string, unknown>;
  verifiedFacts: Record<string, unknown>;
}

export interface BcInvocationLogEntry {
  planVersion: number;
  objectiveId: string;
  capabilityId: string;
  objectiveDescription: string;
  toolPlan: unknown;
  result: CapabilityResult;
  toolExecutions: BcToolExecutionRecord[];
}

export interface BcStrategicReinvokeContext {
  priorObjectiveId: string;
  priorPlanVersion: number;
  priorObjectiveDescription: string;
  priorToolPlan: unknown;
  priorResults: CapabilityResult;
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
  bcInvocationLog: BcInvocationLogEntry[] = [];
  verifiedFactRegistry = new Map<string, VerifiedFactRecord>();
  outcomeRegistry = new Map<string, OutcomeRecord>();
  priorDecisions: DecisionResult[] = [];
  nextSeq = 1;
  contextAssembled = false;
  collaborationReplanNarrative: string | null = null;
  private preservedCompletedObjectives = new Map<
    string,
    { capabilityId: string; result: CapabilityResult }
  >();

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

  async buildRegistryFromPhaseResult(
    plan: StructuredCapabilityPlan,
    phaseResult: ExecutionPhaseResult,
  ): Promise<void> {
    this.verifiedFactRegistry = await buildRegistryFromPhaseResult(
      plan,
      phaseResult,
    );
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
      for (const entry of this.replanHistory) {
        parts.push(
          `Replan v${entry.planVersion} plan:\n${JSON.stringify(entry.plan, null, 2)}`,
        );
        parts.push(
          `Replan v${entry.planVersion} results:\n${JSON.stringify(entry.phaseResult, null, 2)}`,
        );
        if (entry.decision) {
          parts.push(
            `Replan v${entry.planVersion} decision:\n${JSON.stringify(entry.decision, null, 2)}`,
          );
        }
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
      if (this.collaborationReplanNarrative) {
        parts.push(
          `Collaboration invariant feedback:\n${this.collaborationReplanNarrative}`,
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
      `Capability registry:\n${getCapabilityContextForDecision()}`,
      `Business intent: ${this.resolveBusinessIntent()}`,
      `Execution plan:\n${JSON.stringify(this.currentPlan, null, 2)}`,
      `Plan version: ${this.planVersion}`,
      `Objective results (full CapabilityResult per objective):\n${JSON.stringify(phaseResult, null, 2)}`,
      `Verified facts:\n${JSON.stringify(factsForDecision(this.verifiedFactRegistry))}`,
    ];

    const toolEvidence = this.formatBcToolExecutionEvidence();
    if (toolEvidence) {
      parts.push(toolEvidence);
    }

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

  askUserContextSlice(
    phaseResult: ExecutionPhaseResult,
    decision?: DecisionResult,
  ): string {
    const clarifications = Object.entries(phaseResult.objectives)
      .filter(([, v]) => v.result?.status === "clarification_needed")
      .map(([, v]) => v.result);

    const parts = [
      `Clarification needs:\n${JSON.stringify(clarifications)}`,
      `Business intent: ${this.resolveBusinessIntent()}`,
      `Verified facts:\n${JSON.stringify(factsForDecision(this.verifiedFactRegistry))}`,
      `User message: ${this.ctx.inbound.text}`,
    ];

    const toolEvidence = this.formatBcToolExecutionEvidence();
    if (toolEvidence) {
      parts.push(toolEvidence);
    }

    if (decision) {
      parts.unshift(`Decision:\n${JSON.stringify(decision, null, 2)}`);
    }

    return parts.join("\n\n");
  }

  /** @deprecated Use askUserContextSlice */
  clarifyContextSlice(phaseResult: ExecutionPhaseResult): string {
    return this.askUserContextSlice(phaseResult);
  }

  respondContextSlice(
    phaseResult: ExecutionPhaseResult,
    decision?: DecisionResult,
  ): string {
    const denied = Object.entries(phaseResult.objectives)
      .filter(([, v]) => v.result?.status === "denied")
      .map(([, v]) => v.result);

    const executionSummary = Object.entries(phaseResult.objectives).map(
      ([objectiveId, entry]) => {
        const step = this.currentPlan?.objectives.find(
          (o) => o.objectiveId === objectiveId,
        );
        return {
          objectiveId,
          capabilityId: step?.capabilityId,
          status: entry.status,
          result: entry.result,
        };
      },
    );

    const parts = [
      decision
        ? `Decision:\n${JSON.stringify(decision, null, 2)}`
        : "",
      `Business intent: ${this.resolveBusinessIntent()}`,
      `Execution summary:\n${JSON.stringify(executionSummary, null, 2)}`,
      `Verified facts:\n${JSON.stringify(factsForDecision(this.verifiedFactRegistry))}`,
      `Denied outcomes:\n${JSON.stringify(denied)}`,
      `User message: ${this.ctx.inbound.text}`,
      `Owner instructions: ${JSON.stringify(this.ctx.ownerProfile.instructions)}`,
    ];

    return parts.filter(Boolean).join("\n\n");
  }

  recordReplanVersion(
    plan: StructuredCapabilityPlan,
    phaseResult: ExecutionPhaseResult,
    decision?: DecisionResult,
  ): void {
    this.preserveCompletedObjectives(plan, phaseResult);
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

  preserveCompletedObjectives(
    plan: StructuredCapabilityPlan,
    phaseResult: ExecutionPhaseResult,
  ): void {
    for (const step of plan.objectives) {
      const entry = phaseResult.objectives[step.objectiveId];
      if (
        entry?.status === "completed" &&
        entry.result?.status === "completed"
      ) {
        this.preservedCompletedObjectives.set(step.objectiveId, {
          capabilityId: step.capabilityId,
          result: entry.result,
        });
      }
    }
  }

  getPreservedObjectiveResult(
    objectiveId: string,
    capabilityId: string,
  ): CapabilityResult | undefined {
    const preserved = this.preservedCompletedObjectives.get(objectiveId);
    if (!preserved || preserved.capabilityId !== capabilityId) {
      return undefined;
    }
    return preserved.result;
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
    meta?: {
      capabilityId: string;
      objectiveDescription: string;
      toolExecutions?: BcToolExecutionRecord[];
    },
  ): void {
    this.bcInvocationState.set(objectiveId, {
      priorToolPlan: toolPlan,
      priorResults: result,
    });
    if (meta && toolPlan != null) {
      this.bcInvocationLog.push({
        planVersion: this.planVersion,
        objectiveId,
        capabilityId: meta.capabilityId,
        objectiveDescription: meta.objectiveDescription,
        toolPlan,
        result,
        toolExecutions: meta.toolExecutions ?? [],
      });
    }
  }

  private resolveQueryCustomerNameFromExecution(
    execution: BcToolExecutionRecord,
  ): string | undefined {
    if (typeof execution.parameters.customer_name === "string") {
      return execution.parameters.customer_name;
    }

    if (typeof execution.verifiedFacts.customer_name === "string") {
      return execution.verifiedFacts.customer_name;
    }

    const agentState = execution.agentState as {
      exactMatchCount?: number;
      exactMatches?: Array<{ canonicalName?: string }>;
    };
    if (agentState.exactMatchCount === 1 && agentState.exactMatches?.[0]) {
      return agentState.exactMatches[0].canonicalName;
    }

    return undefined;
  }

  private resolveQueryProductNameFromExecution(
    execution: BcToolExecutionRecord,
  ): string | undefined {
    if (typeof execution.parameters.product_name === "string") {
      return execution.parameters.product_name;
    }

    const agentState = execution.agentState as {
      exactMatchCount?: number;
      exactMatches?: Array<{ productName?: string }>;
    };
    if (agentState.exactMatchCount === 1 && agentState.exactMatches?.[0]) {
      return agentState.exactMatches[0].productName;
    }

    if (typeof execution.verifiedFacts.productName === "string") {
      return execution.verifiedFacts.productName;
    }

    return undefined;
  }

  getPriorQueryAgentStatesForCapability(
    capabilityId: string,
  ): PriorBcQueryState[] {
    const states: PriorBcQueryState[] = [];
    for (const entry of this.bcInvocationLog) {
      if (entry.capabilityId !== capabilityId) {
        continue;
      }
      if (entry.result.status !== "completed") {
        continue;
      }
      for (const execution of entry.toolExecutions) {
        if (execution.toolName === "query_inventory") {
          states.push({
            queryTool: "query_inventory",
            productName: this.resolveQueryProductNameFromExecution(execution),
            agentState: execution.agentState,
          });
        }
        if (execution.toolName === "query_khata") {
          states.push({
            queryTool: "query_khata",
            customerName: this.resolveQueryCustomerNameFromExecution(execution),
            agentState: execution.agentState,
          });
        }
      }
    }
    return states;
  }

  findPriorQueryAgentState(
    capabilityId: string,
    productName?: string,
    writeTool?:
      | "register_inventory"
      | "update_inventory"
      | "allocate_inventory",
  ): Record<string, unknown> | null {
    const normalizedTarget = productName?.trim().toLowerCase();
    for (let i = this.bcInvocationLog.length - 1; i >= 0; i--) {
      const entry = this.bcInvocationLog[i]!;
      if (entry.capabilityId !== capabilityId) {
        continue;
      }
      if (entry.result.status !== "completed") {
        continue;
      }

      for (let j = entry.toolExecutions.length - 1; j >= 0; j--) {
        const execution = entry.toolExecutions[j]!;
        if (execution.toolName !== "query_inventory") {
          continue;
        }

        const entryProduct = this.resolveQueryProductNameFromExecution(execution);
        if (
          normalizedTarget &&
          entryProduct &&
          entryProduct.trim().toLowerCase() !== normalizedTarget
        ) {
          continue;
        }

        const exactMatchCount = Number(
          (execution.agentState as { exactMatchCount?: number }).exactMatchCount ??
            -1,
        );
        if (writeTool === "register_inventory" && exactMatchCount !== 0) {
          continue;
        }
        if (
          (writeTool === "update_inventory" ||
            writeTool === "allocate_inventory") &&
          exactMatchCount !== 1
        ) {
          continue;
        }

        return execution.agentState;
      }
    }
    return null;
  }

  findPriorKhataQueryAgentState(
    capabilityId: string,
    customerName?: string,
    writeOperation?:
      | "create_customer"
      | "record_manual_credit"
      | "record_payment",
  ): Record<string, unknown> | null {
    const normalizedTarget = customerName?.trim().toLowerCase();
    for (let i = this.bcInvocationLog.length - 1; i >= 0; i--) {
      const entry = this.bcInvocationLog[i]!;
      if (entry.capabilityId !== capabilityId) {
        continue;
      }
      if (entry.result.status !== "completed") {
        continue;
      }

      for (let j = entry.toolExecutions.length - 1; j >= 0; j--) {
        const execution = entry.toolExecutions[j]!;
        if (execution.toolName !== "query_khata") {
          continue;
        }

        const entryCustomer = this.resolveQueryCustomerNameFromExecution(execution);
        if (
          normalizedTarget &&
          entryCustomer &&
          entryCustomer.trim().toLowerCase() !== normalizedTarget
        ) {
          continue;
        }

        const exactMatchCount = Number(
          (execution.agentState as { exactMatchCount?: number }).exactMatchCount ??
            -1,
        );
        if (writeOperation === "create_customer" && exactMatchCount !== 0) {
          continue;
        }
        if (
          (writeOperation === "record_manual_credit" ||
            writeOperation === "record_payment") &&
          exactMatchCount !== 1
        ) {
          continue;
        }

        return execution.agentState;
      }
    }
    return null;
  }

  private formatBcToolExecutionEvidence(): string {
    if (this.bcInvocationLog.length === 0) {
      return "";
    }

    const payload = this.bcInvocationLog.map((entry) => ({
      objectiveId: entry.objectiveId,
      capabilityId: entry.capabilityId,
      objectiveDescription: entry.objectiveDescription,
      toolPlan: entry.toolPlan,
      capabilityResult: entry.result,
      toolExecutions: entry.toolExecutions.map((execution) => ({
        operationId: execution.operationId,
        toolName: execution.toolName,
        parameters: execution.parameters,
        agentState: execution.agentState,
        verifiedFacts: execution.verifiedFacts,
      })),
    }));

    return `BC tool execution evidence (every tool run this interaction):\n${JSON.stringify(payload, null, 2)}`;
  }

  buildToolPlanVerifyContext(capabilityId: string): ToolPlanVerifyContext {
    return {
      capabilityId,
      priorQueryAgentStates:
        this.getPriorQueryAgentStatesForCapability(capabilityId),
    };
  }

  buildBcStrategicReinvokeContext(
    capabilityId: string,
  ): BcStrategicReinvokeContext | undefined {
    if (this.planVersion <= 1) {
      return undefined;
    }
    for (let i = this.bcInvocationLog.length - 1; i >= 0; i--) {
      const entry = this.bcInvocationLog[i]!;
      if (entry.planVersion >= this.planVersion) {
        continue;
      }
      if (entry.capabilityId !== capabilityId) {
        continue;
      }
      return {
        priorObjectiveId: entry.objectiveId,
        priorPlanVersion: entry.planVersion,
        priorObjectiveDescription: entry.objectiveDescription,
        priorToolPlan: entry.toolPlan,
        priorResults: entry.result,
      };
    }
    return undefined;
  }

  buildBcPlanningPriorSlices(
    capabilityId: string,
    objectiveId: string,
  ): string[] {
    const strategic = this.buildBcStrategicReinvokeContext(capabilityId);
    if (strategic) {
      return [
        [
          "Prior work in this capability during this run (agent state evidence):",
          `Prior objective: ${strategic.priorObjectiveDescription}`,
          `Prior tool plan:\n${JSON.stringify(strategic.priorToolPlan, null, 2)}`,
          `Prior execution results:\n${JSON.stringify(strategic.priorResults, null, 2)}`,
          [
            "Plan one complete tool sequence for the current objective in a single operations array.",
            "This is one-shot planning, not a ReAct loop — do not emit only the next tool because prior work exists.",
            "Include every tool still required, in correct dependency order (identity reads before writes).",
            "Examples:",
            "- inventory: query_inventory then register_inventory or update_inventory",
            "- khata: query_khata then create_customer then record_manual_credit for new customer udhar",
            "- billing: ordered manage_draft_bill operations for the full draft edit in one plan",
            "- user_profile: read_shop_profile before propose_* updates when profile state matters",
          ].join("\n"),
        ].join("\n"),
      ];
    }

    const slices: string[] = [];
    const priorPlan = this.getBcPriorPlan(objectiveId);
    const priorResults = this.getBcPriorResults(objectiveId);
    if (priorPlan) {
      slices.push(`Prior tool plan:\n${JSON.stringify(priorPlan, null, 2)}`);
    }
    if (priorResults) {
      slices.push(
        `Prior execution results:\n${JSON.stringify(priorResults, null, 2)}`,
      );
    }
    return slices;
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
