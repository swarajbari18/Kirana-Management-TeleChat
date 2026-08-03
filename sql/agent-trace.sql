-- Agent run trace (chronological) — Component 4 persisted events
-- Replace :update_id with your update_id from conversation_turns or wrangler tail.
-- Spec: docs/agent-traceability-and-agent-state.md

-- ---------------------------------------------------------------------------
-- 1. Primary trace timeline (persisted harness events only)
-- ---------------------------------------------------------------------------
SELECT
  ate.seq AS step,
  ate.created_at AS event_time,
  ate.layer AS phase,
  ate.component,
  ate.stage AS event,
  ate.parent_event_id,
  ate.payload_json AS detail
FROM agent_trace_events ate
WHERE ate.update_id = :update_id
ORDER BY ate.seq;

-- ---------------------------------------------------------------------------
-- 2. Run context: work queue + ledger
-- ---------------------------------------------------------------------------
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
FROM work_queue wq
LEFT JOIN execution_ledger el ON el.update_id = wq.update_id
WHERE wq.update_id = :update_id;

-- ---------------------------------------------------------------------------
-- 3. Conversation turns for this run
-- ---------------------------------------------------------------------------
SELECT
  ct.role,
  ct.raw_text,
  ct.inbound_kind,
  ct.command,
  ct.created_at
FROM conversation_turns ct
WHERE ct.update_id = :update_id
ORDER BY ct.created_at;

-- ---------------------------------------------------------------------------
-- 4. Confirmations (if any)
-- ---------------------------------------------------------------------------
SELECT
  pc.tool_name,
  pc.status,
  pc.display_payload_json,
  pc.pending_write_json,
  pc.created_at,
  pc.resolved_at
FROM pending_confirmations pc
WHERE pc.update_id = :update_id;

-- ---------------------------------------------------------------------------
-- 5. Profile change history (post-confirmation applied writes only)
-- ---------------------------------------------------------------------------
SELECT
  sph.field,
  sph.old_value,
  sph.new_value,
  sph.applied_at
FROM shop_profile_history sph
WHERE sph.update_id = :update_id
ORDER BY sph.applied_at;

-- ---------------------------------------------------------------------------
-- 6. Current profile snapshot (after run)
-- ---------------------------------------------------------------------------
SELECT
  shop_name,
  owner_name,
  gst_registered,
  gstin,
  instructions_json,
  updated_at
FROM shop_profile;

-- ---------------------------------------------------------------------------
-- 7. Nested trace tree (MSP children under CAPABILITY_INVOKED)
-- ---------------------------------------------------------------------------
SELECT
  parent.seq AS parent_seq,
  parent.stage AS parent_stage,
  child.seq AS child_seq,
  child.stage AS child_stage,
  child.component AS child_component
FROM agent_trace_events parent
JOIN agent_trace_events child
  ON child.parent_event_id = parent.event_id
WHERE parent.update_id = :update_id
  AND parent.stage = 'CAPABILITY_INVOKED'
ORDER BY parent.seq, child.seq;
