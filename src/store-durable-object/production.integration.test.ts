/**
 * Production-first integration tests for the DO Runtime Kernel.
 * POST to the deployed Worker webhook — no mocks.
 *
 * LIMITATIONS (C3 audit):
 * - P1–P5 assert HTTP 200 only (same as Component 1/2). That cannot detect
 *   Gemini failures, wrong model id, or missing Telegram delivery.
 * - G1/G2 in gemini-production.integration.test.ts hit the real Gemini API.
 * - delivery-policy.test.ts guards error-result delivery to Telegram.
 * - Full Telegram reply verification still requires manual check or wrangler tail.
 */
import { describe, expect, it } from "vitest";
import {
  DO_RUNTIME_PROBE_MESSAGE,
  DUPLICATE_UPDATE_PROBE_MESSAGE,
  INTEGRATION_PROBE_CHAT_ID,
  INTEGRATION_PROBE_USER_ID,
} from "../worker-telegram-adapter/fixtures/test-identities.js";
import {
  newCommandUpdate,
  startCommandUpdate,
  textMessageUpdate,
} from "../worker-telegram-adapter/fixtures/telegram-updates.js";

const WORKER_WEBHOOK_URL = process.env.WORKER_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const hasWebhookConfig = Boolean(WORKER_WEBHOOK_URL && WEBHOOK_SECRET);
const hasOrchestrationConfig = Boolean(hasWebhookConfig && GEMINI_API_KEY);

const skipReason =
  "Set WORKER_WEBHOOK_URL and WEBHOOK_SECRET in .dev.vars (see .dev.vars.example). Deploy worker first — see running.md.";

const orchestrationSkipReason =
  "Set WORKER_WEBHOOK_URL, WEBHOOK_SECRET, and GEMINI_API_KEY in .dev.vars. Deploy worker first.";

function webhookUrl(): string {
  if (!WORKER_WEBHOOK_URL) {
    throw new Error("WORKER_WEBHOOK_URL is not set");
  }
  return WORKER_WEBHOOK_URL;
}

function webhookSecret(): string {
  if (!WEBHOOK_SECRET) {
    throw new Error("WEBHOOK_SECRET is not set");
  }
  return WEBHOOK_SECRET;
}

async function postUpdate(body: unknown): Promise<Response> {
  return fetch(webhookUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": webhookSecret(),
    },
    body: JSON.stringify(body),
  });
}

describe("store durable object production integration", () => {
  it("documents how to enable this suite", () => {
    if (!hasWebhookConfig) {
      console.warn(`[store-do.integration] Skipped — ${skipReason}`);
    }
    expect(true).toBe(true);
  });

  it.skipIf(!hasWebhookConfig)(
    `P1 POST /start (unique updateId) → 200 (${skipReason})`,
    async () => {
      const uniqueSuffix = Date.now();
      const update = startCommandUpdate({
        updateId: uniqueSuffix,
        messageId: uniqueSuffix,
        userId: INTEGRATION_PROBE_USER_ID,
        chatId: INTEGRATION_PROBE_CHAT_ID,
      });

      const response = await postUpdate(update);
      expect(response.status).toBe(200);
    },
  );

  it.skipIf(!hasWebhookConfig)(
    `P2 POST plain text → 200 (${skipReason})`,
    async () => {
      const uniqueSuffix = Date.now();
      const update = textMessageUpdate({
        updateId: uniqueSuffix,
        messageId: uniqueSuffix,
        userId: INTEGRATION_PROBE_USER_ID,
        chatId: INTEGRATION_PROBE_CHAT_ID,
        text: DO_RUNTIME_PROBE_MESSAGE,
      });

      const response = await postUpdate(update);
      expect(response.status).toBe(200);
    },
  );

  /**
   * Human verification (wrangler tail):
   * - First request: runtime terminalStatus "ok", transport resultStatus "success"
   * - Second request: runtime terminalStatus "skipped_duplicate", transport resultStatus "skipped_delivery"
   * - User must NOT receive two Telegram messages for the same updateId
   *
   * Requires TEST_CHAT_ID in .dev.vars for end-to-end delivery + confirmTelegramDelivery.
   */
  it.skipIf(!hasWebhookConfig)(
    `P3 POST same updateId twice → 200 both (${skipReason})`,
    async () => {
      const updateId = Date.now();
      const update = textMessageUpdate({
        updateId,
        messageId: updateId,
        userId: INTEGRATION_PROBE_USER_ID,
        chatId: INTEGRATION_PROBE_CHAT_ID,
        text: DUPLICATE_UPDATE_PROBE_MESSAGE,
      });

      const first = await postUpdate(update);
      expect(first.status).toBe(200);

      const second = await postUpdate(update);
      expect(second.status).toBe(200);
    },
  );

  it.skipIf(!hasWebhookConfig)(
    `P4 POST /new → 200 (${skipReason})`,
    async () => {
      const uniqueSuffix = Date.now();
      const update = newCommandUpdate(undefined, {
        updateId: uniqueSuffix,
        messageId: uniqueSuffix,
        userId: INTEGRATION_PROBE_USER_ID,
        chatId: INTEGRATION_PROBE_CHAT_ID,
      });

      const response = await postUpdate(update);
      expect(response.status).toBe(200);
    },
  );

  it.skipIf(!hasWebhookConfig)(
    `P5 wrong webhook secret → 403 (${skipReason})`,
    async () => {
      const response = await fetch(webhookUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "wrong-secret-value",
        },
        body: JSON.stringify(textMessageUpdate()),
      });
      expect(response.status).toBe(403);
    },
  );

  it.skipIf(!hasOrchestrationConfig)(
    `P6 orchestration plain text → 200 fast ack (${orchestrationSkipReason})`,
    async () => {
      const uniqueSuffix = Date.now();
      const update = textMessageUpdate({
        updateId: uniqueSuffix,
        messageId: uniqueSuffix,
        userId: INTEGRATION_PROBE_USER_ID,
        chatId: INTEGRATION_PROBE_CHAT_ID,
        text: "integration orchestration probe — what is my shop profile?",
      });

      const start = Date.now();
      const response = await postUpdate(update);
      const durationMs = Date.now() - start;

      expect(response.status).toBe(200);
      expect(durationMs).toBeLessThan(5000);
    },
    15_000,
  );
});
