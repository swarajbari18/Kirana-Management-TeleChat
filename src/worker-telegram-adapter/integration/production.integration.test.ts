/**
 * Production-first integration tests — hit the REAL deployed Worker webhook.
 *
 * Prerequisites (human operator):
 * 1. Copy `.dev.vars.example` → `.dev.vars` and fill in values.
 * 2. Deploy worker: see `running.md`.
 * 3. Run: `npm test`
 *
 * Covers production validation Part C (HTTP edge cases) and Part E (security)
 * without manual curl. Part A/B (Telegram happy path) remain manual in Telegram.
 *
 * LIMITATIONS (C3 audit): HTTP 200-only tests cannot detect Gemini or delivery
 * failures. See gemini-production.integration.test.ts and delivery-policy.test.ts.
 *
 * When `WORKER_WEBHOOK_URL` and `WEBHOOK_SECRET` are set in `.dev.vars`, these
 * tests POST to the live worker. When secrets are absent (e.g. CI), tests
 * skip gracefully.
 */
import { describe, expect, it } from "vitest";
import {
  INTEGRATION_PROBE_CHAT_ID,
  INTEGRATION_PROBE_MESSAGE,
  INTEGRATION_PROBE_USER_ID,
} from "../fixtures/test-identities.js";
import {
  photoMessageUpdate,
  textMessageUpdate,
} from "../fixtures/telegram-updates.js";

const WORKER_WEBHOOK_URL = process.env.WORKER_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const BOT_TOKEN = process.env.BOT_TOKEN;

const hasWebhookConfig = Boolean(WORKER_WEBHOOK_URL && WEBHOOK_SECRET);

const skipReason =
  "Set WORKER_WEBHOOK_URL and WEBHOOK_SECRET in .dev.vars (see .dev.vars.example). Deploy worker first — see running.md.";

function webhookUrl(): string {
  if (!WORKER_WEBHOOK_URL) {
    throw new Error("WORKER_WEBHOOK_URL is not set");
  }
  return WORKER_WEBHOOK_URL;
}

function workerBaseUrl(): string {
  const url = webhookUrl();
  if (url.endsWith("/webhook")) {
    return url.slice(0, -"/webhook".length);
  }
  return url.replace(/\/$/, "");
}

function webhookSecret(): string {
  if (!WEBHOOK_SECRET) {
    throw new Error("WEBHOOK_SECRET is not set");
  }
  return WEBHOOK_SECRET;
}

const TEST_CHAT_ID = process.env.TEST_CHAT_ID
  ? Number(process.env.TEST_CHAT_ID)
  : undefined;

function integrationChatId(): number {
  return TEST_CHAT_ID ?? INTEGRATION_PROBE_CHAT_ID;
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

describe("production webhook integration", () => {
  it("documents how to enable this suite", () => {
    if (!hasWebhookConfig) {
      console.warn(`[production.integration] Skipped — ${skipReason}`);
    } else {
      console.info(
        `[production.integration] Running against ${redactUrl(webhookUrl())}`,
      );
    }
    expect(true).toBe(true);
  });

  describe("Part C — HTTP edge cases", () => {
    it.skipIf(!hasWebhookConfig)(
      `C1 GET /webhook → 404 or 405 (${skipReason})`,
      async () => {
        const response = await fetch(webhookUrl(), { method: "GET" });
        expect([404, 405]).toContain(response.status);
      },
    );

    it.skipIf(!hasWebhookConfig)(
      `C2 POST / (wrong path) → 404 (${skipReason})`,
      async () => {
        const response = await fetch(`${workerBaseUrl()}/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": webhookSecret(),
          },
          body: JSON.stringify(textMessageUpdate()),
        });
        expect(response.status).toBe(404);
      },
    );

    it.skipIf(!hasWebhookConfig)(
      `C3 malformed JSON + correct secret → 400 (${skipReason})`,
      async () => {
        const response = await fetch(webhookUrl(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": webhookSecret(),
          },
          body: "{not-valid-json",
        });
        expect(response.status).toBe(400);
      },
    );

    it.skipIf(!hasWebhookConfig)(
      `valid POST /webhook → 200 (${skipReason})`,
      async () => {
        const uniqueSuffix = Date.now();
        const update = textMessageUpdate({
          updateId: uniqueSuffix,
          messageId: uniqueSuffix,
          userId: INTEGRATION_PROBE_USER_ID,
          chatId: INTEGRATION_PROBE_CHAT_ID,
          text: INTEGRATION_PROBE_MESSAGE,
        });

        const response = await fetch(webhookUrl(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": webhookSecret(),
          },
          body: JSON.stringify(update),
        });

        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toMatch(/OK/i);
      },
    );

    it.skipIf(!hasWebhookConfig)(
      `unsupported update (photo) → 200 (${skipReason})`,
      async () => {
        const chatId = integrationChatId();
        const update = photoMessageUpdate({
          updateId: Date.now(),
          messageId: Date.now(),
          chatId,
          userId: chatId,
        });

        const response = await fetch(webhookUrl(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": webhookSecret(),
          },
          body: JSON.stringify(update),
        });

        expect(response.status).toBe(200);
      },
    );
  });

  describe("Part E — webhook security", () => {
    it.skipIf(!hasWebhookConfig)(
      `E2/C4 missing secret header → 403 (${skipReason})`,
      async () => {
        const response = await fetch(webhookUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(textMessageUpdate()),
        });
        expect(response.status).toBe(403);
      },
    );

    it.skipIf(!hasWebhookConfig)(
      `E2/C5 wrong secret → 403 (${skipReason})`,
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
  });

  describe("Telegram webhook health", () => {
    it.skipIf(!hasWebhookConfig && !BOT_TOKEN)(
      `getWebhookInfo: no last_error_message (${skipReason})`,
      async () => {
        if (!BOT_TOKEN) {
          return;
        }

        const response = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`,
        );
        expect(response.ok).toBe(true);

        const payload = (await response.json()) as {
          ok: boolean;
          result?: { url?: string; last_error_message?: string };
        };

        expect(payload.ok).toBe(true);
        if (payload.result?.url) {
          expect(payload.result.url).toMatch(/\/webhook$/);
        }
        expect(payload.result?.last_error_message ?? "").toBe("");
      },
    );
  });
});
