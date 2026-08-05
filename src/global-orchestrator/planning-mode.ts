import { getCapabilityDescriptionsForPlanning } from "../capability-registry/index.js";
import { GEMINI_MODEL } from "./constants.js";
import {
  generateJsonWithMeta,
  type GeminiInvocationResult,
} from "./gemini-client.js";
import type { RunContext } from "../store-durable-object/agent-state/run-context.js";
import type {
  OrchestrationContext,
  StructuredCapabilityPlan,
} from "./types.js";
import { buildOpenDraftSummaries } from "../store-durable-object/persistence/repositories/billing-repository.js";
import { formatOpenDraftsSummaryForContext } from "../billing/draft-focus-resolver.js";

const SYSTEM_PROMPT = `You are the Planning component of the Global Orchestrator for a Kirana shop assistant.

Your job: produce a JSON execution plan that assigns business objectives to registered capabilities by domain.

You do NOT call tools. You do NOT execute operations. You ONLY output the plan JSON.

Registered capabilities (reference — code enforces validity):
${getCapabilityDescriptionsForPlanning()}

Output JSON shape:
{
  "businessIntent": "string — owner outcome in plain language",
  "objectives": [
    {
      "objectiveId": "string",
      "objectiveDescription": "string",
      "capabilityId": "registered capability id",
      "dependencies": ["other_objective_id_if_needed"],
      "draftTarget": "optional — for billing only: implicit_latest (default) | new | by_customer | ambiguous. Classify from conversation when owner continues, starts fresh, names a customer draft, or is ambiguous among 2+ open drafts. Never emit bill_id.",
      "customerName": "optional — for billing by_customer when customer name is clear"
    }
  ]
}

businessIntent must reflect the user's message, NOT repeat a single objectiveDescription verbatim when multiple objectives exist.

Sale / finalize business operation: Finalizing a sale creates a financial record (billing), then reduces stock (inventory commit_bill_sale after finalize), and if payment is khata/udhar, records customer credit (khata). These are separate capabilities assigned as separate objectives with dependencies — not hidden inside billing. Cash/UPI sales do not need a khata objective. Product identity for a sale often starts with an inventory read before billing builds the draft.

Assign one complete business outcome per capability objective. Do not split a single capability flow into separate read and write objectives — each capability plans and runs its full tool sequence in one invocation:
- inventory: query + register/update/allocate in one inventory invocation
- khata: query + create/record in one khata invocation
- billing: draft edits as one billing invocation; finalize as a separate billing objective (finalize_bill is never a draft edit). When the owner supplies a customer name so a draft can be finalized, use two billing objectives in order — first set the customer on the draft, then finalize — not one objective that says "finalize with customer X".
- user_profile: profile reads and proposed updates in one user_profile invocation when both are needed

On replan or retry, use the evidence in the conversation context (prior plan, results, decisions, or verifier feedback) to revise intent, objectives, or assignments. Do not invent business facts.

Output valid JSON only.`;

export interface PlanCapabilitiesResult {
  plan: StructuredCapabilityPlan;
  llmTrace: GeminiInvocationResult<StructuredCapabilityPlan>;
}

export async function planCapabilities(
  ctx: OrchestrationContext,
  runContext: RunContext,
  mode: "initial" | "strategic_replan" | "harness_retry" = "initial",
  harnessRetry?: import("./execution-engine/plan-verification.js").PlanVerificationResult,
): Promise<PlanCapabilitiesResult> {
  const userPrompt = runContext.planningContextSlice(mode, harnessRetry);
  const openDrafts = await buildOpenDraftSummaries(runContext.db);
  const promptWithDrafts = `${userPrompt}\n\n${formatOpenDraftsSummaryForContext(openDrafts)}`;

  const llmTrace = await generateJsonWithMeta<StructuredCapabilityPlan>(
    ctx.geminiApiKey,
    SYSTEM_PROMPT,
    promptWithDrafts,
  );

  return {
    plan: llmTrace.result,
    llmTrace,
  };
}

export function buildLlmTracePayload(
  step: string,
  llmTrace: GeminiInvocationResult<unknown>,
): object {
  return {
    step,
    model: GEMINI_MODEL,
    invocation: llmTrace.invocation,
    output: {
      content: llmTrace.rawContent,
      reasoning: llmTrace.reasoning,
      parsed: llmTrace.result,
    },
    usage: llmTrace.usage,
    durationMs: llmTrace.durationMs,
  };
}
