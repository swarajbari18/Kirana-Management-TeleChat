# Agent traceability & agent state

**Component 4.1 status:** Faithfulness uses **grounded response + binding verifier** (no NL claim extractor). See [verified-facts-and-grounded-response.md](verified-facts-and-grounded-response.md).

**This document** defines **agent state** (what it is, why it exists, how it differs from conversation state), records what can be reconstructed from SQLite today, and specifies what **Component 4** must add so every run in [`queries.csv`](../queries.csv) is fully auditable without `wrangler tail`.

**Architecture reference:** [system_Architecture.md §6.18 — Agent State](system_Architecture.md#618-agent-state)

**Companion SQL:** [`sql/agent-trace.sql`](../sql/agent-trace.sql) — chronological timeline per `update_id` from persisted tables.

---

## Why agent state exists — harness, not reasoning engine

The Global Orchestrator is implemented as a **harness**, not as a monolithic LLM reasoning engine.

| Approach | Who owns the loop? | Measurable? | Predictable? |
|----------|-------------------|-------------|--------------|
| **ReAct / tool-calling agent** | The LLM decides: plan → act → observe → repeat | Hard — behaviour emerges from prompts | Low — phase transitions are probabilistic |
| **Harness (this system)** | TypeScript code owns phase transitions: REASON → VERIFY → EXECUTE → DECIDE → RESPOND | Yes — each phase is a named step with typed inputs/outputs | High — code enforces order and gates |

In a harness:

- **Code** orchestrates the loop. The LLM never decides “now verify” or “now execute.”
- **The LLM** produces **artifacts** at bounded steps: structured plan JSON, decision JSON, final natural language.
- **Deterministic code** verifies plans, dispatches capabilities/tools, and enforces gates before any side effect.

That design only works if we can answer production questions **without reproducing the run**:

- What plan did the agent make?
- Why did execution produce these verified facts?
- Where was the gap between intent and outcome (for replanning)?
- What did decision mode see when it chose clarify vs respond?

Those answers live in **agent state**, not in conversation state.

Verified business facts alone are **consequences** of execution. Replanning requires the **plan that produced them** — objectives, capability assignments, tool operations — so the system can compare *intended* vs *actual* and revise strategy.

---

## Agent state vs conversation state

These are **different categories of state** with different audiences, lifetimes, and persistence rules.

### Definitions

| | **Conversation state** | **Agent state** |
|---|---|---|
| **What it is** | The shop owner's dialogue with the product — user messages and final assistant replies | The versioned trace of what the harness did during one orchestration run |
| **Audience** | Owner (Telegram UI); next-turn dialogue continuity | Engineers, operators, decision/replan/response stages within the same run |
| **Contains** | `user` / `assistant` turns, session metadata | Plans, verification outcomes, capability invocations, tool steps, decisions, replans |
| **Is business truth?** | No — supports reasoning only | No — observability and orchestration evidence; business truth remains in capability persistence |
| **Versioned within a run?** | Append one user turn per message; one assistant turn at end | Append-only ordered events: v1 context → v2 plan → v3 verified → … |
| **Nested structure?** | Flat chronological turns | Tree: GO events with child Business Capability sub-traces |
| **Primary persistence (target)** | `conversation_turns` | `agent_trace_events` (C4; evolve `orchestration_checkpoints`) |
| **Used for replanning?** | Background context only (what the owner said) | **Required** — plan + verify + results at each version |
| **Used for product replay?** | **Yes** — this is the product I/O | **No** — engineering/audit view (LangSmith-style) |

### What the owner sees vs what we trace

```text
CONVERSATION STATE (product boundary)          AGENT STATE (engineering boundary)
────────────────────────────────────         ────────────────────────────────────
User: "Update my GST to 27AAAAA0000A1Z5"      v1 CONTEXT_ASSEMBLED
                                              v2 CAPABILITY_PLAN { objectives: [...] }
                                              v3 PLAN_VERIFIED { valid: true }
                                              v4 CAPABILITY_INVOKED → MSP child trace
                                                 msp_v1 TOOL_PLAN { operations: [...] }
                                                 msp_v2 TOOL_PLAN_VERIFIED
                                                 msp_v3 TOOL_EXECUTED propose_tax_...
                                                 msp_v4 CONFIRMATION_REQUESTED
                                                 msp_v5 CONFIRMATION_RESOLVED approved
                                              v5 DECISION { action: respond }
                                              v6 RESPONSE_GENERATED
Assistant: "Done — your GSTIN is now …"       (final text also in conversation_turns)
```

Conversation state is **complete input–output of the product**. Agent traceability targets **agency** — what the harness decided and why — not the dialogue transcript alone.

### Relationship to other state categories (architecture)

| Category | Role relative to agent state |
|----------|------------------------------|
| **Business state** | Outcome of deterministic execution (`shop_profile`, bills, inventory). Agent state references it; does not replace it. |
| **Owner state** | Long-lived preferences loaded into orchestration context. |
| **Runtime / execution state** | Correlation id, work queue, ledger — request lifecycle metadata; parent of agent trace rows. |
| **Pending execution state** | Cross-message suspension (draft bill, clarification checkpoint). May be **restored from** agent snapshot on resume. |

See [system_Architecture.md — Persistent State Model](system_Architecture.md#persistent-state-model).

---

## Harness loop and live agent state

Both the Global Orchestrator and each Business Capability run the **same abstract skeleton** at different scope:

```text
REASON (Gemini)     → structured plan JSON
VERIFY PLAN (code)  → accept / reject + diagnostics
EXECUTE (code)      → capability registry or tool dispatch
VERIFY RESULTS      → gates, verified facts
RETURN EVIDENCE     → parent continues (GO consumes CapabilityResult)
```

### Code owns transitions; LLM owns artifacts

```text
orchestrate()                    executeMyShopProfile()
     │                                    │
     ├─ planCapabilities()  [Gemini]      ├─ planTools()  [Gemini]
     ├─ verifyCapabilityPlan() [code]       ├─ verifyToolPlan() [code]
     ├─ executeCapabilityPlan() [code]      ├─ executeTool() [code switch]
     ├─ decideNextAction() [Gemini]         └─ return CapabilityResult
     └─ generateResponse() [Gemini]
```

The LLM is **not** responsible for moving from planning to execution. That boundary is the **deterministic software boundary** in §6.4.

### Live shared context vs per-step system messages

During one run, all harness steps share the same **orchestration context** (`OrchestrationContext`): session id, conversation turns, owner profile, inbound message, correlation id, etc. This is the **live input** every step reads.

Each LLM step uses a **different system message** — not one evolving Gemini thread with swapped instructions. Each call is **stateless**: `system_instruction` + single `user` content with context serialized into the user prompt.

| Step | System message role |
|------|---------------------|
| Planning (GO) | Constitution slice: planner identity, capability catalog, JSON schema, boundary rules |
| Planning (capability) | Constitution slice: tool catalog, parameter rules, JSON schema |
| Decision (GO) | Constitution slice: allowed actions (`respond` \| `clarify` \| later `continue` \| `replan`) |
| Response (GO) | Constitution slice: grounding rules — facts only, no invention |

**System messages are not long instruction manuals.** They are **minimal constitutional lines**: what this step *is*, what artifacts it may emit, and what catalog (capabilities/tools) applies. The full Global Orchestrator constitution lives in [system_Architecture.md §6.5](system_Architecture.md#65-orchestration-constitution); each step's prompt carries only the slice relevant to that phase.

**Agent state** records how context + each step's output evolved. **Conversation state** is not updated mid-loop with plans or decisions — only the final assistant message is persisted to `conversation_turns` after delivery.

### Grouping reasoning steps

Intent analysis, objective planning, and capability assignment may be **grouped into one Gemini call** (one JSON plan) when they share a single reasoning flow. The verifiable artifact is still the **plan JSON**; code verifies that artifact before execution. Similarly, a capability may group objective interpretation and tool planning into one call.

Grouping is an implementation choice. **Agent state must still record the artifact** (plan JSON, verification result) at the step boundary either way.

### What decision mode should reason over (target)

Decision and replanning require **agent state**, not verified facts alone:

| Input | Why |
|-------|-----|
| Original business intent / user message | What we were trying to achieve |
| **The plan that was made** | What we intended to execute |
| Plan verification outcome | Whether the plan was structurally valid |
| **Execution results** (`CapabilityResult[]`) | What actually happened |
| Remaining / blocked objectives | What is still open (full loop) |
| Prior trace versions (if replanned) | v1 plan → v1 results → v2 plan → … |

**Component 3 gap:** `decideNextAction` receives `capabilityResults` and current message only — not the plan, not conversation history, not prior replan versions. Full agent state persistence and enriched decision inputs are **Component 4**.

---

## Versioned agent state model (target)

Agent state is **append-only** and **versioned within a run**, keyed by `update_id` and `correlation_id`.

### Event shape (conceptual)

Each row is one transition:

| Field | Purpose |
|-------|---------|
| `event_id` | Unique event |
| `update_id` | Telegram update / work item |
| `correlation_id` | Request lifecycle id |
| `seq` | Monotonic order within run (v1, v2, v3…) |
| `parent_event_id` | Nullable — links MSP events under GO `CAPABILITY_INVOKED` |
| `layer` | `go` \| `capability` \| `verify` \| `transport` |
| `component` | e.g. `global_orchestrator`, `my_shop_profile` |
| `stage` | e.g. `CAPABILITY_PLAN`, `PLAN_VERIFIED`, `TOOL_EXECUTED` |
| `snapshot_json` | Structured payload at this point (plan, results, diagnostics) |
| `created_at` | Timestamp |

### Example timeline (GST confirm)

```text
seq  layer       component            stage                    snapshot (summary)
───  ──────────  ───────────────────  ───────────────────────  ──────────────────────────
 1   go          global_orchestrator  CONTEXT_ASSEMBLED        turns, profile, inbound
 2   go          global_orchestrator  CAPABILITY_PLAN          { objectives: [...] }
 3   verify      global_orchestrator  PLAN_VERIFIED            { valid: true }
 4   go          global_orchestrator  CAPABILITY_INVOKED       { objectiveId, capabilityId }
 5   capability  my_shop_profile      TOOL_PLAN                parent=4, { operations: [...] }
 6   verify      my_shop_profile      TOOL_PLAN_VERIFIED       parent=4, { valid: true }
 7   capability  my_shop_profile      TOOL_EXECUTED            parent=4, tool, inputs/outputs
 8   capability  my_shop_profile      CONFIRMATION_REQUESTED   parent=4, display_payload
 9   capability  my_shop_profile      CONFIRMATION_RESOLVED    parent=4, approved
10   go          global_orchestrator  DECISION                 { action: respond, plan, results }
11   go          global_orchestrator  RESPONSE_GENERATED       { text }
```

### Nested capability traces

Business Capability observability remains **owned by the capability** (Layer 3 in §6.13), but **referenced from the Global Orchestrator execution engine** so one query reconstructs the full tree — similar to LangSmith parent/child spans.

- GO trace: orchestration decisions, plans, decisions, response.
- MSP trace: tool plans, verifications, per-tool I/O, confirmation lifecycle.
- Link: `parent_event_id` + shared `correlation_id`.

Engineers filter by `update_id` and see the complete agency graph, not inferred placeholders.

### SQLite and the Durable Object

The Store Durable Object processes one request at a time per store. SQLite append-only trace writes are safe without complex concurrency control. Versioning serves **within-run evolution** (plan → execute → replan → execute), not multi-tenant locking.

Optional **latest snapshot** row (evolved `orchestration_checkpoints`) supports DO eviction resume mid-confirmation; append-only `agent_trace_events` remains the audit source of truth.

### LangSmith analogy

| LangSmith | This system |
|-----------|-------------|
| Run | One `update_id` / `correlation_id` orchestration cycle |
| Span | One `agent_trace_events` row (`stage` + `component`) |
| Parent span | GO `CAPABILITY_INVOKED` |
| Child spans | MSP `TOOL_PLAN`, `TOOL_EXECUTED`, … |
| Run tree | Ordered `seq` + `parent_event_id` |
| State at step | `snapshot_json` |

We trace **agency**, version the harness state, and keep **conversation state** as the owner-facing transcript.

---

## What manual validation covers (queries.csv)

[`queries.csv`](../queries.csv) is the authoritative **manual traceability matrix** for Component 3 **business behavior** (conversation/product boundary). Operator sign-off (as of C3 deploy):

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

`queries.csv` validates **what the owner experienced**. It does not by itself prove **why** the agent planned or executed as it did — that requires agent state (C4).

---

## What SQLite can reconstruct today

For a given `update_id`, these tables provide a **partial** audit trail:

| Table | What it proves |
|-------|----------------|
| `work_queue` | Enqueue time, claim time, completion, `correlation_id`, failure |
| `execution_ledger` | Terminal status, `telegram_delivered`, cached `result_json`, failure reason |
| `conversation_turns` | User message + final assistant reply (`role` user/assistant) — **conversation state only** |
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

This proves **that** a sensitive write was proposed, how the user resolved it, and what the bot ultimately said — but not **why** the agent chose specific tools or what Gemini returned at each harness step.

---

## What is NOT traceable from SQLite alone (gaps)

These are **Component 4 requirements**, not C3 functional bugs.

### 1. Agent state / LLM orchestration steps — **implemented in C4**

Persisted in `agent_trace_events` at runtime:

| Step | Layer | C4 |
|------|-------|-----|
| Context assembled | Global Orchestrator | `CONTEXT_ASSEMBLED` |
| Capability plan JSON | Global Orchestrator | `CAPABILITY_PLAN` + `LLM_INVOCATION` payload |
| Capability plan verification | GO | `PLAN_VERIFIED` / `PLAN_VERIFICATION_FAILED` |
| Tool plan JSON | My Shop Profile | `TOOL_PLAN` (nested under `CAPABILITY_INVOKED`) |
| Tool plan verification | MSP | `TOOL_PLAN_VERIFIED` / `TOOL_PLAN_VERIFICATION_FAILED` |
| Parameter grounding | MSP | `PARAMETER_GROUNDING_FAILED` |
| Per-tool execution | MSP tools | `TOOL_EXECUTED` |
| GO decision mode | GO | `DECISION` |
| GO response / faithfulness | GO | `RESPONSE_GENERATED`, `FAITHFULNESS_*` |
| Replan versions | GO | `planVersion` on payloads; append-only rows |

**Reconstruct:** [`sql/agent-trace.sql`](../sql/agent-trace.sql) — `SELECT * FROM agent_trace_events WHERE update_id = ? ORDER BY seq`.

### LLM invocation payload shape (C4)

```json
{
  "step": "go_plan | go_decision | go_grounded_response | bc_plan",
  "model": "gemini-3.6-flash",
  "invocation": { "systemInstruction": "...", "contents": [...] },
  "output": { "content": "...", "reasoning": "...", "parsed": {} },
  "usage": { "promptTokenCount": 0, "candidatesTokenCount": 0, "totalTokenCount": 0 },
  "durationMs": 0
}
```

Reasoning/thinking blocks are **trace-only** — never fed to the next harness step's `contents`.

### 2. `orchestration_checkpoints` table

- Schema exists ([`schema.ts`](../src/store-durable-object/persistence/schema.ts)).
- **Never written at runtime.**
- C4: dual-write — events for audit + optional latest snapshot for DO eviction resume.

### 3. Confirmation UI message not in `conversation_turns`

- Deterministic confirmation **table + buttons** are sent via `TelegramDeliveryService.deliverConfirmation`.
- Only the **final** GO wrap-up is persisted as `role: assistant`.
- Gap: conversation replay does not show the confirmation message — only `pending_confirmations.display_payload_json`.

**C4 option:** Persist `assistant` turn when confirmation is delivered (or link `confirmation_id` on turn rows). This is still **conversation** persistence, not a substitute for agent trace events.

### 4. Profile change history

- `shop_profile` is one row per store (snapshot).
- Cannot answer “what was GSTIN before ONB-017 deny?” from SQLite alone — only current state.

**C4 option:** `shop_profile_history` or trace events on each applied write.

### 5. Transport vs runtime log lines

- Structured JSON logs (`layer: transport` / `layer: runtime`) go to **Workers Observability**, not SQLite.
- `agent-trace.sql` cannot show transport-before-runtime ordering without tail export.

**C4 option:** Optional `run_log_events` table or export pipeline.

### 6. Gemini model / token metadata

- Model id: `gemini-3.6-flash` in [`global-orchestrator/constants.ts`](../src/global-orchestrator/constants.ts).
- Per-call latency, token counts, and raw request/response are not stored.

**C4 option:** Trace event per Gemini call with model, duration, and redacted prompt hash.

---

## Operational & documentation gaps (not runtime behavior)

| Item | Status | Action |
|------|--------|--------|
| [`running.md`](../running.md) | Stale (still describes C1 `waitUntil`, stub `/new`) | Rewrite for C3 fast-ack, GO, `queries.csv`, `callback_query` webhook |
| Webhook `allowed_updates` in `running.md` / examples | May still show `["message"]` only | Document `["message","callback_query"]` |
| `GEMINI_API_KEY` in deploy runbook | Partial | Add `wrangler secret put GEMINI_API_KEY` to running.md |
| Component 3 manual script in plan Part 12.3 | Superseded by `queries.csv` | Point running.md at `queries.csv` |

---

## Resilience & edge cases (deferred — not blocking C3 sign-off)

| Scenario | Current behavior | Priority |
|----------|------------------|----------|
| DO isolate restarts during `waitForConfirmation` | Callback updates `pending_confirmations`; in-memory promise lost; write may not apply until retry | Medium |
| `callback_query.id` double-tap | Idempotent on `confirmation` row status `awaiting` | Low |
| `work_queue` row `failed` + Telegram retry same `update_id` | Re-enqueue blocked (PK exists) | Medium |
| Chat text `"yes"` during pending confirmation | Not treated as confirm (by design) | UX doc only |
| `complete_autonomy` / `confirmation_timeout_ms` via chat | Schema defaults only | Low |
| Plain-text messages with embedded `bot_command` entities | `context_text` may not strip commands on non-command inbound | Low |

---

## Automated test backlog (optional — does not block C3)

| Test | Would cover |
|------|-------------|
| Simulated `callback_query` POST → 200 | Worker callback path |
| `work-queue-repository` unit tests | FIFO claim, status transitions |
| `alarm-scheduler` unit tests | `setAlarm` / clear when idle |
| Post-webhook poll `execution_ledger` / tail assertion | Async completion |
| `callback-parser` unit tests | `confirm:<uuid>:yes/no` parsing |

**Already covered:** no `waitUntil`, GSTIN validation, plan verification, delivery policy, Gemini G1/G2, HTTP 200 production suite.

---

## Component 4 acceptance (traceability & agent state complete)

Component 4 is **not done** until:

1. Every step in the recursive GO ↔ Business Capability loop appends an ordered `agent_trace_events` row with `snapshot_json`.
2. Nested capability events reference parent GO events via `parent_event_id`.
3. [`sql/agent-trace.sql`](../sql/agent-trace.sql) uses **only persisted rows** — no “in-memory, not persisted” placeholders.
4. Any row in [`queries.csv`](../queries.csv) can be fully reconstructed from SQLite alone (product behavior + agent agency).
5. Decision/replan inputs include plan + results + prior trace versions (not results alone).
6. GO errors always set `execution_ledger.failure_reason` and a trace event.
7. Optional: profile history; confirmation message in `conversation_turns`.

Until then, **manual validation + partial SQL timeline + wrangler tail** is the correct operational model for Component 3.

---

## Quick reference

```text
Product behavior matrix    → queries.csv
Conversation replay        → conversation_turns
Partial SQL timeline       → sql/agent-trace.sql (set update_id)
LLM / harness step detail  → agent_trace_events (+ wrangler tail for transport/runtime)
Current profile snapshot   → shop_profile
Confirmation audit         → pending_confirmations
Agent state (full tree)    → Component 4 agent_trace_events
Architecture definition    → system_Architecture.md §6.18
```
