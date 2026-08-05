# Running — Deploy & Operations

Operational runbook for Kirana-Management-TeleChat Component 1. For architecture overview see [README.md](README.md).

## Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/) (free tier works)
2. Telegram bot via [@BotFather](https://t.me/BotFather) → `BOT_TOKEN`
3. Random webhook secret (`A-Za-z0-9_-`, 1–256 chars) → `WEBHOOK_SECRET`

## Local secrets

Copy the example file and fill in your values (never commit `.dev.vars`):

```bash
cp .dev.vars.example .dev.vars
```

Required for production integration tests:

| Variable | Purpose |
|----------|---------|
| `BOT_TOKEN` | Telegram Bot API token |
| `WEBHOOK_SECRET` | Must match Wrangler secret and `setWebhook` `secret_token` |
| `WORKER_WEBHOOK_URL` | Full deployed URL including `/webhook` path |

## Deploy sequence

Run in this order:

### 1. Authenticate with Cloudflare

```bash
npx wrangler login
```

### 2. Deploy worker + Durable Object

```bash
npm install
npm run deploy
```

Record the workers.dev URL from the deploy output, e.g. `https://kirana-telechat.<account-subdomain>.workers.dev`

### 3. Set secrets (after worker exists)

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

Values must match what you put in `.dev.vars` locally.

### 4. Register Telegram webhook

Use the full URL with `/webhook` path. Values from `.dev.vars`:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<WORKER_WEBHOOK_URL>" \
  -d "secret_token=<WEBHOOK_SECRET>" \
  -d "allowed_updates=[\"message\",\"callback_query\"]"
```

Example `WORKER_WEBHOOK_URL`:

```
https://kirana-telechat.<account-subdomain>.workers.dev/webhook
```

Verify:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

The `url` in the response **must** end with `/webhook` (not the workers.dev origin alone).

### 5. Run tests (including production integration)

With `.dev.vars` present:

```bash
npm run typecheck
npm test
```

Production integration tests POST to `WORKER_WEBHOOK_URL` with real secrets. Without `.dev.vars`, unit tests still run; integration tests skip with a clear message.

**HTTP 200 does NOT guarantee Telegram delivery.** The webhook returns 200 immediately after scheduling `ctx.waitUntil()`; delivery runs asynchronously. Check `wrangler tail` for transport `resultStatus` and runtime `terminalStatus`. After ledger Option A: `execution_ledger.telegram_delivered = 1` means Worker confirmed `sendMessage` succeeded.

### Synthetic test users

Integration tests POST fabricated webhook JSON directly to the Worker. Each `userId` becomes a `storeId` and gets its own Durable Object + SQLite.

Canonical constants live in [`src/worker-telegram-adapter/fixtures/test-identities.ts`](src/worker-telegram-adapter/fixtures/test-identities.ts).

**Set `TEST_CHAT_ID` in `.dev.vars` to your real Telegram chat ID** (see `.dev.vars.example`) so integration tests target a deliverable chat and your store DO — full pipeline including `confirmTelegramDelivery`.

| Constant | Value when `TEST_CHAT_ID` unset | Purpose |
|----------|----------------------------------|---------|
| `INTEGRATION_PROBE_USER_ID` | `900000001` (fake) | All store DO integration tests P1–P4 |
| `INTEGRATION_PROBE_MESSAGE` | `production integration probe` | Worker integration probe text |

When `TEST_CHAT_ID` is set, `INTEGRATION_PROBE_USER_ID` resolves to that value instead.

**Data Studio:** use `durableObjectId` from `wrangler tail`, not `storeId` or fake probe IDs.

**Verify P3 duplicate updateId in `wrangler tail`:**

- First request: runtime `terminalStatus: "ok"`, transport `resultStatus: "success"`
- Second request (same updateId): runtime `terminalStatus: "skipped_duplicate"`, transport `resultStatus: "skipped_delivery"`
- User must NOT receive two Telegram messages

**Data Studio after successful delivery:** `execution_ledger.handed_to_worker = 1`, `telegram_delivered = 1`, `result_json` populated on first processing.

**Part C (HTTP edge cases) and Part E (webhook security)** are automated in `production.integration.test.ts` — no manual curl required for those checks.

## Production validation checklist

### Part A — Telegram happy path (manual)

Execute in Telegram after deploy:

| Step | Action | Expected |
|------|--------|----------|
| 1 | Send plain text | `hi MF it's good to see you` |
| 2 | Send `/start` | Welcome message (shop assistant intro) |
| 3 | Send `/new` | Stub greeting (reset not yet implemented) |
| 4 | Send sticker or photo | `I only support text conversations right now.` |

### Part B — Multi-tenant (manual)

| Step | Action | Expected |
|------|--------|----------|
| 5 | Second Telegram account | Same stub greeting (separate DO instance) |

### Part C & E — HTTP edge cases and security (automated)

Run `npm test` with `.dev.vars` configured. See `production.integration.test.ts`:

| Check | Expected |
|-------|----------|
| C1 GET `/webhook` | 404 or 405 |
| C2 POST `/` (wrong path) | 404 |
| C3 Malformed JSON + valid secret | 400 |
| C4 Missing secret header | 403 |
| C5 / E2 Wrong secret | 403 |
| Valid POST `/webhook` | 200 |
| `getWebhookInfo` | URL ends with `/webhook`; no `last_error_message` |

### Part D — Observability (logs vs traces)

**Logs** and **traces** are different Cloudflare products in the Workers Observability UI:

| | **Logs** | **Traces** |
|---|----------|------------|
| What | `console.log` output, invocation metadata, errors | OpenTelemetry spans showing request flow through Worker + DO |
| Our usage | Transport JSON (`layer: "transport"`, `updateId`, `storeId`, …) via `console.log` | Optional; shows timing spans per request |
| Config | `[observability.logs] enabled = true` in `wrangler.toml` | `[observability.traces] enabled = true` (separate block) |
| Primary CLI | `npx wrangler tail` — **always works** for live `console.log` | Dashboard Traces tab (after enable + redeploy) |
| Dashboard | Workers & Pages → your Worker → **Observability → Logs** | Workers & Pages → your Worker → **Observability → Traces** |

If the dashboard sidebar says “deploy” or observability is not enabled:

1. Confirm `wrangler.toml` has the `[observability]` block (logs + traces sections).
2. **Redeploy** — observability settings apply only after `npm run deploy`.
3. For **logs**, `wrangler tail` is the reliable primary method; dashboard Logs may lag or require the worker to have received traffic after redeploy.

**Recommended for Part D validation:**

```bash
npx wrangler tail --format pretty
```

Send a Telegram message (or run `npm test` to hit the webhook), then look for JSON lines containing `"layer":"transport"`.

If the **Traces** tab still says deploy or is empty, you may need Wrangler 4+ (this project uses Wrangler 4) and `[observability.traces]` in `wrangler.toml`, then redeploy. **Logs** for transport JSON are the primary Part D check; traces are optional span visualization.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `getWebhookInfo` → `404 Not Found` | Webhook URL missing `/webhook` path |
| Worker 403, no DO traffic | `secret_token` in `setWebhook` ≠ `WEBHOOK_SECRET` in Wrangler |
| Dashboard Logs/Traces empty | Redeploy after `wrangler.toml` observability change; use `wrangler tail` for live logs |
| DO never invoked | Request never reached `POST /webhook` with valid secret |
| Integration tests skip | `.dev.vars` missing or `WORKER_WEBHOOK_URL` / `WEBHOOK_SECRET` not set |

## Live logs (Part D)

```bash
npx wrangler tail --format pretty
```

Look for JSON log lines with `"layer":"transport"`. This is the primary observability tool; dashboard Logs/Traces are supplementary after redeploy.

## Local development

```bash
npm run dev
```

For webhook testing against local dev, expose the dev server (e.g. ngrok) and point `WORKER_WEBHOOK_URL` in `.dev.vars` at the exposed `/webhook` URL. Production deployment remains the primary validation target.
