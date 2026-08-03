-- Agent run trace (chronological)
-- Replace 261541044 with your update_id from conversation_turns or wrangler tail.
-- Spec: docs/agent-traceability-and-agent-state.md
--
-- LIMITATIONS (today):
--   GO capability plans, MSP tool plans, verify results, and Gemini outputs are
--   NOT persisted in SQLite. orchestration_checkpoints table exists but is empty.
--   For LLM-step detail, grep wrangler tail by correlation_id from step 2 below.

WITH params AS (
  SELECT 261541044 AS update_id
),

run AS (
  SELECT
    p.update_id,
    wq.correlation_id,
    wq.enqueued_at,
    wq.started_at,
    wq.completed_at AS queue_completed_at,
    wq.status         AS queue_status,
    wq.failure_reason AS queue_failure,
    wq.request_json,
    el.terminal_status,
    el.handed_to_worker,
    el.telegram_delivered,
    el.failure_reason AS ledger_failure,
    el.completed_at   AS ledger_completed_at,
    el.result_json
  FROM params p
  LEFT JOIN work_queue wq ON wq.update_id = p.update_id
  LEFT JOIN execution_ledger el ON el.update_id = p.update_id
),

events AS (
  -- 1. Webhook enqueued work
  SELECT
    10  AS sort_key,
    r.enqueued_at AS event_time,
    'transport'   AS phase,
    'worker → store_do' AS component,
    'WORK_ENQUEUED' AS event,
    'Telegram webhook accepted; request waiting for DO alarm' AS detail
  FROM run r
  WHERE r.enqueued_at IS NOT NULL

  UNION ALL

  -- 2. DO claimed work (correlation_id born here)
  SELECT
    20,
    r.started_at,
    'transport',
    'store_do:work_processor',
    'WORK_CLAIMED',
    'correlation_id=' || COALESCE(r.correlation_id, '(null)')
      || ' | queue_status=' || COALESCE(r.queue_status, '(null)')
  FROM run r
  WHERE r.started_at IS NOT NULL

  UNION ALL

  -- 3. User message persisted
  SELECT
    30,
    ct.created_at,
    'conversation',
    'conversation_manager',
    'USER_TURN_SAVED',
    'role=' || ct.role
      || ' | kind=' || ct.inbound_kind
      || COALESCE(' | command=/' || ct.command, '')
      || ' | text="' || ct.raw_text || '"'
  FROM run r
  JOIN conversation_turns ct ON ct.update_id = r.update_id AND ct.role = 'user'

  UNION ALL

  -- 4. Inferred: orchestration window (no per-step DB rows yet)
  SELECT
    40,
    r.started_at,
    'orchestration',
    'execution_manager',
    'ORCHESTRATION_STARTED',
    'Inbound: kind=' || COALESCE(json_extract(r.request_json, '$.inbound.kind'), '?')
      || COALESCE(', command=/' || json_extract(r.request_json, '$.inbound.command'), '')
      || ' | Routes to global_orchestrator (or /start handler)'
  FROM run r
  WHERE r.started_at IS NOT NULL
    AND COALESCE(json_extract(r.request_json, '$.inbound.command'), '') != 'start'

  UNION ALL

  SELECT
    41,
    r.started_at,
    'orchestration',
    'global_orchestrator',
    'GO_PIPELINE (in-memory, not persisted)',
    'REASON → planCapabilities (Gemini JSON)'
      || ' → VERIFY capability plan'
      || ' → EXECUTE my_shop_profile'
      || ' → DECIDE → GENERATE response'
  FROM run r
  WHERE r.started_at IS NOT NULL
    AND COALESCE(json_extract(r.request_json, '$.inbound.command'), '') != 'start'

  UNION ALL

  SELECT
    42,
    r.started_at,
    'orchestration',
    'my_shop_profile',
    'MSP_PIPELINE (in-memory, not persisted)',
    'REASON → planTools (Gemini JSON)'
      || ' → VERIFY tool plan + GST rules'
      || ' → EXECUTE tools (read / propose_* / instructions)'
  FROM run r
  WHERE r.started_at IS NOT NULL
    AND COALESCE(json_extract(r.request_json, '$.inbound.command'), '') != 'start'

  UNION ALL

  -- 5. Confirmation requested (if sensitive write)
  SELECT
    50,
    pc.created_at,
    'confirmation',
    pc.tool_name,
    'CONFIRMATION_REQUESTED',
    'status=' || pc.status
      || ' | pending_write=' || pc.pending_write_json
      || ' | display=' || pc.display_payload_json
  FROM run r
  JOIN pending_confirmations pc ON pc.update_id = r.update_id

  UNION ALL

  -- 6. User tapped Yes/No (blocks inside same run until resolved)
  SELECT
    60,
    pc.resolved_at,
    'confirmation',
    pc.tool_name,
    'CONFIRMATION_RESOLVED',
    'status=' || pc.status
      || COALESCE(' | callback_query_id=' || pc.callback_query_id, '')
  FROM run r
  JOIN pending_confirmations pc ON pc.update_id = r.update_id
  WHERE pc.resolved_at IS NOT NULL

  UNION ALL

  -- 7. Bot reply delivered + saved
  SELECT
    70,
    ct.created_at,
    'delivery',
    'telegram_delivery',
    'ASSISTANT_TURN_SAVED',
    'role=' || ct.role || ' | text="' || ct.raw_text || '"'
  FROM run r
  JOIN conversation_turns ct ON ct.update_id = r.update_id AND ct.role = 'assistant'

  UNION ALL

  -- 8. Execution ledger closed
  SELECT
    80,
    r.ledger_completed_at,
    'ledger',
    'execution_manager',
    'RUN_LEDGER_RECORDED',
    'terminal_status=' || COALESCE(r.terminal_status, '(null)')
      || ' | handed_to_worker=' || COALESCE(CAST(r.handed_to_worker AS TEXT), '?')
      || ' | telegram_delivered=' || COALESCE(CAST(r.telegram_delivered AS TEXT), '?')
      || COALESCE(' | failure=' || r.ledger_failure, '')
      || ' | result_status=' || COALESCE(json_extract(r.result_json, '$.status'), '(null)')
      || COALESCE(' | bot_reply="' || json_extract(r.result_json, '$.messages[0].text') || '"', '')
  FROM run r
  WHERE r.ledger_completed_at IS NOT NULL

  UNION ALL

  -- 9. Work queue item finished
  SELECT
    90,
    r.queue_completed_at,
    'transport',
    'store_do:work_processor',
    'WORK_COMPLETED',
    'queue_status=' || COALESCE(r.queue_status, '(null)')
      || COALESCE(' | failure=' || r.queue_failure, '')
  FROM run r
  WHERE r.queue_completed_at IS NOT NULL
),

ordered AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY sort_key, event_time) AS step,
    sort_key,
    event_time,
    phase,
    component,
    event,
    detail,
    LAG(event_time) OVER (ORDER BY sort_key, event_time) AS prev_event_time
  FROM events
  WHERE event_time IS NOT NULL
)

SELECT
  step,
  event_time,
  CASE
    WHEN prev_event_time IS NOT NULL
    THEN CAST(
      ROUND((julianday(event_time) - julianday(prev_event_time)) * 86400000) AS INTEGER
    )
    ELSE NULL
  END AS ms_since_prev,
  phase,
  component,
  event,
  detail
FROM ordered
ORDER BY step;

-- ---------------------------------------------------------------------------
-- Companion: profile state AFTER this run (no history table — current snapshot only)
-- ---------------------------------------------------------------------------
-- SELECT shop_name, owner_name, gst_registered, gstin, instructions_json, updated_at
-- FROM shop_profile;
