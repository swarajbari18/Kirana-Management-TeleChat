# Kirana Ops Agent


|                    |                                              |
| ------------------ | -------------------------------------------- |
| **Bot**            | `@kirana_tele_bot`           |
| **Demo — Part 1**  | *https://www.loom.com/share/95c89789a2eb448ab17f6fbbb348359e*              |
| **Demo — Part 2**  | *https://www.loom.com/share/b94c26b8270d410b921f55099a389625*              |
| **Demo — Part 3**  | *https://www.loom.com/share/f53c5e69a4a64a569228b75a8c28f3a8*              |
| **Why three parts?** | *I had to split this in three parts to show the working of the telegram kirana chat properly and manage the loom video time limit* |


---

## Runtime

One Telegram user = one Store Durable Object = one SQLite database. Everything for that shop runs single-threaded inside the DO. Two bills at once, or a bill plus a stock-in, queue up instead of corrupting stock.

The Worker only moves messages. It validates the webhook, routes by `from.id`, returns HTTP 200 fast, and sends replies later. Before any work starts, the Execution Manager checks `execution_ledger` for the `update_id`. Telegram redelivery hits that gate and stops. No double bill.

`/new` clears the chat session. Shop profile, preferences, inventory, bills, and khata stay. Conversation history feeds planning. Business data lives in SQLite and reloads every run.

---

## Control loop

The Global Orchestrator is a harness. TypeScript moves between phases. Gemini only produces structured output at fixed steps. The model never picks when to verify or execute. Business rules sit in code and tools, not in prompt hope.

### Global Orchestrator

`orchestrate()` runs until the request is done or the round cap hits:

```text
assemble context
  → plan capabilities (Gemini)
  → verify plan (code)
  → run the full plan (code, no LLM inside)
  → decide: replan, clarify, or respond (Gemini)
  → on respond: write answer + check fact bindings (code)
```

The execution engine finishes the whole plan before Decision Mode runs. If one objective needs clarification, independent objectives still run. Blocked dependents get skipped. There is no half-plan-then-decide path. Incomplete work means Decision picks `replan` and a new plan version.

Two ways to replan. They are not the same thing.


|                      | When                                   | What it fixes                                                                                |
| -------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Harness retry**    | Plan JSON fails verification           | The plan shape. Retries immediately. Skips Decision.                                         |
| **Strategic replan** | Objectives ran but the job is not done | The mapping from intent to objectives. Decision sends prior plan + results back to Planning. |


Harness retry caps (`MAX_GO_PLAN_VERIFY_RETRIES`) are separate from strategic round caps (`MAX_GO_GEMINI_ROUNDS`).

### Business capabilities

Each capability (inventory, billing, khata, etc.) runs a smaller version of the same loop: plan tools, verify, execute, return results. One GO call, one BC pass. BCs do not own the strategic replan loop. They hand evidence back to GO.

BC harness retry only covers bad tool plans and parameter grounding before execution. Example: inventory must call `query_inventory` before `update_inventory`. Plan verification and the tool-result map enforce that. The prompt does not ask the model to remember.

### How capabilities collaborate

Each capability owns its writes. Inventory owns stock and movements. Billing owns bills. Khata owns the credit ledger. A capability may read another domain's tables when it needs source-of-truth data. Billing reads `quantity_on_hand` to refuse oversell. It does not decrement stock. That is inventory's job.

**The sale refactor (5.2 → 5.3).** First working billing stuffed everything into one transaction. `finalizeBillTransaction` wrote the bill, decremented stock, and inserted khata rows in the same function. It worked in demos. It broke ownership. Stock logic lived inside billing. Khata customers were auto-created on finalize. You could not trace which subsystem made which change, and you could not replan a missing step because the work had already happened silently.

We locked the rule in `system_Architecture.md`: capabilities own their writes; business operations may span capabilities. Billing finalize now writes bill rows only. Stock drops in inventory's `commit_bill_sale`. Udhar posts in khata's `record_credit_sale`. Each step is a separate GO objective with explicit dependencies. Billing passes facts forward (`bill_id`, `payment_method`, line items). The dependent capability reads those facts. It does not reach into another module's repository.

Owner says: *"bill 5 Maggi on Ramesh's khata"*

```text
inventory   query_inventory          (resolve SKU)
billing     finalize_bill            (bill rows only; reads stock for oversell check)
inventory   commit_bill_sale         (depends on billing; writes sale movement)
khata       record_credit_sale       (depends on billing; payment is khata)
```

Owner says: *"put ₹500 on Ramesh's credit"*

```text
khata       manage_khata_transaction (manual_credit)
```

No billing. No inventory. The planner decides which capabilities join. The harness runs them in dependency order and passes verified facts between them.

Owner says: *"today's sales"*

```text
analytics   generate_analytics       (no parameters, no inner planner)
```

Here the collaboration pattern is fixed. Analytics always reads billing, inventory, and khata through one repository. No tool plan, no second LLM inside the capability. GO routes to `analytics`; code does the rest.

**Sale collaboration invariant.** If billing finalized but the plan skipped `commit_bill_sale` (or khata on an udhar bill), `checkSaleCollaborationInvariant` blocks Decision and forces a same-turn replan. Agent state is gone after the reply sends. The owner should not have to message again because the planner forgot a post-finalize step.

**Inside each capability, code runs first.** Billing resolves draft focus and replays the event log before the tool planner sees the request. Draft truth is `billing_draft_events`, not chat memory. Inventory writes resolve SKU from the last exact `query_inventory` match in agent state, not from a model-guessed id.

---

## Capabilities


| Capability     | Owns                           | Rule that matters                                                  |
| -------------- | ------------------------------ | ------------------------------------------------------------------ |
| `user_profile` | Shop name, GSTIN, reply prefs  | Confirmed writes only                                              |
| `inventory`    | Stock, reservations, movements | No stock decrease on register/update; sales use `commit_bill_sale` |
| `billing`      | Drafts, GST, finalized bills   | Oversell check at finalize: `on_hand` minus active reservations    |
| `khata`        | Credit ledger                  | Confirmed writes; no auto-create customer                          |
| `analytics`    | Sales and stock summaries      | Read only; PPTX from `AnalysisSnapshot`                            |


Credit and destructive writes wait for Telegram confirmation (`callback_query`). When something is ambiguous, Decision picks `clarify` and the model asks. No regex router behind it.

PDF invoices: Browser Run on internal HTML. Analysis deck: PptxGenJS. File bytes never enter the LLM.

---

## Context, harness, loop

Three separate design problems. Not three prompt layers.

**Context engineering** is what each LLM call sees. Agent state is the full run (in-memory `RunContext` plus persisted `agent_trace_events`). Each call gets a slice. Decision sees objective results after execution finishes, not raw tool logs. BC re-invoke gets the prior tool plan plus prior results. Without the original plan, feedback is useless. Gemini thinking stays in the trace. It does not feed the next step.

**Harness engineering** is the code around the model. Phase gates. Plan verification. Tool parameter contracts. Dependency scheduler. Confirmations. Fact registry. Binding verifier. Ledger. Traces. Invariants live here. Prompts set role boundaries. They do not list recipes like "always finalize before commit."

**Loop engineering** is who retries what. GO owns the strategic loop. BCs retry bad tool plans only. One plan-verify-execute pattern. One strategic control loop at the top.

**Faithfulness:** an NL claim extractor rejected correct answers (`name` vs `shopName`). Response generation now attaches fact bindings when it writes the answer. Code checks those bindings against the Verified Fact Registry. Do not verify natural language with natural language.

---

## Hard parts


| Problem              | Where it is enforced                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Grounding            | Tools return facts. Response binds to them. Code verifies before send.                   |
| Oversell             | `finalize_bill` refuses. Stock moves in `commit_bill_sale` only.                         |
| GST                  | Per-line HSN and slab in SQLite. CGST/SGST in billing executor. Breakup on bill and PDF. |
| Multi-turn bills     | Append-only draft events. Stock moves on finalize.                                       |
| Idempotency          | `execution_ledger` per `update_id`. Reservations carry `idempotency_key`.                |
| Concurrency          | Single-threaded DO per owner.                                                            |
| Guardrails           | Below-cost refused. Khata needs existing customer. Writes confirmed.                     |
| Artifacts            | PDF invoice and PPTX deck from agent tools.                                              |
| Memory across `/new` | `shop_profile` and instruction prefs load from SQLite, not chat history.                 |


---

## What traces taught us

Debug with `agent_trace_events` and [sql/agent-trace.sql](sql/agent-trace.sql) per `update_id`. HTTP 200 and tail logs are not enough.

- BC re-invoke was blind without the prior tool plan. Fixed with `bcInvocationLog` and reinvoke context slices in `RunContext`.
- Model called `set_customer` when the owner said finalize. Billing planner now treats drafting and finalizing as different outcomes.
- Tool parameter contracts validate shape and types before execution. Bad plans fail before SQLite writes.

Eval: `npm run eval` (webhook to DO, then audit traces). Deploy and ops: [running.md](running.md). Full design: [docs/system_Architecture.md](docs/system_Architecture.md).

**Gaps:** no system capability for "what can you do?" yet. Browser Run is billed separately from Workers.