import type { ExecutionResult } from "../worker-telegram-adapter/contracts/index.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import {
  GENERIC_ORCHESTRATION_ERROR,
  MAX_GO_GEMINI_ROUNDS,
} from "./constants.js";
import { decideNextAction } from "./decision-mode.js";
import { executeCapabilityPlan } from "./execution-engine/index.js";
import { verifyCapabilityPlan } from "./execution-engine/plan-verification.js";
import { planCapabilities } from "./planning-mode.js";
import { generateResponse } from "./response-generation.js";
import type { OrchestrationContext } from "./types.js";

export async function orchestrate(
  ctx: OrchestrationContext,
  runtimePorts: RuntimePorts,
  db: StoreDatabase,
): Promise<ExecutionResult> {
  try {
    let plan = await planCapabilities(ctx);
    let verification = verifyCapabilityPlan(plan);

    if (!verification.valid && MAX_GO_GEMINI_ROUNDS > 1) {
      plan = await planCapabilities(ctx);
      verification = verifyCapabilityPlan(plan);
    }

    if (!verification.valid) {
      return {
        status: "ok",
        messages: [
          {
            type: "text",
            text: "Could you tell me more about what you'd like to update for your shop?",
          },
        ],
        attachments: [],
      };
    }

    const capabilityResults = await executeCapabilityPlan(
      plan.objectives,
      ctx,
      runtimePorts,
      db,
    );

    const clarification = capabilityResults.find(
      (r) => r.status === "clarification_needed",
    );
    if (clarification && clarification.status === "clarification_needed") {
      return {
        status: "ok",
        messages: [
          {
            type: "text",
            text: clarification.requiredInfo,
          },
        ],
        attachments: [],
      };
    }

    const denied = capabilityResults.find((r) => r.status === "denied");
    if (denied && denied.status === "denied") {
      const decision = await decideNextAction(ctx, capabilityResults);
      const text = await generateResponse(
        ctx,
        capabilityResults,
        decision.action === "clarify"
          ? decision.clarificationQuestion
          : "No problem — I didn't save those changes.",
      );
      return {
        status: "ok",
        messages: [{ type: "text", text }],
        attachments: [],
      };
    }

    const decision = await decideNextAction(ctx, capabilityResults);
    const text = await generateResponse(
      ctx,
      capabilityResults,
      decision.action === "clarify" ? decision.clarificationQuestion : undefined,
    );

    return {
      status: "ok",
      messages: [{ type: "text", text }],
      attachments: [],
    };
  } catch {
    return {
      status: "error",
      messages: [{ type: "text", text: GENERIC_ORCHESTRATION_ERROR }],
      attachments: [],
    };
  }
}

export type {
  ConversationContext,
  ConversationTurn,
  OrchestrationContext,
} from "./types.js";
