# Agent traceability & auditability

**Component 3 status:** Runtime behavior is **production-validated manually** (onboarding, GST confirmation with Yes/No buttons, instruction preferences including post-`/new` persistence, out-of-scope routing). Automated tests cover transport, Gemini connectivity, and unit-level rules (~40% of plan acceptance criteria by design — LLM UX and Telegram buttons require human judgment).

**This document** records what can be reconstructed from SQLite today, what cannot, and what **Component 4** must add so every run in [`queries.csv`](../queries.csv) is fully auditable without `wrangler tail`.

**Companion SQL:** [`sql/agent-trace.sql`](../sql/agent-trace.sql) — chronological timeline per `update_id` from persisted tables.

---

## What manual validation covers (queries.csv)

[`queries.csv`](../queries.csv) is the authoritative **manual traceability matrix** for Component 3 business behavior. Operator sign-off (as of C3 deploy):

| Area | IDs | Validated manually |
|------|-----|-------------------|
| Shop identity (first write, partial, replace + confirm/deny) | ONB-001–008 | Yes |
| Tax / GST (validation, confirm, deny, read) | ONB-009–018 | Yes |
| Agent instructions (append, replace, read, clarify) | ONB-019–023 | Yes |
| Cross-facet onboarding | ONB-024–026 | Yes |
| GO routing (out of scope, hello) | ONB-027–028 | Yes |
| `/start` transport | ONB-029–030 | Yes |
| Confirmation timeout (5 min default) | ONB-031 | Yes (or shortened timeout in test store) |
| Vague GST update (plan verify) | ONB-032 | Yes |
| **Instruction persistence across `/new`** | (implicit; ONB-019 + `/new` + English question → Hindi reply) | Yes |

**Not in queries.csv but manually verified:**

- Yes/No inline `callback_query` confirmation end-to-end (buttons work; Worker receives callbacks).
- Fast-ack webhook (200 before bot reply).
- Async delivery via DO alarm + `TelegramDeliveryService`.

---

## What SQLite can reconstruct today

For a given `update_id`, these tables provide a **partial** audit trail:

| Table | What it proves |
|-------|----------------|
| `work_queue` | Enqueue time, claim time, completion, `correlation_id`, failure |
| `execution_ledger` | Terminal status, `telegram_delivered`, cached `result_json`, failure reason |
| `conversation_turns` | User message + final assistant reply (`role` user/assistant) |
| `pending_confirmations` | Confirmation requested, display payload, pending write, resolved status, `callback_query_id` |
| `shop_profile` | **Current snapshot only** — not history of changes per run |

Run [`sql/agent-trace.sql`](../sql/agent-trace.sql) in D1 Data Studio (replace `update_id` in the `params` CTE). You get an ordered timeline of **persisted** events plus **inferred** placeholders for in-memory GO/MSP steps.

### Persisted end-to-end path (example: GST confirm)

```text
WORK_ENQUEUED → WORK_CLAIMED → USER_TURN_SAVED
  → CONFIRMATION_REQUESTED (pending_confirmations)
  → CONFIRMATION_RESOLVED (approved/denied/expired)
  → ASSISTANT_TURN_SAVED → RUN_LEDGER_RECORDED → WORK_COMPLETED
```

This is sufficient to prove **that** a sensitive write was proposed, how the user resolved it, and what the bot ultimately said — but not **why** the agent chose specific tools or what Gemini returned at each step.

---

## What is NOT traceable from SQLite alone (gaps)

These are the items **missing from agent traceability** even when manual E2E passes. They are **Component 4 requirements**, not C3 functional bugs.

### 1. LLM orchestration steps (largest gap)

Not persisted at runtime:

| Step | Layer | Today |
|------|-------|--------|
| Capability plan JSON | Global Orchestrator | In-memory only; inferred row in `agent-trace.sql` |
| Capability plan verification result | GO | In-memory only |
| Tool plan JSON | My Shop Profile | In-memory only |
| Tool plan verification result | MSP | In-memory only |
| Per-tool inputs/outputs (before confirm) | MSP tools | Only final write visible via `shop_profile` + `pending_confirmations` |
| GO decision mode output | GO | In-memory only |
| GO response generation prompt grounding | GO | Only final text in `conversation_turns` / `result_json` |

**Workaround today:** `wrangler tail` filtered by `correlation_id` from `work_queue` (see SQL step 2).

**C4 target:** Append-only `agent_trace_events` (evolve `orchestration_checkpoints`) — every REASON → VERIFY → EXECUTE step with JSON payload and timestamp.

### 2. `orchestration_checkpoints` table

- Schema exists ([`schema.ts`](../src/store-durable-object/persistence/schema.ts)).
- **Never written at runtime.**
- C4: dual-write events for audit + optional snapshot for DO eviction resume.

### 3. Confirmation UI message not in `conversation_turns`

- Deterministic confirmation **table + buttons** are sent via `TelegramDeliveryService.deliverConfirmation`.
- Only the **final** GO wrap-up is persisted as `role: assistant`.
- Gap: conversation replay in Data Studio does not show the confirmation message itself — only `pending_confirmations.display_payload_json`.

**C4 option:** Persist `assistant` turn when confirmation is delivered (or link `confirmation_id` on turn rows).

### 4. Profile change history

- `shop_profile` is one row per store (snapshot).
- Cannot answer “what was GSTIN before ONB-017 deny?” from SQLite alone — only current state.

**C4 option:** `shop_profile_history` or trace events on each applied write.

### 5. Transport vs runtime log lines

- Structured JSON logs (`layer: transport` / `layer: runtime`) go to **Workers Observability**, not SQLite.
- `agent-trace.sql` cannot show transport-before-runtime ordering without tail export.

**C4 option:** Optional `run_log_events` table or export pipeline; not required if tail retention is acceptable.

### 6. Gemini model / token metadata

- Model id: `gemini-3.6-flash` in [`global-orchestrator/constants.ts`](../src/global-orchestrator/constants.ts).
- Per-call latency, token counts, and raw request/response are not stored.

**C4 option:** Trace event per Gemini call with model, duration, and redacted prompt hash.

---

## Operational & documentation gaps (not runtime behavior)

These do not affect verified E2E behavior but should be updated for the next operator:

| Item | Status | Action |
|------|--------|--------|
| [`running.md`](../running.md) | Stale (still describes C1 `waitUntil`, stub `/new`) | Rewrite for C3 fast-ack, GO, `queries.csv`, `callback_query` webhook |
| Webhook `allowed_updates` in `running.md` / examples | May still show `["message"]` only | Document `["message","callback_query"]` (required for buttons; operator has this working) |
| `GEMINI_API_KEY` in deploy runbook | Partial | Add `wrangler secret put GEMINI_API_KEY` to running.md |
| Component 3 manual script in plan Part 12.3 | Superseded by `queries.csv` | Point running.md at `queries.csv` as canonical manual suite |

---

## Resilience & edge cases (deferred — not blocking C3 sign-off)

Manual happy path is complete; these are **known limitations** if you need harder guarantees:

| Scenario | Current behavior | Priority |
|----------|------------------|----------|
| DO isolate restarts during `waitForConfirmation` | Callback updates `pending_confirmations`; in-memory promise lost; write may not apply until retry | Medium — rare on CF |
| `callback_query.id` double-tap | Idempotent on `confirmation` row status `awaiting`; no explicit `callback_query_id` dedupe index | Low |
| `work_queue` row `failed` + Telegram retry same `update_id` | Re-enqueue blocked (PK exists) | Medium for billing later |
| Chat text `"yes"` during pending confirmation | Not treated as confirm (by design); may confuse user | UX doc only |
| `complete_autonomy` / `confirmation_timeout_ms` via chat | Schema defaults only; no preference tool yet | Low until user asks |
| Plain-text messages with embedded `bot_command` entities | `context_text` may not strip commands on non-command inbound | Low edge case |

---

## Automated test backlog (optional — does not block C3)

Manual `queries.csv` is the authority for business behavior. Useful additions if you want more CI signal without replacing manual runs:

| Test | Would cover |
|------|-------------|
| Simulated `callback_query` POST → 200 | Worker callback path (plan P6) |
| `work-queue-repository` unit tests | FIFO claim, status transitions |
| `alarm-scheduler` unit tests | `setAlarm` / clear when idle |
| Post-webhook poll `execution_ledger` / tail assertion | Async completion (plan P7) |
| `callback-parser` unit tests | `confirm:<uuid>:yes/no` parsing |

**Already covered:** no `waitUntil`, GSTIN validation, plan verification, delivery policy, Gemini G1/G2, HTTP 200 production suite.

---

## Component 4 acceptance (traceability complete)

Component 4 is **not done** until:

1. Every step in the recursive GO ↔ MSP loop writes an ordered trace event.
2. [`sql/agent-trace.sql`](../sql/agent-trace.sql) uses **only persisted rows** — no “in-memory, not persisted” placeholders.
3. Any row in [`queries.csv`](../queries.csv) can be fully reconstructed from SQLite alone (plus optional tail for debugging).
4. GO errors always set `execution_ledger.failure_reason` and a trace event (today some paths return generic user text with limited ledger detail).
5. Optional: profile history and confirmation message in `conversation_turns`.

Until then, **manual validation + partial SQL timeline + wrangler tail** is the correct operational model for Component 3.

---

## Quick reference

```text
Manual behavior matrix     → queries.csv
Partial SQL timeline       → sql/agent-trace.sql (set update_id)
LLM step detail (today)    → wrangler tail, filter correlation_id
Current profile snapshot   → shop_profile
Confirmation audit         → pending_confirmations
Full agent audit (future)  → Component 4 agent_trace_events
```
