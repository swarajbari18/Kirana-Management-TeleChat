import type { CapabilityResult } from "../my-shop-profile/types.js";
import type { DecisionResult, OrchestrationContext } from "./types.js";
import { generateJson } from "./gemini-client.js";

export async function decideNextAction(
  ctx: OrchestrationContext,
  capabilityResults: CapabilityResult[],
): Promise<DecisionResult> {
  const systemPrompt = `You decide whether to respond to the user or ask a clarification question.
Output JSON: { "action": "respond" | "clarify", "clarificationQuestion": "string if clarify" }
Use clarify only when capability results indicate missing information.
Never invent shop facts.`;

  const userPrompt = `User message: ${ctx.inbound.text}
Capability results: ${JSON.stringify(capabilityResults)}`;

  return generateJson<DecisionResult>(
    ctx.geminiApiKey,
    systemPrompt,
    userPrompt,
  );
}
