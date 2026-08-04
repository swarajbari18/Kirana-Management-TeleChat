/**
 * G4 — production grounded response spike (real Gemini API).
 */
import { describe, expect, it } from "vitest";
import { GEMINI_MODEL } from "../global-orchestrator/constants.js";
import { verifyBindings } from "../global-orchestrator/faithfulness/binding-verifier.js";
import { validateGroundedResponse } from "../global-orchestrator/grounded-response/schema.js";
import { buildUserProfileFactRecords } from "../global-orchestrator/verified-facts/user-profile-fact-registry.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const skipReason = "Set GEMINI_API_KEY in .dev.vars";

describe("grounded response production integration", () => {
  it.skipIf(!GEMINI_API_KEY)(
    `G4 ${GEMINI_MODEL} returns valid GroundedResponse (${skipReason})`,
    async () => {
      const records = buildUserProfileFactRecords(
        "fetch_shop_profile",
        "user_profile",
        "read_shop_profile",
        {
          shopName: "Bantu Kirana",
          ownerName: "Swaraj Bari",
          gstRegistered: true,
          gstin: "27AAPFU0939F1ZV",
          instructions: [""],
        },
      );
      const factCatalog = records.map((r) => ({
        factId: r.factId,
        catalogLabel: r.catalogLabel,
        field: r.field,
        valueType: r.valueType,
      }));

      const systemPrompt = `Output valid JSON only:
{
  "lines": [{ "display": "string", "bindings": [{ "factId": "string", "field": "string", "asShown": "string" }] }]
}
Use factIds from catalog only.
Fact Catalog: ${JSON.stringify(factCatalog)}`;

      const { generateJsonWithMeta } = await import(
        "../global-orchestrator/gemini-client.js"
      );

      const meta = await generateJsonWithMeta<{ lines: unknown[] }>(
        GEMINI_API_KEY!,
        systemPrompt,
        "fetch my business profile — show shop name and GSTIN",
      );

      expect(meta.durationMs).toBeGreaterThan(0);
      const validation = validateGroundedResponse(meta.result);
      expect(validation.valid).toBe(true);
      if (validation.valid) {
        const registry = new Map(records.map((r) => [r.factId, r]));
        const failures = verifyBindings(
          validation.data,
          registry,
          new Map(),
        );
        expect(failures).toHaveLength(0);
      }
    },
    45_000,
  );
});
