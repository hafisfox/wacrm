-- Add durable consent audit fields for WhatsApp booking and handoff forms.

alter table salu.customer_profiles
  add column if not exists data_sharing_consent boolean not null default false,
  add column if not exists data_sharing_consent_version text not null default '',
  add column if not exists data_sharing_consent_text text not null default '',
  add column if not exists data_sharing_consent_accepted_at timestamptz,
  add column if not exists privacy_policy_url text not null default '',
  add column if not exists terms_url text not null default '';

alter table salu.bookings
  add column if not exists data_sharing_consent boolean not null default false,
  add column if not exists data_sharing_consent_version text not null default '',
  add column if not exists data_sharing_consent_text text not null default '',
  add column if not exists data_sharing_consent_accepted_at timestamptz,
  add column if not exists privacy_policy_url text not null default '',
  add column if not exists terms_url text not null default '';

create or replace function salu.upsert_booking(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  starts_at_value timestamptz;
  ends_at_value timestamptz;
begin
  perform salu.expire_holds(now());

  starts_at_value := salu.booking_starts_at(payload);
  ends_at_value := starts_at_value + make_interval(mins => greatest(15, coalesce(nullif(payload->>'duration_minutes', '')::integer, 60)));

  insert into salu.bookings (
    booking_id, phone, wa_to, customer_name, service_id, service_label,
    service_ids, service_labels, service_details_json, service_assignment_ids,
    service_assignments_summary, service_assignments_json, stylist_ids, stylist_names,
    stylist_id, stylist_name,
    appointment_date, appointment_time, timezone, starts_at, ends_at, status, notes,
    reminder_24h_sent, reminder_1h_sent, source, calendar_event_id,
    calendar_event_link, calendar_status, calendar_updated_at, duration_minutes,
    payment_status, payment_reference_id, total_paise, deposit_paise, balance_paise,
    hold_expires_at, payment_link, data_sharing_consent,
    data_sharing_consent_version, data_sharing_consent_text,
    data_sharing_consent_accepted_at, privacy_policy_url, terms_url
  )
  values (
    payload->>'booking_id',
    payload->>'phone',
    coalesce(payload->>'wa_to', ''),
    coalesce(nullif(payload->>'customer_name', ''), 'Guest'),
    coalesce(payload->>'service_id', ''),
    coalesce(payload->>'service_label', ''),
    coalesce(payload->>'service_ids', ''),
    coalesce(payload->>'service_labels', ''),
    coalesce(nullif(payload->>'service_details_json', '')::jsonb, '[]'::jsonb),
    coalesce(payload->>'service_assignment_ids', ''),
    coalesce(payload->>'service_assignments_summary', ''),
    coalesce(nullif(payload->>'service_assignments_json', '')::jsonb, '[]'::jsonb),
    coalesce(payload->>'stylist_ids', ''),
    coalesce(payload->>'stylist_names', ''),
    payload->>'stylist_id',
    coalesce(payload->>'stylist_name', ''),
    (payload->>'appointment_date')::date,
    (payload->>'appointment_time')::time,
    coalesce(nullif(payload->>'timezone', ''), 'Asia/Kolkata'),
    starts_at_value,
    ends_at_value,
    payload->>'status',
    coalesce(payload->>'notes', ''),
    salu.as_bool(to_jsonb(payload->>'reminder_24h_sent'), false),
    salu.as_bool(to_jsonb(payload->>'reminder_1h_sent'), false),
    coalesce(nullif(payload->>'source', ''), 'whatsapp_flow'),
    coalesce(payload->>'calendar_event_id', ''),
    coalesce(payload->>'calendar_event_link', ''),
    coalesce(payload->>'calendar_status', ''),
    nullif(payload->>'calendar_updated_at', '')::timestamptz,
    greatest(15, coalesce(nullif(payload->>'duration_minutes', '')::integer, 60)),
    coalesce(payload->>'payment_status', ''),
    coalesce(payload->>'payment_reference_id', ''),
    coalesce(nullif(payload->>'total_paise', '')::integer, 0),
    coalesce(nullif(payload->>'deposit_paise', '')::integer, 0),
    coalesce(nullif(payload->>'balance_paise', '')::integer, 0),
    nullif(payload->>'hold_expires_at', '')::timestamptz,
    coalesce(payload->>'payment_link', ''),
    salu.as_bool(payload->'data_sharing_consent', false),
    coalesce(payload->>'data_sharing_consent_version', ''),
    coalesce(payload->>'data_sharing_consent_text', ''),
    coalesce(
      nullif(payload->>'data_sharing_consent_accepted_at', '')::timestamptz,
      case when salu.as_bool(payload->'data_sharing_consent', false) then now() else null end
    ),
    coalesce(payload->>'privacy_policy_url', ''),
    coalesce(payload->>'terms_url', '')
  )
  on conflict (booking_id) do update set
    phone = excluded.phone,
    wa_to = excluded.wa_to,
    customer_name = excluded.customer_name,
    service_id = excluded.service_id,
    service_label = excluded.service_label,
    service_ids = excluded.service_ids,
    service_labels = excluded.service_labels,
    service_details_json = excluded.service_details_json,
    service_assignment_ids = excluded.service_assignment_ids,
    service_assignments_summary = excluded.service_assignments_summary,
    service_assignments_json = excluded.service_assignments_json,
    stylist_ids = excluded.stylist_ids,
    stylist_names = excluded.stylist_names,
    stylist_id = excluded.stylist_id,
    stylist_name = excluded.stylist_name,
    appointment_date = excluded.appointment_date,
    appointment_time = excluded.appointment_time,
    timezone = excluded.timezone,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    notes = excluded.notes,
    reminder_24h_sent = excluded.reminder_24h_sent,
    reminder_1h_sent = excluded.reminder_1h_sent,
    source = excluded.source,
    calendar_event_id = excluded.calendar_event_id,
    calendar_event_link = excluded.calendar_event_link,
    calendar_status = excluded.calendar_status,
    calendar_updated_at = excluded.calendar_updated_at,
    duration_minutes = excluded.duration_minutes,
    payment_status = excluded.payment_status,
    payment_reference_id = excluded.payment_reference_id,
    total_paise = excluded.total_paise,
    deposit_paise = excluded.deposit_paise,
    balance_paise = excluded.balance_paise,
    hold_expires_at = excluded.hold_expires_at,
    payment_link = excluded.payment_link,
    data_sharing_consent = case when payload ? 'data_sharing_consent' then excluded.data_sharing_consent else salu.bookings.data_sharing_consent end,
    data_sharing_consent_version = case when payload ? 'data_sharing_consent_version' then excluded.data_sharing_consent_version else salu.bookings.data_sharing_consent_version end,
    data_sharing_consent_text = case when payload ? 'data_sharing_consent_text' then excluded.data_sharing_consent_text else salu.bookings.data_sharing_consent_text end,
    data_sharing_consent_accepted_at = case when payload ? 'data_sharing_consent_accepted_at' or payload ? 'data_sharing_consent' then coalesce(excluded.data_sharing_consent_accepted_at, salu.bookings.data_sharing_consent_accepted_at) else salu.bookings.data_sharing_consent_accepted_at end,
    privacy_policy_url = case when payload ? 'privacy_policy_url' then excluded.privacy_policy_url else salu.bookings.privacy_policy_url end,
    terms_url = case when payload ? 'terms_url' then excluded.terms_url else salu.bookings.terms_url end;

  perform salu.sync_booking_segments(payload->>'booking_id');

  return jsonb_build_object('ok', true, 'status', 'upserted', 'booking_id', payload->>'booking_id');
exception
  when exclusion_violation then
    insert into salu.audit_events(event_type, severity, booking_id, phone, summary, payload)
    values ('booking_overlap_rejected', 'warning', coalesce(payload->>'booking_id', ''), coalesce(payload->>'phone', ''), 'Active slot overlap rejected by database', payload);
    return jsonb_build_object('ok', false, 'status', 'slot_unavailable', 'booking_id', payload->>'booking_id');
end;
$$;

create or replace function salu.upsert_customer_profile(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  phone_value text := nullif(payload->>'phone', '');
  facts_value jsonb := case when jsonb_typeof(payload->'facts_json') = 'object' then payload->'facts_json' else '{}'::jsonb end;
  source_value jsonb := case when jsonb_typeof(payload->'source_metadata') = 'object' then payload->'source_metadata' else '{}'::jsonb end;
begin
  if phone_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_phone');
  end if;

  insert into salu.customer_profiles (
    phone, wa_to, customer_name, language, profile_summary,
    preferred_service_id, preferred_service_label, preferred_service_ids,
    preferred_services_summary, preferred_stylist_id, preferred_stylist_name,
    active_booking_id, pending_booking_id, pending_payment_reference_id,
    pending_payment_link, last_booking_id, last_intent, last_customer_message,
    last_seen_at, whatsapp_user_id, email, company, first_inbound_at,
    last_message_id, last_message_type, facts_json, source_metadata,
    data_sharing_consent, data_sharing_consent_version,
    data_sharing_consent_text, data_sharing_consent_accepted_at,
    privacy_policy_url, terms_url
  ) values (
    phone_value,
    coalesce(payload->>'wa_to', ''),
    coalesce(nullif(payload->>'customer_name', ''), 'Guest'),
    coalesce(nullif(payload->>'language', ''), 'en'),
    coalesce(payload->>'profile_summary', ''),
    coalesce(payload->>'preferred_service_id', ''),
    coalesce(payload->>'preferred_service_label', ''),
    coalesce(payload->>'preferred_service_ids', ''),
    coalesce(payload->>'preferred_services_summary', ''),
    coalesce(payload->>'preferred_stylist_id', ''),
    coalesce(payload->>'preferred_stylist_name', ''),
    coalesce(payload->>'active_booking_id', ''),
    coalesce(payload->>'pending_booking_id', ''),
    coalesce(payload->>'pending_payment_reference_id', ''),
    coalesce(payload->>'pending_payment_link', ''),
    coalesce(payload->>'last_booking_id', ''),
    coalesce(payload->>'last_intent', ''),
    coalesce(payload->>'last_customer_message', ''),
    nullif(payload->>'last_seen_at', '')::timestamptz,
    coalesce(payload->>'whatsapp_user_id', ''),
    lower(coalesce(payload->>'email', '')),
    coalesce(payload->>'company', ''),
    nullif(payload->>'first_inbound_at', '')::timestamptz,
    coalesce(payload->>'last_message_id', ''),
    coalesce(payload->>'last_message_type', ''),
    facts_value,
    source_value,
    salu.as_bool(payload->'data_sharing_consent', false),
    coalesce(payload->>'data_sharing_consent_version', ''),
    coalesce(payload->>'data_sharing_consent_text', ''),
    coalesce(
      nullif(payload->>'data_sharing_consent_accepted_at', '')::timestamptz,
      case when salu.as_bool(payload->'data_sharing_consent', false) then now() else null end
    ),
    coalesce(payload->>'privacy_policy_url', ''),
    coalesce(payload->>'terms_url', '')
  )
  on conflict (phone) do update set
    wa_to = coalesce(nullif(excluded.wa_to, ''), salu.customer_profiles.wa_to),
    customer_name = case when excluded.customer_name <> '' and lower(excluded.customer_name) <> 'guest' then excluded.customer_name else salu.customer_profiles.customer_name end,
    language = coalesce(nullif(excluded.language, ''), salu.customer_profiles.language),
    profile_summary = case when payload ? 'profile_summary' then excluded.profile_summary else salu.customer_profiles.profile_summary end,
    preferred_service_id = case when payload ? 'preferred_service_id' then excluded.preferred_service_id else salu.customer_profiles.preferred_service_id end,
    preferred_service_label = case when payload ? 'preferred_service_label' then excluded.preferred_service_label else salu.customer_profiles.preferred_service_label end,
    preferred_service_ids = case when payload ? 'preferred_service_ids' then excluded.preferred_service_ids else salu.customer_profiles.preferred_service_ids end,
    preferred_services_summary = case when payload ? 'preferred_services_summary' then excluded.preferred_services_summary else salu.customer_profiles.preferred_services_summary end,
    preferred_stylist_id = case when payload ? 'preferred_stylist_id' then excluded.preferred_stylist_id else salu.customer_profiles.preferred_stylist_id end,
    preferred_stylist_name = case when payload ? 'preferred_stylist_name' then excluded.preferred_stylist_name else salu.customer_profiles.preferred_stylist_name end,
    active_booking_id = case when payload ? 'active_booking_id' then excluded.active_booking_id else salu.customer_profiles.active_booking_id end,
    pending_booking_id = case when payload ? 'pending_booking_id' then excluded.pending_booking_id else salu.customer_profiles.pending_booking_id end,
    pending_payment_reference_id = case when payload ? 'pending_payment_reference_id' then excluded.pending_payment_reference_id else salu.customer_profiles.pending_payment_reference_id end,
    pending_payment_link = case when payload ? 'pending_payment_link' then excluded.pending_payment_link else salu.customer_profiles.pending_payment_link end,
    last_booking_id = case when payload ? 'last_booking_id' then excluded.last_booking_id else salu.customer_profiles.last_booking_id end,
    last_intent = case when payload ? 'last_intent' then excluded.last_intent else salu.customer_profiles.last_intent end,
    last_customer_message = case when payload ? 'last_customer_message' then excluded.last_customer_message else salu.customer_profiles.last_customer_message end,
    last_seen_at = greatest(coalesce(salu.customer_profiles.last_seen_at, '-infinity'::timestamptz), coalesce(excluded.last_seen_at, '-infinity'::timestamptz)),
    whatsapp_user_id = coalesce(nullif(excluded.whatsapp_user_id, ''), salu.customer_profiles.whatsapp_user_id),
    email = coalesce(nullif(excluded.email, ''), salu.customer_profiles.email),
    company = coalesce(nullif(excluded.company, ''), salu.customer_profiles.company),
    first_inbound_at = least(coalesce(salu.customer_profiles.first_inbound_at, excluded.first_inbound_at), coalesce(excluded.first_inbound_at, salu.customer_profiles.first_inbound_at)),
    last_message_id = coalesce(nullif(excluded.last_message_id, ''), salu.customer_profiles.last_message_id),
    last_message_type = coalesce(nullif(excluded.last_message_type, ''), salu.customer_profiles.last_message_type),
    facts_json = coalesce(salu.customer_profiles.facts_json, '{}'::jsonb) || excluded.facts_json,
    source_metadata = coalesce(salu.customer_profiles.source_metadata, '{}'::jsonb) || excluded.source_metadata,
    data_sharing_consent = case when payload ? 'data_sharing_consent' then excluded.data_sharing_consent else salu.customer_profiles.data_sharing_consent end,
    data_sharing_consent_version = case when payload ? 'data_sharing_consent_version' then excluded.data_sharing_consent_version else salu.customer_profiles.data_sharing_consent_version end,
    data_sharing_consent_text = case when payload ? 'data_sharing_consent_text' then excluded.data_sharing_consent_text else salu.customer_profiles.data_sharing_consent_text end,
    data_sharing_consent_accepted_at = case when payload ? 'data_sharing_consent_accepted_at' or payload ? 'data_sharing_consent' then coalesce(excluded.data_sharing_consent_accepted_at, salu.customer_profiles.data_sharing_consent_accepted_at) else salu.customer_profiles.data_sharing_consent_accepted_at end,
    privacy_policy_url = case when payload ? 'privacy_policy_url' then excluded.privacy_policy_url else salu.customer_profiles.privacy_policy_url end,
    terms_url = case when payload ? 'terms_url' then excluded.terms_url else salu.customer_profiles.terms_url end,
    updated_at = now();

  return jsonb_build_object('ok', true, 'status', 'upserted', 'phone', phone_value);
end;
$$;
