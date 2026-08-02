/**
 * Production-first Gemini integration — hits the REAL Google API.
 * Uses the same GEMINI_MODEL constant as runtime. No mocks.
 *
 * Requires GEMINI_API_KEY in .dev.vars (loaded by vitest.setup.ts).
 * This test would have caught wrong model id and quota/auth failures.
 */
import { describe, expect, it } from "vitest";
import { GEMINI_MODEL } from "../global-orchestrator/constants.js";
import { generateJson, generateText } from "../global-orchestrator/gemini-client.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const skipReason =
  "Set GEMINI_API_KEY in .dev.vars — required for orchestration in production.";

describe("gemini production integration", () => {
  it("documents how to enable this suite", () => {
    if (!GEMINI_API_KEY) {
      console.warn(`[gemini.production] Skipped — ${skipReason}`);
    } else {
      console.info(`[gemini.production] Model under test: ${GEMINI_MODEL}`);
    }
    expect(true).toBe(true);
  });

  it.skipIf(!GEMINI_API_KEY)(
    `G1 configured model ${GEMINI_MODEL} returns text (${skipReason})`,
    async () => {
      const text = await generateText(
        GEMINI_API_KEY!,
        "Reply with one word only.",
        "Say hello.",
      );
      expect(text.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it.skipIf(!GEMINI_API_KEY)(
    `G2 configured model ${GEMINI_MODEL} returns JSON (${skipReason})`,
    async () => {
      const payload = await generateJson<{ greeting: string }>(
        GEMINI_API_KEY!,
        'Output JSON: { "greeting": string }',
        "Say hello.",
      );
      expect(typeof payload.greeting).toBe("string");
      expect(payload.greeting.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
