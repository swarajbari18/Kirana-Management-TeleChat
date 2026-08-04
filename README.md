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
- **Stock decreases** are refused on register/update (`completed` + `refusalMessage`); permanent sale decreases use `commit_bill_sale` after billing finalize (5.3).
- **Allocate** holds stock aside for a customer (physical reserve) — not a billing draft and not auto on `add_item`. `quantity_on_hand` unchanged on reserve.
- **Movement ledger** — every stock increase writes an `inventory_movements` row in the same transaction.

### Eval

1. `wrangler deploy`
2. `npm run eval` (posts `evaluationqueries.csv` via webhook → DO)
3. Export traces; audit with `sql/agent-trace.sql` per `update_id`

C51 rows cover register (W1), update (W2), not-found read (W5), low stock (W6), refusal (W7), clarify (W3/W4), allocate (W10).

## Component 5.2 — Billing evaluation

Component 5.2 replaces the billing unavailable stub with three tools: `manage_draft_bill`, `finalize_bill`, `query_bill`.

- **Event-sourced drafts** — append-only `billing_draft_events`; draft focus = last-edited open draft (Policy A).
- **Bill-only finalize** — billing writes `billing_bills` + lines only; stock and khata are separate GO objectives (5.3).
- **Oversell guard** — finalize reads `on_hand − active_reservations`; refusal via `refusalMessage`.
- **Invoice artifact** — HTML attachment on `ExecutionResult.attachments` when `artifactsEnabled` (shop profile, default true).
- **Dummy bill** — `start_bill` with shop customer + `set_notes` for loose-pack write-offs (C52-007).

### Eval

1. `wrangler deploy` (applies migration `0005_component_5_2_billing`)
2. `npm run eval` (C52 rows in `evaluationqueries.csv`)
3. Human Pass on W1 (multi-objective sale trace) and W2 (oversell with reservation)

## Component 5.3 — Khata & sale orchestration

Component 5.3 adds the Khata BC (`query_khata`, `manage_khata_transaction`), `commit_bill_sale` in Inventory, and GO **sale collaboration invariant** (same-turn replan when post-finalize objectives are missing).

**Sale business operation** (typical cash sale):

```text
inventory (query) → billing (finalize) → inventory (commit_bill_sale)
```

Khata payment adds a fourth objective: `khata (record_credit_from_bill)` depending on billing.

- **Read/write boundaries** — billing never writes inventory or khata; each BC owns its tables.
- **Khata writes** always confirmed; never auto-create customer (confirmation instead).
- **Cross-objective facts** — dependent objectives receive `priorObjectiveResults` from completed billing.

### Eval

1. `wrangler deploy` (applies migration `0006_component_5_3_khata_orchestration`)
2. `npm run eval` (C53 + amended C52 rows)
3. Human Pass on W1–W4 and W7 minimum (see plan walkthroughs)

## Component 5.4 — Analytics

Component 5.4 replaces the analytics unavailable stub with a **direct deterministic executor** (no Capability blueprint / no inner Gemini). Single tool: `generate_analytics` (zero parameters) — always produces the full six-period IST analysis.

- **Read-only** — aggregates billing, inventory, and khata tables via `analytics-repository.ts`; never writes business data.
- **Chat summary** — daily scalars in `verifiedFacts` for faithfulness (~5–6 lines).
- **HTML artifact** — premium report with SVG charts; **always attached** when ≥1 finalized bill exists. **Ignores** `shop_profile.artifactsEnabled` (billing gate does not apply).
- **Empty shop** — `completed` + `refusalMessage`; no attachment, no invented figures.
- **`AnalysisSnapshot`** — shared type for 5.5 PPTX template (do not duplicate SQL in 5.5).

### Eval

1. `wrangler deploy`
2. `npm run eval` (C54 rows in `evaluationqueries.csv`)
3. Human Pass on W1–W5 minimum (daily sales, close the day, weekly deck phrasing, empty shop, narrow GST question)

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
