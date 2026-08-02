import { getCapabilityDescriptions } from "../capability-registry/index.js";
import type {
  OrchestrationContext,
  StructuredCapabilityPlan,
} from "./types.js";
import { generateJson } from "./gemini-client.js";

const SYSTEM_PROMPT = `You are the Global Orchestrator for a Kirana shop assistant.
You plan which business capabilities should handle user objectives.
You NEVER call tools directly — only assign objectives to registered capabilities.

Registered capabilities:
${getCapabilityDescriptions()}

Output JSON with shape:
{
  "objectives": [
    {
      "objectiveId": "string",
      "objectiveDescription": "string",
      "capabilityId": "my_shop_profile",
      "dependencies": []
    }
  ]
}

Rules:
- Use capabilityId "my_shop_profile" for shop identity, GST/tax registration, and agent instructions.
- Clarification is conversational — do not plan confirmation flows here.
- One objective per distinct user intent when possible.`;

export async function planCapabilities(
  ctx: OrchestrationContext,
): Promise<StructuredCapabilityPlan> {
  const conversation = ctx.turns
    .map((t) => `${t.role}: ${t.contextText}`)
    .join("\n");

  const profileSummary = JSON.stringify(ctx.ownerProfile);

  const userPrompt = `Store initialized: ${ctx.storeInitialized}
Owner profile: ${profileSummary}
Latest user message: ${ctx.inbound.text}

Conversation history:
${conversation}`;

  return generateJson<StructuredCapabilityPlan>(
    ctx.geminiApiKey,
    SYSTEM_PROMPT,
    userPrompt,
  );
}
