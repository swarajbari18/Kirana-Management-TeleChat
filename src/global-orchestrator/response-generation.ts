import type { CapabilityResult } from "../my-shop-profile/types.js";
import type { OrchestrationContext } from "./types.js";
import { generateText } from "./gemini-client.js";

export async function generateResponse(
  ctx: OrchestrationContext,
  capabilityResults: CapabilityResult[],
  clarificationQuestion?: string,
): Promise<string> {
  if (clarificationQuestion) {
    return clarificationQuestion;
  }

  const systemPrompt = `You are a helpful Kirana shop assistant.
Respond in natural language grounded ONLY in verified capability facts.
Never invent shop name, GSTIN, or other business data.
Keep responses concise and friendly.`;

  const facts = capabilityResults
    .filter((r) => r.status === "completed")
    .map((r) => r.verifiedFacts);

  const userPrompt = `User message: ${ctx.inbound.text}
Verified facts: ${JSON.stringify(facts)}
Owner profile: ${JSON.stringify(ctx.ownerProfile)}`;

  return generateText(ctx.geminiApiKey, systemPrompt, userPrompt);
}
