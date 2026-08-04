# Kirana-Management-TeleChat

Manage a Kirana store from a Telegram chat bot.

Component 1 delivers the **transport boundary**: a Cloudflare Worker that receives Telegram webhooks, routes each Telegram user to their own Store Durable Object, and delivers outbound replies via the Telegram Bot API.

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/system_Architecture.md](docs/system_Architecture.md) | Full system architecture |
| [docs/agent-traceability-and-agent-state.md](docs/agent-traceability-and-agent-state.md) | Agent state, traceability, harness model, C4 audit requirements |
| [docs/goals/component-01-worker-telegram-adapter.md](docs/goals/component-01-worker-telegram-adapter.md) | Component 1 goal document & acceptance criteria |
| [running.md](running.md) | Deploy, webhook setup, validation, troubleshooting |

## Architecture summary

```
Telegram → POST /webhook → Worker (stateless)
                              ↓ RPC
                    Store Durable Object (per user)
                              ↓
                    ExecutionResult → Telegram Bot API
```

- **Worker** (`src/worker-telegram-adapter/`) — webhook validation, update parsing, multi-tenant routing (`storeId = String(telegramUserId)`), `ApplicationRequest` normalization, async `waitUntil` handoff, outbound `sendMessage` / `sendDocument`.
- **Store Durable Object** (`src/store-durable-object/`) — stub in Component 1: `/start` → welcome; all other supported text → placeholder greeting. Grows into full store runtime in later components.
- **Contracts** (`src/worker-telegram-adapter/contracts/`) — `ApplicationRequest` and `ExecutionResult` (including attachment types) are the only Worker ↔ DO interface.

## Design decisions (Component 1)

| Topic | Decision |
|-------|----------|
| Tenancy | One Telegram `from.id` = one store = one DO (`idFromName(storeId)`) |
| Worker → DO | Cloudflare RPC `handleApplicationRequest` |
| Webhook timing | HTTP 200 after handoff; DO + Telegram outbound in `ctx.waitUntil()` |
| Unsupported inbound | No DO call; reply with fixed string; still 200 |
| Commands | `bot_command` entity detection (not regex) |
| Telegram types | `@grammyjs/types` only; thin `fetch`-based API client |
| Testing | Pure logic unit tests with real Update fixtures; integration against deployed worker (see `running.md`) |

## Project structure

```
src/
├── index.ts                    # Thin bootstrap (POST /webhook only)
├── worker-telegram-adapter/    # Component 1 — transport boundary
│   ├── contracts/              # ApplicationRequest, ExecutionResult
│   ├── telegram/               # Command parsing (bot_command entities)
│   ├── fixtures/               # Real-shaped Telegram Update JSON
│   ├── integration/            # Production integration tests
│   └── *.ts                    # Pipeline modules + colocated unit tests
└── store-durable-object/       # Component 3 stub (grows in later components)
```

Unit tests cover pure deterministic logic (parsers, normalizer, handler). Colocated as `*.test.ts`. Run with `npm test` — see [running.md](running.md) for full suite with `.dev.vars`.

## Bot status

| Field | Value |
|-------|-------|
| Bot @username | _(fill after BotFather creation)_ |
| Deployed URL | _(fill after `npm run deploy`)_ |
| Deploy status | _(fill after deploy)_ |

## User-facing strings (locked)

| Situation | Message |
|-----------|---------|
| Unsupported inbound | `I only support text conversations right now.` |
| Generic error | `We're facing some problems right now. Please try again later.` |
| Stub greeting | `hi MF it's good to see you` |

## Component 5.1 — Inventory evaluation

Component 5.1 replaces the inventory unavailable stub with four tools: `query_inventory`, `register_inventory`, `update_inventory`, `allocate_inventory`.

- **Exact-first search** — fuzzy/similar candidates appear only in clarification options, never as write identity.
- **SKU for writes** comes from prior `query_inventory` exact match in L1 agent state (blueprint tool-result map), not from LLM-invented `sku`.
- **Stock decreases** are refused on register/update (`completed` + `refusalMessage`); permanent decreases are Billing (5.2).
- **Allocate** manages reservation buffer only; `quantity_on_hand` unchanged on reserve.
- **Movement ledger** — every stock increase writes an `inventory_movements` row in the same transaction.

### Eval

1. `wrangler deploy`
2. `npm run eval` (posts `evaluationqueries.csv` via webhook → DO)
3. Export traces; audit with `sql/agent-trace.sql` per `update_id`

C51 rows cover register (W1), update (W2), not-found read (W5), low stock (W6), refusal (W7), clarify (W3/W4), allocate (W10).

## Component 5.0 evaluation

The 5.0 eval spine uses the **deployed Worker webhook → Store Durable Object** path (same as production). Traces in `agent_trace_events` are the evidence — not HTTP 200, not manual Telegram chat reading.

### Prerequisites

1. `wrangler deploy` with `GEMINI_API_KEY` set on the Worker
2. Copy `.dev.vars.example` → `.dev.vars` with `WORKER_WEBHOOK_URL`, `WEBHOOK_SECRET`
3. Run: `npm run eval:5.0`

The script posts each row in `queries-5.0.csv`, waits async DO processing (default 30s per query; override with `EVAL_WAIT_MS`), and prints `update_id` values for trace export.

### Trace audit

1. Export traces from the DO SQL console (same workflow as `explain your capabilities.csv`)
2. Run `sql/agent-trace.sql` per printed `update_id`
3. Score against rubric dimensions: routing, status honesty (`not_supported` / `unavailable` / `clarification_needed`), Decision action (`replan` / `ask_user` / `respond`), response grounding, no wrong writes

Walkthrough references: W1 (C50-001 inventory update), W2 (C50-002 stock check), W4 (C50-004 GST ask_user), W5 (C50-005 capabilities — no invented system capabilities).

### Known gaps (5.0)

- Meta questions ("what can you do?") — future `system_understanding` system capability (README note only)
- PDF delivery — Worker-only spike (`PDF-01`); full artifact pipeline deferred to 5.5
- Eval ≠ manual Telegram smoke testing; Telegram delivery during eval is an acceptable side effect

## Operations

See **[running.md](running.md)** for deploy, secrets, webhook registration, production validation, and `wrangler tail`.
