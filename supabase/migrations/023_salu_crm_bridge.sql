-- ============================================================
-- 023_salu_crm_bridge
--
-- Mirrors the n8n-owned Salu WhatsApp event log into the public
-- wacrm inbox tables. n8n remains the Meta webhook owner; this bridge
-- gives the dashboard a real CRM transcript without moving booking
-- logic out of Salu/n8n.
-- ============================================================

CREATE OR REPLACE FUNCTION public.salu_default_crm_owner()
RETURNS TABLE(account_id UUID, user_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      wc.account_id,
      wc.user_id,
      CASE WHEN wc.status = 'connected' THEN 0 ELSE 1 END AS priority,
      COALESCE(wc.connected_at, wc.created_at) AS created_at
    FROM public.whatsapp_config wc
    WHERE wc.account_id IS NOT NULL
      AND wc.user_id IS NOT NULL

    UNION ALL

    SELECT
      p.account_id,
      p.user_id,
      CASE
        WHEN lower(COALESCE(p.email, '')) = 'hafisjavad@gmail.com' THEN 10
        WHEN lower(COALESCE(p.full_name, '')) = 'hafis' THEN 11
        WHEN lower(COALESCE(a.name, '')) = 'hafis' THEN 12
        ELSE 50
      END AS priority,
      p.created_at
    FROM public.profiles p
    LEFT JOIN public.accounts a ON a.id = p.account_id
    WHERE p.account_id IS NOT NULL
      AND p.user_id IS NOT NULL
  )
  SELECT candidates.account_id, candidates.user_id
  FROM candidates
  ORDER BY
    candidates.priority ASC,
    candidates.created_at DESC NULLS LAST
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.salu_default_crm_owner() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.salu_sync_message_event_to_crm(
  p_event_id TEXT,
  p_increment_unread BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, salu
AS $$
DECLARE
  v_event salu.message_events%ROWTYPE;
  v_owner RECORD;
  v_phone_key TEXT;
  v_contact_id UUID;
  v_conversation_id UUID;
  v_existing_message_id UUID;
  v_customer_name TEXT;
  v_content_text TEXT;
  v_content_type TEXT := 'text';
  v_sender_type TEXT := 'customer';
  v_message_status TEXT := 'delivered';
  v_interactive_reply_id TEXT := NULL;
  v_payload JSONB := '{}'::jsonb;
  v_internal_event_types CONSTANT TEXT[] := ARRAY[
    'payment_webhook',
    'payment_sweeper',
    'schema_setup',
    'setup'
  ];
BEGIN
  SELECT *
  INTO v_event
  FROM salu.message_events
  WHERE event_id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'missing_event');
  END IF;

  v_payload := COALESCE(v_event.payload, '{}'::jsonb);
  v_phone_key := regexp_replace(COALESCE(v_event.phone, ''), '\D', '', 'g');

  IF v_phone_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'missing_phone');
  END IF;

  IF lower(COALESCE(v_event.event_type, '')) = ANY (v_internal_event_types)
     AND COALESCE(v_payload->>'direction', '') <> 'outbound' THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'internal_event');
  END IF;

  SELECT *
  INTO v_owner
  FROM public.salu_default_crm_owner();

  IF NOT FOUND OR v_owner.account_id IS NULL OR v_owner.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'missing_crm_owner');
  END IF;

  SELECT COALESCE(NULLIF(cp.customer_name, ''), NULLIF(cs.customer_name, ''), 'Guest')
  INTO v_customer_name
  FROM (SELECT 1) seed
  LEFT JOIN salu.customer_profiles cp
    ON regexp_replace(cp.phone, '\D', '', 'g') = v_phone_key
  LEFT JOIN salu.customer_sessions cs
    ON regexp_replace(cs.phone, '\D', '', 'g') = v_phone_key
  LIMIT 1;

  v_customer_name := COALESCE(NULLIF(v_customer_name, ''), 'Guest');

  INSERT INTO public.contacts (
    account_id,
    user_id,
    phone,
    name,
    created_at,
    updated_at
  )
  VALUES (
    v_owner.account_id,
    v_owner.user_id,
    CASE WHEN COALESCE(v_event.phone, '') <> '' THEN v_event.phone ELSE '+' || v_phone_key END,
    CASE WHEN lower(v_customer_name) = 'guest' THEN NULL ELSE v_customer_name END,
    COALESCE(v_event.created_at, now()),
    now()
  )
  ON CONFLICT (account_id, phone_normalized)
    WHERE phone_normalized <> ''
  DO UPDATE SET
    name = CASE
      WHEN EXCLUDED.name IS NOT NULL AND EXCLUDED.name <> '' THEN EXCLUDED.name
      ELSE public.contacts.name
    END,
    updated_at = now()
  RETURNING id
  INTO v_contact_id;

  SELECT id
  INTO v_conversation_id
  FROM public.conversations
  WHERE account_id = v_owner.account_id
    AND contact_id = v_contact_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (
      account_id,
      user_id,
      contact_id,
      status,
      last_message_text,
      last_message_at,
      unread_count,
      created_at,
      updated_at
    )
    VALUES (
      v_owner.account_id,
      v_owner.user_id,
      v_contact_id,
      'open',
      NULL,
      NULL,
      0,
      COALESCE(v_event.created_at, now()),
      now()
    )
    RETURNING id
    INTO v_conversation_id;
  END IF;

  v_content_text := COALESCE(
    NULLIF(v_event.raw_text, ''),
    NULLIF(v_payload->>'text', ''),
    NULLIF(v_payload->>'body', ''),
    NULLIF(v_event.summary, ''),
    NULLIF(v_event.intent, ''),
    NULLIF(v_event.event_type, ''),
    '[WhatsApp event]'
  );

  IF lower(COALESCE(v_event.event_type, '')) = 'flow_reply' THEN
    v_content_type := 'interactive';
    v_interactive_reply_id := COALESCE(
      NULLIF(v_payload->>'interactive_reply_id', ''),
      NULLIF(v_payload->>'button_id', ''),
      NULLIF(v_event.intent, '')
    );
  END IF;

  v_sender_type := lower(COALESCE(v_payload->>'sender_type', ''));
  IF v_sender_type NOT IN ('customer', 'agent', 'bot') THEN
    IF lower(COALESCE(v_payload->>'direction', '')) = 'outbound'
       OR lower(COALESCE(v_event.event_type, '')) IN ('bot_message', 'outbound_message', 'outbound_bot', 'template_message')
       OR lower(COALESCE(v_event.route, '')) = 'outbound' THEN
      v_sender_type := 'bot';
    ELSE
      v_sender_type := 'customer';
    END IF;
  END IF;

  v_message_status := CASE
    WHEN v_sender_type = 'customer' THEN 'delivered'
    ELSE 'sent'
  END;

  SELECT id
  INTO v_existing_message_id
  FROM public.messages
  WHERE conversation_id = v_conversation_id
    AND message_id = v_event.event_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_existing_message_id IS NULL THEN
    INSERT INTO public.messages (
      conversation_id,
      sender_type,
      content_type,
      content_text,
      message_id,
      status,
      created_at,
      interactive_reply_id
    )
    VALUES (
      v_conversation_id,
      v_sender_type,
      v_content_type,
      v_content_text,
      v_event.event_id,
      v_message_status,
      COALESCE(v_event.created_at, now()),
      v_interactive_reply_id
    )
    RETURNING id
    INTO v_existing_message_id;

    UPDATE public.conversations
    SET
      last_message_text = v_content_text,
      last_message_at = COALESCE(v_event.created_at, now()),
      unread_count = CASE
        WHEN p_increment_unread AND v_sender_type = 'customer' THEN COALESCE(unread_count, 0) + 1
        ELSE COALESCE(unread_count, 0)
      END,
      updated_at = now()
    WHERE id = v_conversation_id;
  ELSE
    UPDATE public.messages
    SET
      sender_type = v_sender_type,
      content_type = v_content_type,
      content_text = v_content_text,
      status = v_message_status,
      interactive_reply_id = v_interactive_reply_id
    WHERE id = v_existing_message_id;

    UPDATE public.conversations
    SET
      last_message_text = v_content_text,
      last_message_at = GREATEST(
        COALESCE(last_message_at, '-infinity'::timestamptz),
        COALESCE(v_event.created_at, now())
      ),
      updated_at = now()
    WHERE id = v_conversation_id
      AND COALESCE(v_event.created_at, now()) >= COALESCE(last_message_at, '-infinity'::timestamptz);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id,
    'message_id', v_existing_message_id,
    'sender_type', v_sender_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.salu_sync_message_event_to_crm(TEXT, BOOLEAN) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.salu_message_event_crm_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, salu
AS $$
BEGIN
  PERFORM public.salu_sync_message_event_to_crm(NEW.event_id, TG_OP = 'INSERT');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.salu_message_event_crm_trigger() FROM PUBLIC;

DROP TRIGGER IF EXISTS salu_message_event_crm_bridge ON salu.message_events;
CREATE TRIGGER salu_message_event_crm_bridge
AFTER INSERT OR UPDATE ON salu.message_events
FOR EACH ROW
EXECUTE FUNCTION public.salu_message_event_crm_trigger();

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

-- Seed the inbox immediately when the migration is applied. The
-- function is idempotent; existing message rows are updated, not
-- duplicated, and backfill never bumps unread counts.
SELECT * FROM public.salu_backfill_crm_from_message_events();
