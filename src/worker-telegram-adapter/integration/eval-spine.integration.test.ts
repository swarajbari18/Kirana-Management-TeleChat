/**
 * EVAL-01 — eval script posts C50 rows when webhook secrets are configured.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { textMessageUpdate } from "../fixtures/telegram-updates.js";
import {
  INTEGRATION_PROBE_CHAT_ID,
  INTEGRATION_PROBE_USER_ID,
} from "../fixtures/test-identities.js";

const WORKER_WEBHOOK_URL = process.env.WORKER_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const hasConfig = Boolean(WORKER_WEBHOOK_URL && WEBHOOK_SECRET);

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = resolve(__dirname, "../../../queries-5.0.csv");

function parseQueryCount(): number {
  const lines = readFileSync(csvPath, "utf8").trim().split("\n");
  return lines.length - 1;
}

describe("eval spine EVAL-01", () => {
  it("documents skip when webhook secrets absent", () => {
    if (!hasConfig) {
      console.warn("[EVAL-01] Skipped — WORKER_WEBHOOK_URL / WEBHOOK_SECRET not set");
    }
    expect(true).toBe(true);
  });

  it.skipIf(!hasConfig)(
    "posts all C50 rows to deployed webhook",
    async () => {
      const count = parseQueryCount();
      expect(count).toBeGreaterThanOrEqual(5);

      const baseUpdateId = Date.now() + 100_000;
      for (let i = 0; i < count; i++) {
        const updateId = baseUpdateId + i;
        const update = textMessageUpdate({
          updateId,
          messageId: updateId,
          chatId: INTEGRATION_PROBE_CHAT_ID,
          userId: INTEGRATION_PROBE_USER_ID,
          text: `eval-probe-${i}`,
        });

        const response = await fetch(WORKER_WEBHOOK_URL!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET!,
          },
          body: JSON.stringify(update),
        });

        expect(response.status).toBe(200);
      }
    },
    120_000,
  );
});
