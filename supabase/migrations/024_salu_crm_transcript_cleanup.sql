-- Keep Salu booking bookkeeping out of the customer-facing transcript and
-- turn opaque WhatsApp Flow references into useful agent-facing labels.

CREATE OR REPLACE FUNCTION public.salu_crm_flow_reply_label(
  p_intent TEXT,
  p_fallback TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_intent, ''))
    WHEN 'payment_pending' THEN 'Booking details submitted'
    WHEN 'cancel' THEN 'Cancellation request submitted'
    WHEN 'weekend_not_bookable' THEN 'Selected date is unavailable'
    ELSE COALESCE(NULLIF(p_fallback, ''), 'WhatsApp Flow submitted')
  END
$$;

REVOKE ALL ON FUNCTION public.salu_crm_flow_reply_label(TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.salu_message_event_crm_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, salu
AS $$
DECLARE
  v_label TEXT;
BEGIN
  IF lower(COALESCE(NEW.event_type, '')) = ANY (ARRAY[
    'payment_claim',
    'payment_link',
    'payment_webhook',
    'payment_sweeper',
    'schema_setup',
    'setup'
  ]) AND COALESCE(NEW.payload->>'direction', '') <> 'outbound' THEN
    RETURN NEW;
  END IF;

  PERFORM public.salu_sync_message_event_to_crm(NEW.event_id, TG_OP = 'INSERT');

  IF lower(COALESCE(NEW.event_type, '')) = 'flow_reply' THEN
    v_label := public.salu_crm_flow_reply_label(NEW.intent, NEW.summary);

    UPDATE public.messages
    SET content_text = v_label
    WHERE message_id = NEW.event_id;

    UPDATE public.conversations c
    SET last_message_text = v_label,
        updated_at = now()
    FROM public.messages m
    WHERE m.message_id = NEW.event_id
      AND m.conversation_id = c.id
      AND m.created_at >= COALESCE(c.last_message_at, '-infinity'::timestamptz);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.salu_message_event_crm_trigger() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.salu_backfill_crm_from_message_events(
  p_limit INTEGER DEFAULT 10000
)
RETURNS TABLE(processed INTEGER, mirrored INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, salu
AS $$
DECLARE
  v_event RECORD;
  v_result JSONB;
BEGIN
  processed := 0;
  mirrored := 0;

  FOR v_event IN
    SELECT event_id
    FROM salu.message_events
    WHERE COALESCE(phone, '') <> ''
      AND NOT (
        lower(COALESCE(event_type, '')) = ANY (ARRAY[
          'payment_claim',
          'payment_link',
          'payment_webhook',
          'payment_sweeper',
          'schema_setup',
          'setup'
        ])
        AND COALESCE(payload->>'direction', '') <> 'outbound'
      )
    ORDER BY created_at ASC, event_id ASC
    LIMIT GREATEST(COALESCE(p_limit, 10000), 0)
  LOOP
    processed := processed + 1;
    v_result := public.salu_sync_message_event_to_crm(v_event.event_id, false);
    IF COALESCE((v_result->>'ok')::boolean, false) THEN
      mirrored := mirrored + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.salu_backfill_crm_from_message_events(INTEGER) FROM PUBLIC;

WITH deleted AS (
  DELETE FROM public.messages m
  USING salu.message_events e
  WHERE m.message_id = e.event_id
    AND lower(COALESCE(e.event_type, '')) IN (
      'payment_claim',
      'payment_link',
      'payment_webhook',
      'payment_sweeper',
      'schema_setup',
      'setup'
    )
    AND COALESCE(e.payload->>'direction', '') <> 'outbound'
  RETURNING m.conversation_id, m.sender_type
), removed_unread AS (
  SELECT conversation_id, count(*) FILTER (WHERE sender_type = 'customer') AS count
  FROM deleted
  GROUP BY conversation_id
)
UPDATE public.conversations c
SET unread_count = GREATEST(0, COALESCE(c.unread_count, 0) - r.count),
    updated_at = now()
FROM removed_unread r
WHERE c.id = r.conversation_id;

UPDATE public.messages m
SET content_text = public.salu_crm_flow_reply_label(e.intent, e.summary)
FROM salu.message_events e
WHERE m.message_id = e.event_id
  AND lower(COALESCE(e.event_type, '')) = 'flow_reply';

WITH latest AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.content_text,
    m.created_at
  FROM public.messages m
  ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
)
UPDATE public.conversations c
SET last_message_text = latest.content_text,
    last_message_at = latest.created_at,
    updated_at = now()
FROM latest
WHERE c.id = latest.conversation_id;
