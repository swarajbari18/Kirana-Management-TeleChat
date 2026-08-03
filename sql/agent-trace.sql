-- =============================================================================
-- HOW TO USE THIS FILE (read once)
-- =============================================================================
--
-- 1. Run STEP 0 below → pick your update_id from the results.
-- 2. Find-and-replace ALL occurrences of 261541057 with your update_id
--    (Ctrl+H in editor, or replace in each step before running).
-- 3. Run ONE step at a time. Copy from "-- STEP N" through the semicolon (;).
--    WITH params + SELECT is ONE query — select both lines together, then Run.
--
-- You do NOT run "params" and "query 1" separately. They are a single SQL statement.
--
-- =============================================================================


-- =============================================================================
-- STEP 0 — Find recent update_id (run this first, alone)
-- =============================================================================

SELECT update_id, raw_text, created_at
FROM conversation_turns
WHERE role = 'user'
ORDER BY created_at DESC
LIMIT 5;


-- C4.1: Respond path uses GroundedResponse JSON in RESPONSE_GENERATED (step go_grounded_response).
--       FAITHFULNESS_VERIFIED shows { lineCount, bindingCount } — no FAITHFULNESS_EXTRACT.
--       CAPABILITY_PLAN.parsed includes businessIntent.
-- See: docs/verified-facts-and-grounded-response.md

WITH params AS (
  SELECT 261541057 AS update_id
)
SELECT
  ate.seq AS step,
  ate.created_at AS event_time,
  ate.layer AS phase,
  ate.component,
  ate.stage AS event,
  ate.parent_event_id,
  ate.payload_json AS detail
FROM params p
JOIN agent_trace_events ate ON ate.update_id = p.update_id
ORDER BY ate.seq;


-- =============================================================================
-- STEP 2 — Work queue + execution ledger for this run
-- =============================================================================

WITH params AS (
  SELECT 261541057 AS update_id
)
SELECT
  wq.update_id,
  wq.correlation_id,
  wq.status AS queue_status,
  wq.enqueued_at,
  wq.started_at,
  wq.completed_at AS queue_completed_at,
  wq.failure_reason AS queue_failure,
  el.terminal_status,
  el.telegram_delivered,
  el.failure_reason AS ledger_failure,
  el.completed_at AS ledger_completed_at
FROM params p
JOIN work_queue wq ON wq.update_id = p.update_id
LEFT JOIN execution_ledger el ON el.update_id = p.update_id;


-- =============================================================================
-- STEP 3 — Conversation turns (user + bot messages)
-- =============================================================================

WITH params AS (
  SELECT 261541057 AS update_id
)
SELECT
  ct.role,
  ct.raw_text,
  ct.inbound_kind,
  ct.command,
  ct.created_at
FROM params p
JOIN conversation_turns ct ON ct.update_id = p.update_id
ORDER BY ct.created_at;


-- =============================================================================
-- STEP 4 — Confirmations (Yes/No buttons), if any
-- =============================================================================

WITH params AS (
  SELECT 261541057 AS update_id
)
SELECT
  pc.tool_name,
  pc.status,
  pc.display_payload_json,
  pc.pending_write_json,
  pc.created_at,
  pc.resolved_at
FROM params p
JOIN pending_confirmations pc ON pc.update_id = p.update_id;


-- =============================================================================
-- STEP 5 — Profile change history (only rows written on confirmed apply)
-- =============================================================================

WITH params AS (
  SELECT 261541057 AS update_id
)
SELECT
  sph.field,
  sph.old_value,
  sph.new_value,
  sph.applied_at
FROM params p
JOIN shop_profile_history sph ON sph.update_id = p.update_id
ORDER BY sph.applied_at;


-- =============================================================================
-- STEP 6 — Current shop profile snapshot (no update_id needed)
-- =============================================================================

SELECT
  shop_name,
  owner_name,
  gst_registered,
  gstin,
  instructions_json,
  updated_at
FROM shop_profile;


-- =============================================================================
-- STEP 7 — Nested trace (MSP children under CAPABILITY_INVOKED)
-- =============================================================================

WITH params AS (
  SELECT 261541057 AS update_id
)
SELECT
  parent.seq AS parent_seq,
  parent.stage AS parent_stage,
  child.seq AS child_seq,
  child.stage AS child_stage,
  child.component AS child_component
FROM params p
JOIN agent_trace_events parent
  ON parent.update_id = p.update_id AND parent.stage = 'CAPABILITY_INVOKED'
JOIN agent_trace_events child ON child.parent_event_id = parent.event_id
ORDER BY parent.seq, child.seq;
