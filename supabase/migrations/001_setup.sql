-- ============================================================
-- Salu + Dashboard Setup Schema (Consolidated from scratch)
-- ============================================================

-- Source: 001_salu_booking_db.sql

-- Salu Salon transactional booking state.
-- Apply once to the Postgres/Supabase database used by the n8n credential
-- named "Salu Booking DB".

create extension if not exists btree_gist;

create schema if not exists salu;

create or replace function salu.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists salu.customer_sessions (
  phone text primary key,
  wa_to text not null default '',
  language text not null default 'en',
  human_mode boolean not null default false,
  active_flow text not null default '',
  flow_token text not null default '',
  current_booking_id text not null default '',
  current_service_id text not null default '',
  current_booking_date date,
  current_booking_time time,
  customer_name text not null default 'Guest',
  last_intent text not null default '',
  summary text not null default '',
  pending_action text not null default '',
  pending_booking_id text not null default '',
  pending_payment_reference_id text not null default '',
  pending_payment_link text not null default '',
  pending_payment_gateway_link_id text not null default '',
  memory_json jsonb not null default '{}'::jsonb,
  last_payment_checked_at timestamptz,
  last_customer_message text not null default '',
  last_inbound_at timestamptz,
  handoff_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salu.customer_profiles (
  phone text primary key,
  wa_to text not null default '',
  customer_name text not null default 'Guest',
  language text not null default 'en',
  profile_summary text not null default '',
  preferred_service_id text not null default '',
  preferred_service_label text not null default '',
  preferred_service_ids text not null default '',
  preferred_services_summary text not null default '',
  preferred_stylist_id text not null default '',
  preferred_stylist_name text not null default '',
  active_booking_id text not null default '',
  pending_booking_id text not null default '',
  pending_payment_reference_id text not null default '',
  pending_payment_link text not null default '',
  last_booking_id text not null default '',
  last_intent text not null default '',
  last_customer_message text not null default '',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salu.bookings (
  booking_id text primary key,
  phone text not null,
  wa_to text not null default '',
  customer_name text not null default 'Guest',
  service_id text not null default '',
  service_label text not null default '',
  service_ids text not null default '',
  service_labels text not null default '',
  service_details_json jsonb not null default '[]'::jsonb,
  service_assignment_ids text not null default '',
  service_assignments_summary text not null default '',
  service_assignments_json jsonb not null default '[]'::jsonb,
  stylist_ids text not null default '',
  stylist_names text not null default '',
  stylist_id text not null,
  stylist_name text not null default '',
  appointment_date date not null,
  appointment_time time not null,
  timezone text not null default 'Asia/Kolkata',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  slot_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status text not null,
  notes text not null default '',
  reminder_24h_sent boolean not null default false,
  reminder_1h_sent boolean not null default false,
  source text not null default 'whatsapp_flow',
  calendar_event_id text not null default '',
  calendar_event_link text not null default '',
  calendar_status text not null default '',
  calendar_updated_at timestamptz,
  duration_minutes integer not null check (duration_minutes >= 15),
  payment_status text not null default '',
  payment_reference_id text not null default '',
  total_paise integer not null default 0 check (total_paise >= 0),
  deposit_paise integer not null default 0 check (deposit_paise >= 0),
  balance_paise integer not null default 0 check (balance_paise >= 0),
  hold_expires_at timestamptz,
  payment_link text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status in ('pending', 'confirmed', 'cancelled', 'expired', 'refund_required', 'verification_failed')),
  check (payment_status in ('', 'not_required', 'pending', 'paid', 'cancelled', 'expired', 'refund_required', 'verification_failed'))
);

alter table salu.bookings
  add column if not exists service_assignment_ids text not null default '',
  add column if not exists service_assignments_summary text not null default '',
  add column if not exists service_assignments_json jsonb not null default '[]'::jsonb,
  add column if not exists stylist_ids text not null default '',
  add column if not exists stylist_names text not null default '';

alter table salu.bookings
  drop constraint if exists salu_bookings_no_active_overlap;

create table if not exists salu.booking_segments (
  segment_id text primary key,
  booking_id text not null references salu.bookings(booking_id) on delete cascade,
  segment_index integer not null default 0,
  service_id text not null default '',
  service_label text not null default '',
  stylist_id text not null,
  stylist_name text not null default '',
  appointment_date date not null,
  appointment_time time not null,
  timezone text not null default 'Asia/Kolkata',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  slot_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  duration_minutes integer not null check (duration_minutes >= 15),
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status in ('pending', 'confirmed', 'cancelled', 'expired', 'refund_required', 'verification_failed'))
);

create unique index if not exists salu_booking_segments_booking_index_unique
  on salu.booking_segments(booking_id, segment_index);

alter table salu.booking_segments
  drop constraint if exists salu_booking_segments_no_active_overlap;

alter table salu.booking_segments
  add constraint salu_booking_segments_no_active_overlap
  exclude using gist (
    stylist_id with =,
    slot_range with &&
  )
  where (status in ('pending', 'confirmed'));

drop trigger if exists booking_segments_touch_updated_at on salu.booking_segments;
create trigger booking_segments_touch_updated_at
before update on salu.booking_segments
for each row execute function salu.touch_updated_at();

create table if not exists salu.payments (
  reference_id text primary key,
  booking_id text not null references salu.bookings(booking_id) on delete cascade,
  phone text not null default '',
  provider text not null default 'razorpay',
  mode text not null default 'payment_link',
  amount_paise integer not null default 0 check (amount_paise >= 0),
  currency text not null default 'INR',
  status text not null default 'pending',
  gateway_payment_link_id text not null default '',
  gateway_order_id text not null default '',
  gateway_payment_id text not null default '',
  gateway_method text not null default '',
  payment_link text not null default '',
  expires_at timestamptz,
  paid_at timestamptz,
  raw_update jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (currency = 'INR'),
  check (status in ('pending', 'paid', 'cancelled', 'expired', 'refund_required', 'verification_failed'))
);

create unique index if not exists salu_payments_gateway_payment_id_unique
  on salu.payments(gateway_payment_id)
  where gateway_payment_id <> '';

create table if not exists salu.message_events (
  event_id text primary key,
  phone text not null default '',
  wa_to text not null default '',
  event_type text not null default '',
  route text not null default '',
  status text not null default 'processed',
  intent text not null default '',
  summary text not null default '',
  raw_text text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salu.outbox_events (
  id bigserial primary key,
  idempotency_key text not null unique,
  booking_id text not null default '',
  channel text not null,
  purpose text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  provider_message_id text not null default '',
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salu.audit_events (
  id bigserial primary key,
  event_type text not null,
  severity text not null default 'info',
  booking_id text not null default '',
  reference_id text not null default '',
  phone text not null default '',
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists customer_sessions_touch_updated_at on salu.customer_sessions;
create trigger customer_sessions_touch_updated_at
before update on salu.customer_sessions
for each row execute function salu.touch_updated_at();

drop trigger if exists customer_profiles_touch_updated_at on salu.customer_profiles;
create trigger customer_profiles_touch_updated_at
before update on salu.customer_profiles
for each row execute function salu.touch_updated_at();

drop trigger if exists bookings_touch_updated_at on salu.bookings;
create trigger bookings_touch_updated_at
before update on salu.bookings
for each row execute function salu.touch_updated_at();

drop trigger if exists payments_touch_updated_at on salu.payments;
create trigger payments_touch_updated_at
before update on salu.payments
for each row execute function salu.touch_updated_at();

create or replace function salu.as_bool(value jsonb, default_value boolean default false)
returns boolean
language sql
immutable
as $$
select case
  when value is null then default_value
  when lower(trim(value #>> '{}')) in ('true', '1', 'yes', 'y') then true
  when lower(trim(value #>> '{}')) in ('false', '0', 'no', 'n', '') then false
  else default_value
end;
$$;

create or replace function salu.booking_starts_at(payload jsonb)
returns timestamptz
language sql
stable
as $$
select (
  ((payload->>'appointment_date')::date + (payload->>'appointment_time')::time)
  at time zone coalesce(nullif(payload->>'timezone', ''), 'Asia/Kolkata')
);
$$;

create or replace function salu.sync_booking_segments(p_booking_id text)
returns jsonb
language plpgsql
as $$
declare
  booking_record salu.bookings%rowtype;
  assignments jsonb;
  assignment jsonb;
  assignment_count integer;
  segment_index integer := 0;
  offset_minutes integer := 0;
  duration_value integer;
  stylist_value text;
  stylist_name_value text;
  service_value text;
  service_label_value text;
  segment_start timestamptz;
  segment_end timestamptz;
begin
  select * into booking_record
    from salu.bookings
   where booking_id = p_booking_id;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'missing_booking', 'booking_id', p_booking_id);
  end if;

  delete from salu.booking_segments where booking_id = p_booking_id;

  assignments := case
    when jsonb_typeof(booking_record.service_assignments_json) = 'array' then booking_record.service_assignments_json
    else '[]'::jsonb
  end;
  assignment_count := coalesce(jsonb_array_length(assignments), 0);

  if assignment_count = 0 then
    assignments := jsonb_build_array(jsonb_build_object(
      'service_id', booking_record.service_id,
      'service_label', booking_record.service_label,
      'stylist_id', booking_record.stylist_id,
      'stylist_name', booking_record.stylist_name,
      'duration_minutes', booking_record.duration_minutes,
      'offset_minutes', 0
    ));
  end if;

  for assignment in select value from jsonb_array_elements(assignments)
  loop
    duration_value := greatest(15, coalesce(nullif(assignment->>'duration_minutes', '')::integer, booking_record.duration_minutes, 60));
    offset_minutes := coalesce(nullif(assignment->>'offset_minutes', '')::integer, offset_minutes);
    stylist_value := coalesce(nullif(assignment->>'stylist_id', ''), booking_record.stylist_id);
    stylist_name_value := coalesce(nullif(assignment->>'stylist_name', ''), booking_record.stylist_name);
    service_value := coalesce(nullif(assignment->>'service_id', ''), booking_record.service_id);
    service_label_value := coalesce(nullif(assignment->>'service_label', ''), booking_record.service_label);
    segment_start := booking_record.starts_at + make_interval(mins => offset_minutes);
    segment_end := segment_start + make_interval(mins => duration_value);

    insert into salu.booking_segments (
      segment_id, booking_id, segment_index, service_id, service_label, stylist_id, stylist_name,
      appointment_date, appointment_time, timezone, starts_at, ends_at, duration_minutes, status
    )
    values (
      booking_record.booking_id || ':' || segment_index::text,
      booking_record.booking_id,
      segment_index,
      service_value,
      service_label_value,
      stylist_value,
      stylist_name_value,
      (segment_start at time zone booking_record.timezone)::date,
      (segment_start at time zone booking_record.timezone)::time,
      booking_record.timezone,
      segment_start,
      segment_end,
      duration_value,
      booking_record.status
    );

    segment_index := segment_index + 1;
    offset_minutes := offset_minutes + duration_value;
  end loop;

  return jsonb_build_object('ok', true, 'status', 'synced', 'booking_id', p_booking_id, 'segment_count', segment_index);
end;
$$;

do $$
declare
  booking_row record;
begin
  for booking_row in
    select booking_id from salu.bookings
  loop
    perform salu.sync_booking_segments(booking_row.booking_id);
  end loop;
end;
$$;

create or replace function salu.expire_holds(p_now timestamptz default now())
returns jsonb
language plpgsql
as $$
declare
  expired_count integer := 0;
begin
  update salu.bookings b
     set status = 'expired',
         payment_status = case when b.payment_status = 'paid' then 'refund_required' else 'expired' end,
         calendar_status = ''
   where b.status = 'pending'
     and b.hold_expires_at is not null
     and b.hold_expires_at <= p_now;

  get diagnostics expired_count = row_count;

  update salu.booking_segments s
     set status = b.status
    from salu.bookings b
   where s.booking_id = b.booking_id
     and b.status = 'expired';

  update salu.payments p
     set status = 'expired'
    from salu.bookings b
   where p.booking_id = b.booking_id
     and b.status = 'expired'
     and p.status = 'pending';

  return jsonb_build_object('ok', true, 'expired_count', expired_count);
end;
$$;

create or replace function salu.upsert_customer_session(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  phone_value text := nullif(payload->>'phone', '');
begin
  if phone_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_phone');
  end if;

  insert into salu.customer_sessions (
    phone, wa_to, language, human_mode, active_flow, flow_token,
    current_booking_id, current_service_id, current_booking_date, current_booking_time,
    customer_name, last_intent, summary, pending_action, pending_booking_id,
    pending_payment_reference_id, pending_payment_link, pending_payment_gateway_link_id,
    memory_json, last_payment_checked_at, last_customer_message, last_inbound_at,
    handoff_started_at
  )
  values (
    phone_value,
    coalesce(payload->>'wa_to', ''),
    coalesce(nullif(payload->>'language', ''), 'en'),
    salu.as_bool(to_jsonb(payload->>'human_mode'), false),
    coalesce(payload->>'active_flow', ''),
    coalesce(payload->>'flow_token', ''),
    coalesce(payload->>'current_booking_id', ''),
    coalesce(payload->>'current_service_id', ''),
    nullif(payload->>'current_booking_date', '')::date,
    nullif(payload->>'current_booking_time', '')::time,
    coalesce(nullif(payload->>'customer_name', ''), 'Guest'),
    coalesce(payload->>'last_intent', ''),
    coalesce(payload->>'summary', ''),
    coalesce(payload->>'pending_action', ''),
    coalesce(payload->>'pending_booking_id', ''),
    coalesce(payload->>'pending_payment_reference_id', ''),
    coalesce(payload->>'pending_payment_link', ''),
    coalesce(payload->>'pending_payment_gateway_link_id', ''),
    coalesce(nullif(payload->>'memory_json', '')::jsonb, '{}'::jsonb),
    nullif(payload->>'last_payment_checked_at', '')::timestamptz,
    coalesce(payload->>'last_customer_message', ''),
    nullif(payload->>'last_inbound_at', '')::timestamptz,
    nullif(payload->>'handoff_started_at', '')::timestamptz
  )
  on conflict (phone) do update set
    wa_to = excluded.wa_to,
    language = excluded.language,
    human_mode = excluded.human_mode,
    active_flow = excluded.active_flow,
    flow_token = excluded.flow_token,
    current_booking_id = excluded.current_booking_id,
    current_service_id = excluded.current_service_id,
    current_booking_date = excluded.current_booking_date,
    current_booking_time = excluded.current_booking_time,
    customer_name = excluded.customer_name,
    last_intent = excluded.last_intent,
    summary = excluded.summary,
    pending_action = excluded.pending_action,
    pending_booking_id = excluded.pending_booking_id,
    pending_payment_reference_id = excluded.pending_payment_reference_id,
    pending_payment_link = excluded.pending_payment_link,
    pending_payment_gateway_link_id = excluded.pending_payment_gateway_link_id,
    memory_json = excluded.memory_json,
    last_payment_checked_at = excluded.last_payment_checked_at,
    last_customer_message = excluded.last_customer_message,
    last_inbound_at = excluded.last_inbound_at,
    handoff_started_at = excluded.handoff_started_at;

  return jsonb_build_object('ok', true, 'status', 'upserted', 'phone', phone_value);
end;
$$;

create or replace function salu.upsert_customer_profile(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  phone_value text := nullif(payload->>'phone', '');
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
    last_seen_at
  )
  values (
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
    nullif(payload->>'last_seen_at', '')::timestamptz
  )
  on conflict (phone) do update set
    wa_to = excluded.wa_to,
    customer_name = excluded.customer_name,
    language = excluded.language,
    profile_summary = excluded.profile_summary,
    preferred_service_id = excluded.preferred_service_id,
    preferred_service_label = excluded.preferred_service_label,
    preferred_service_ids = excluded.preferred_service_ids,
    preferred_services_summary = excluded.preferred_services_summary,
    preferred_stylist_id = excluded.preferred_stylist_id,
    preferred_stylist_name = excluded.preferred_stylist_name,
    active_booking_id = excluded.active_booking_id,
    pending_booking_id = excluded.pending_booking_id,
    pending_payment_reference_id = excluded.pending_payment_reference_id,
    pending_payment_link = excluded.pending_payment_link,
    last_booking_id = excluded.last_booking_id,
    last_intent = excluded.last_intent,
    last_customer_message = excluded.last_customer_message,
    last_seen_at = excluded.last_seen_at;

  return jsonb_build_object('ok', true, 'status', 'upserted', 'phone', phone_value);
end;
$$;

create or replace function salu.upsert_message_event(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  event_id_value text := coalesce(nullif(payload->>'event_id', ''), nullif(payload->>'message_id', ''));
begin
  if event_id_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_event_id');
  end if;

  insert into salu.message_events (
    event_id, phone, wa_to, event_type, route, status, intent, summary, raw_text, payload
  )
  values (
    event_id_value,
    coalesce(payload->>'phone', ''),
    coalesce(payload->>'wa_to', ''),
    coalesce(payload->>'event_type', ''),
    coalesce(payload->>'route', ''),
    coalesce(nullif(payload->>'status', ''), 'processed'),
    coalesce(payload->>'intent', ''),
    coalesce(payload->>'summary', ''),
    coalesce(payload->>'raw_text', ''),
    payload
  )
  on conflict (event_id) do update set
    phone = excluded.phone,
    wa_to = excluded.wa_to,
    event_type = excluded.event_type,
    route = excluded.route,
    status = excluded.status,
    intent = excluded.intent,
    summary = excluded.summary,
    raw_text = excluded.raw_text,
    payload = excluded.payload,
    updated_at = now();

  return jsonb_build_object('ok', true, 'status', 'upserted', 'event_id', event_id_value);
end;
$$;

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
    hold_expires_at, payment_link
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
    coalesce(payload->>'payment_link', '')
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
    payment_link = excluded.payment_link;

  perform salu.sync_booking_segments(payload->>'booking_id');

  return jsonb_build_object('ok', true, 'status', 'upserted', 'booking_id', payload->>'booking_id');
exception
  when exclusion_violation then
    insert into salu.audit_events(event_type, severity, booking_id, phone, summary, payload)
    values ('booking_overlap_rejected', 'warning', coalesce(payload->>'booking_id', ''), coalesce(payload->>'phone', ''), 'Active slot overlap rejected by database', payload);
    return jsonb_build_object('ok', false, 'status', 'slot_unavailable', 'booking_id', payload->>'booking_id');
end;
$$;

create or replace function salu.upsert_payment(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  reference_value text := coalesce(nullif(payload->>'reference_id', ''), nullif(payload->>'payment_reference_id', ''));
begin
  if reference_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_reference_id');
  end if;

  insert into salu.payments (
    reference_id, booking_id, phone, provider, mode, amount_paise, currency,
    status, gateway_payment_link_id, gateway_order_id, gateway_payment_id,
    gateway_method, payment_link, expires_at, paid_at, raw_update
  )
  values (
    reference_value,
    payload->>'booking_id',
    coalesce(payload->>'phone', ''),
    coalesce(nullif(payload->>'provider', ''), 'razorpay'),
    coalesce(nullif(payload->>'mode', ''), 'payment_link'),
    coalesce(nullif(payload->>'amount_paise', '')::integer, 0),
    coalesce(nullif(payload->>'currency', ''), 'INR'),
    coalesce(nullif(payload->>'status', ''), 'pending'),
    coalesce(payload->>'gateway_payment_link_id', ''),
    coalesce(payload->>'gateway_order_id', ''),
    coalesce(payload->>'gateway_payment_id', ''),
    coalesce(payload->>'gateway_method', ''),
    coalesce(payload->>'payment_link', ''),
    nullif(payload->>'expires_at', '')::timestamptz,
    nullif(payload->>'paid_at', '')::timestamptz,
    coalesce(nullif(payload->>'raw_update', '')::jsonb, '{}'::jsonb)
  )
  on conflict (reference_id) do update set
    booking_id = excluded.booking_id,
    phone = excluded.phone,
    provider = excluded.provider,
    mode = excluded.mode,
    amount_paise = excluded.amount_paise,
    currency = excluded.currency,
    status = excluded.status,
    gateway_payment_link_id = excluded.gateway_payment_link_id,
    gateway_order_id = excluded.gateway_order_id,
    gateway_payment_id = excluded.gateway_payment_id,
    gateway_method = excluded.gateway_method,
    payment_link = excluded.payment_link,
    expires_at = excluded.expires_at,
    paid_at = excluded.paid_at,
    raw_update = excluded.raw_update;

  return jsonb_build_object('ok', true, 'status', 'upserted', 'reference_id', reference_value);
end;
$$;

create or replace function salu.create_booking_hold(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  booking_payload jsonb := coalesce(payload->'booking', payload);
  payment_payload jsonb := coalesce(payload->'payment', '{}'::jsonb);
  booking_result jsonb;
begin
  perform salu.expire_holds(now());
  booking_result := salu.upsert_booking(booking_payload);
  if not coalesce((booking_result->>'ok')::boolean, false) then
    return booking_result;
  end if;

  if coalesce(payment_payload->>'reference_id', '') <> '' then
    perform salu.upsert_payment(payment_payload);
  end if;
  if payload ? 'session' then
    perform salu.upsert_customer_session(payload->'session');
  end if;
  if payload ? 'profile' then
    perform salu.upsert_customer_profile(payload->'profile');
  end if;
  if payload ? 'message_event' then
    perform salu.upsert_message_event(payload->'message_event');
  end if;

  return jsonb_build_object('ok', true, 'status', 'reserved', 'booking_id', booking_payload->>'booking_id', 'payment_reference_id', payment_payload->>'reference_id');
end;
$$;

create or replace function salu.cancel_booking(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  booking_record salu.bookings%rowtype;
  paid boolean;
begin
  select * into booking_record
    from salu.bookings
   where booking_id = payload->>'booking_id'
     and (coalesce(payload->>'phone', '') = '' or phone = payload->>'phone')
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'no_active_booking');
  end if;

  paid := booking_record.payment_status = 'paid';

  update salu.bookings
     set status = 'cancelled',
         payment_status = case when paid then 'refund_required' else 'cancelled' end,
         calendar_status = case when calendar_event_id <> '' then 'queued_delete' else calendar_status end,
         calendar_updated_at = case when calendar_event_id <> '' then now() else calendar_updated_at end
   where booking_id = booking_record.booking_id;

  perform salu.sync_booking_segments(booking_record.booking_id);

  update salu.payments
     set status = case when paid then 'refund_required' else 'cancelled' end,
         raw_update = raw_update || jsonb_build_object('source', 'cancel_booking', 'paid', paid)
   where booking_id = booking_record.booking_id
     and status in ('pending', 'paid');

  return jsonb_build_object('ok', true, 'status', case when paid then 'refund_required' else 'cancelled' end, 'booking_id', booking_record.booking_id);
end;
$$;

create or replace function salu.reschedule_booking(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  booking_record salu.bookings%rowtype;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  new_date date := (payload->>'appointment_date')::date;
  new_time time := (payload->>'appointment_time')::time;
begin
  perform salu.expire_holds(now());

  select * into booking_record
    from salu.bookings
   where booking_id = payload->>'booking_id'
     and status in ('pending', 'confirmed')
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'no_active_booking');
  end if;

  starts_at_value := ((new_date + new_time) at time zone booking_record.timezone);
  ends_at_value := starts_at_value + make_interval(mins => booking_record.duration_minutes);

  update salu.bookings
     set appointment_date = new_date,
         appointment_time = new_time,
         starts_at = starts_at_value,
         ends_at = ends_at_value,
         reminder_24h_sent = false,
         reminder_1h_sent = false,
         calendar_status = case when status = 'confirmed' then 'queued_update' else calendar_status end,
         calendar_updated_at = case when status = 'confirmed' then now() else calendar_updated_at end
   where booking_id = booking_record.booking_id;

  perform salu.sync_booking_segments(booking_record.booking_id);

  return jsonb_build_object('ok', true, 'status', 'rescheduled', 'booking_id', booking_record.booking_id);
exception
  when exclusion_violation then
    insert into salu.audit_events(event_type, severity, booking_id, phone, summary, payload)
    values ('reschedule_overlap_rejected', 'warning', payload->>'booking_id', coalesce(payload->>'phone', ''), 'Reschedule slot overlap rejected by database', payload);
    return jsonb_build_object('ok', false, 'status', 'slot_unavailable', 'booking_id', payload->>'booking_id');
end;
$$;

create or replace function salu.confirm_payment(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  reference_value text := payload->>'reference_id';
  booking_record salu.bookings%rowtype;
  event_id_value text := coalesce(nullif(payload->>'provider_event_id', ''), 'payment_' || reference_value);
begin
  if reference_value is null or reference_value = '' then
    return jsonb_build_object('ok', false, 'status', 'missing_reference_id');
  end if;

  insert into salu.message_events(event_id, event_type, route, status, intent, summary, payload)
  values (event_id_value, 'payment_webhook', 'payment', 'processed', 'confirm_payment', reference_value, payload)
  on conflict (event_id) do nothing;

  if not found then
    return jsonb_build_object('ok', true, 'status', 'duplicate_event', 'reference_id', reference_value);
  end if;

  perform salu.expire_holds(now());

  select b.* into booking_record
    from salu.bookings b
    join salu.payments p on p.booking_id = b.booking_id
   where p.reference_id = reference_value
   for update of b;

  if not found then
    perform salu.upsert_payment(payload || jsonb_build_object('status', 'verification_failed'));
    return jsonb_build_object('ok', false, 'status', 'missing_booking', 'reference_id', reference_value);
  end if;

  if booking_record.status = 'confirmed' and booking_record.payment_status = 'paid' then
    return jsonb_build_object('ok', true, 'status', 'already_confirmed', 'booking_id', booking_record.booking_id);
  end if;

  update salu.payments
     set status = 'paid',
         gateway_payment_id = coalesce(nullif(payload->>'gateway_payment_id', ''), gateway_payment_id),
         gateway_order_id = coalesce(nullif(payload->>'gateway_order_id', ''), gateway_order_id),
         gateway_method = coalesce(nullif(payload->>'gateway_method', ''), gateway_method),
         paid_at = coalesce(nullif(payload->>'paid_at', '')::timestamptz, now()),
         raw_update = raw_update || payload
   where reference_id = reference_value;

  update salu.bookings
     set status = 'confirmed',
         payment_status = 'paid',
         calendar_event_id = case when calendar_event_id = '' then 'salu' || regexp_replace(lower(booking_id), '[^a-v0-9]', '', 'g') else calendar_event_id end,
         calendar_status = case when calendar_event_id = '' then 'queued_create' else calendar_status end,
         calendar_updated_at = now()
   where booking_id = booking_record.booking_id;

  perform salu.sync_booking_segments(booking_record.booking_id);

  return jsonb_build_object('ok', true, 'status', 'confirmed', 'booking_id', booking_record.booking_id, 'reference_id', reference_value);
exception
  when exclusion_violation then
    update salu.bookings
       set status = 'expired',
           payment_status = 'refund_required',
           calendar_status = ''
     where booking_id = booking_record.booking_id;
    perform salu.sync_booking_segments(booking_record.booking_id);
    update salu.payments
       set status = 'refund_required',
           raw_update = raw_update || jsonb_build_object('reason', 'paid_after_expired_unavailable')
     where reference_id = reference_value;
    return jsonb_build_object('ok', false, 'status', 'refund_required', 'booking_id', booking_record.booking_id, 'reference_id', reference_value);
end;
$$;

create or replace function salu.mark_reminder_sent(p_booking_id text, p_window text)
returns jsonb
language plpgsql
as $$
begin
  update salu.bookings
     set reminder_24h_sent = case when p_window = '24h' then true else reminder_24h_sent end,
         reminder_1h_sent = case when p_window = '1h' then true else reminder_1h_sent end
   where booking_id = p_booking_id;
  return jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'window', p_window);
end;
$$;

create or replace function salu.mark_calendar_result(payload jsonb)
returns jsonb
language plpgsql
as $$
begin
  update salu.bookings
     set calendar_status = coalesce(nullif(payload->>'calendar_status', ''), 'created'),
         calendar_event_id = coalesce(nullif(payload->>'calendar_event_id', ''), calendar_event_id),
         calendar_event_link = coalesce(nullif(payload->>'calendar_event_link', ''), calendar_event_link),
         calendar_updated_at = now()
   where booking_id = payload->>'booking_id';
  return jsonb_build_object('ok', true, 'booking_id', payload->>'booking_id');
end;
$$;

drop function if exists salu.active_bookings_for_date(date);

create or replace function salu.active_bookings_for_date(p_date date)
returns table (
  record_type text,
  booking_id text,
  phone text,
  wa_to text,
  customer_name text,
  service_id text,
  service_label text,
  service_ids text,
  service_labels text,
  service_assignment_ids text,
  service_assignments_summary text,
  service_assignments_json text,
  stylist_ids text,
  stylist_names text,
  stylist_id text,
  stylist_name text,
  appointment_date text,
  appointment_time text,
  timezone text,
  status text,
  duration_minutes integer,
  payment_status text,
  payment_reference_id text,
  hold_expires_at text,
  payment_link text,
  calendar_event_id text,
  calendar_status text,
  reminder_24h_sent text,
  reminder_1h_sent text
)
language sql
stable
as $$
select
  'booking',
  booking_id,
  phone,
  wa_to,
  customer_name,
  service_id,
  service_label,
  service_ids,
  service_labels,
  service_assignment_ids,
  service_assignments_summary,
  service_assignments_json::text,
  stylist_ids,
  stylist_names,
  stylist_id,
  stylist_name,
  appointment_date::text,
  to_char(appointment_time, 'HH24:MI'),
  timezone,
  status,
  duration_minutes,
  payment_status,
  payment_reference_id,
  coalesce(hold_expires_at::text, ''),
  payment_link,
  calendar_event_id,
  calendar_status,
  reminder_24h_sent::text,
  reminder_1h_sent::text
from salu.bookings
where appointment_date = p_date
  and (
    status = 'confirmed'
    or (status = 'pending' and (hold_expires_at is null or hold_expires_at > now()))
  );
$$;


-- Source: 002_salu_sheet_sync.sql

-- Supabase-first Google Sheets synchronization layer for Salu Salon.
-- Apply after sql/001_salu_booking_db.sql.

create schema if not exists salu;

create table if not exists salu.config (
  config_id text primary key default 'default',
  salon_name text not null default '',
  timezone text not null default 'Asia/Kolkata',
  owner_number text not null default '',
  address text not null default '',
  hours text not null default '',
  default_language text not null default 'en',
  bot_policy_text text not null default '',
  sheet_sync_id text not null default 'config:default',
  sheet_sync_hash text not null default '',
  sheet_sync_source text not null default 'database',
  sheet_sync_deleted boolean not null default false,
  sheet_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists salu_config_sheet_sync_id_unique
  on salu.config(sheet_sync_id)
  where sheet_sync_id <> '';

create table if not exists salu.services (
  service_id text primary key,
  service_name text not null default '',
  duration_minutes integer not null default 60,
  price_display text not null default '',
  price_paise integer not null default 0,
  deposit_paise integer not null default 0,
  payment_required boolean not null default true,
  payment_label text not null default '',
  active boolean not null default true,
  flow_order integer not null default 999,
  notes text not null default '',
  raw_row jsonb not null default '{}'::jsonb,
  sheet_sync_id text not null default '',
  sheet_sync_hash text not null default '',
  sheet_sync_source text not null default 'database',
  sheet_sync_deleted boolean not null default false,
  sheet_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists salu_services_sheet_sync_id_unique
  on salu.services(sheet_sync_id)
  where sheet_sync_id <> '';

create table if not exists salu.stylists (
  stylist_id text primary key,
  stylist_name text not null default '',
  specialty text not null default '',
  image_url text not null default '',
  image_alt text not null default '',
  bio text not null default '',
  skills_summary text not null default '',
  active boolean not null default true,
  flow_order integer not null default 999,
  notes text not null default '',
  raw_row jsonb not null default '{}'::jsonb,
  sheet_sync_id text not null default '',
  sheet_sync_hash text not null default '',
  sheet_sync_source text not null default 'database',
  sheet_sync_deleted boolean not null default false,
  sheet_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists salu_stylists_sheet_sync_id_unique
  on salu.stylists(sheet_sync_id)
  where sheet_sync_id <> '';

create table if not exists salu.stylist_services (
  stylist_service_id text primary key,
  stylist_id text not null default '',
  service_id text not null default '',
  active boolean not null default true,
  override_duration_minutes integer,
  override_price_paise integer,
  override_deposit_paise integer,
  skill_level text not null default '',
  flow_order integer not null default 999,
  notes text not null default '',
  raw_row jsonb not null default '{}'::jsonb,
  sheet_sync_id text not null default '',
  sheet_sync_hash text not null default '',
  sheet_sync_source text not null default 'database',
  sheet_sync_deleted boolean not null default false,
  sheet_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists salu_stylist_services_pair_unique
  on salu.stylist_services(stylist_id, service_id)
  where stylist_id <> '' and service_id <> '';

create unique index if not exists salu_stylist_services_sheet_sync_id_unique
  on salu.stylist_services(sheet_sync_id)
  where sheet_sync_id <> '';

create table if not exists salu.availability (
  availability_id text primary key,
  day_name text not null default '',
  open_time text not null default '',
  close_time text not null default '',
  slot_interval_minutes integer,
  blackout_date date,
  service_id text not null default '',
  active boolean not null default true,
  notes text not null default '',
  raw_row jsonb not null default '{}'::jsonb,
  sheet_sync_id text not null default '',
  sheet_sync_hash text not null default '',
  sheet_sync_source text not null default 'database',
  sheet_sync_deleted boolean not null default false,
  sheet_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists salu_availability_sheet_sync_id_unique
  on salu.availability(sheet_sync_id)
  where sheet_sync_id <> '';

create table if not exists salu.stylist_availability (
  stylist_availability_id text primary key,
  stylist_id text not null default '',
  day_name text not null default '',
  open_time text not null default '',
  close_time text not null default '',
  slot_interval_minutes integer,
  blackout_date date,
  effective_from date,
  effective_to date,
  active boolean not null default true,
  notes text not null default '',
  raw_row jsonb not null default '{}'::jsonb,
  sheet_sync_id text not null default '',
  sheet_sync_hash text not null default '',
  sheet_sync_source text not null default 'database',
  sheet_sync_deleted boolean not null default false,
  sheet_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists salu_stylist_availability_sheet_sync_id_unique
  on salu.stylist_availability(sheet_sync_id)
  where sheet_sync_id <> '';

create table if not exists salu.sheet_sync_state (
  sync_name text primary key,
  last_seen_at timestamptz,
  last_mirrored_at timestamptz,
  last_run_id bigint,
  last_status text not null default '',
  last_error text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists salu.sheet_sync_runs (
  id bigserial primary key,
  tab_name text not null default '',
  source text not null default '',
  row_count integer not null default 0,
  upserted_count integer not null default 0,
  soft_deleted_count integer not null default 0,
  error_count integer not null default 0,
  status text not null default 'success',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table salu.customer_sessions
  add column if not exists sheet_sync_id text,
  add column if not exists sheet_sync_hash text not null default '',
  add column if not exists sheet_sync_source text not null default 'database',
  add column if not exists sheet_sync_deleted boolean not null default false,
  add column if not exists sheet_synced_at timestamptz;

alter table salu.customer_profiles
  add column if not exists sheet_sync_id text,
  add column if not exists sheet_sync_hash text not null default '',
  add column if not exists sheet_sync_source text not null default 'database',
  add column if not exists sheet_sync_deleted boolean not null default false,
  add column if not exists sheet_synced_at timestamptz;

alter table salu.bookings
  add column if not exists sheet_sync_id text,
  add column if not exists sheet_sync_hash text not null default '',
  add column if not exists sheet_sync_source text not null default 'database',
  add column if not exists sheet_sync_deleted boolean not null default false,
  add column if not exists sheet_synced_at timestamptz,
  add column if not exists service_assignment_ids text not null default '',
  add column if not exists service_assignments_summary text not null default '',
  add column if not exists service_assignments_json jsonb not null default '[]'::jsonb,
  add column if not exists stylist_ids text not null default '',
  add column if not exists stylist_names text not null default '';

alter table salu.payments
  add column if not exists sheet_sync_id text,
  add column if not exists sheet_sync_hash text not null default '',
  add column if not exists sheet_sync_source text not null default 'database',
  add column if not exists sheet_sync_deleted boolean not null default false,
  add column if not exists sheet_synced_at timestamptz;

alter table salu.message_events
  add column if not exists sheet_sync_id text,
  add column if not exists sheet_sync_hash text not null default '',
  add column if not exists sheet_sync_source text not null default 'database',
  add column if not exists sheet_sync_deleted boolean not null default false,
  add column if not exists sheet_synced_at timestamptz;

update salu.customer_sessions
   set sheet_sync_id = coalesce(nullif(sheet_sync_id, ''), 'sessions:' || phone)
 where coalesce(sheet_sync_id, '') = '';

update salu.customer_profiles
   set sheet_sync_id = coalesce(nullif(sheet_sync_id, ''), 'customer_profiles:' || phone)
 where coalesce(sheet_sync_id, '') = '';

update salu.bookings
   set sheet_sync_id = coalesce(nullif(sheet_sync_id, ''), 'bookings:' || booking_id)
 where coalesce(sheet_sync_id, '') = '';

update salu.payments
   set sheet_sync_id = coalesce(nullif(sheet_sync_id, ''), 'payments:' || reference_id)
 where coalesce(sheet_sync_id, '') = '';

update salu.message_events
   set sheet_sync_id = coalesce(nullif(sheet_sync_id, ''), 'message_log:' || event_id)
 where coalesce(sheet_sync_id, '') = '';

create unique index if not exists salu_customer_sessions_sheet_sync_id_unique
  on salu.customer_sessions(sheet_sync_id)
  where coalesce(sheet_sync_id, '') <> '';

create unique index if not exists salu_customer_profiles_sheet_sync_id_unique
  on salu.customer_profiles(sheet_sync_id)
  where coalesce(sheet_sync_id, '') <> '';

create unique index if not exists salu_bookings_sheet_sync_id_unique
  on salu.bookings(sheet_sync_id)
  where coalesce(sheet_sync_id, '') <> '';

create unique index if not exists salu_payments_sheet_sync_id_unique
  on salu.payments(sheet_sync_id)
  where coalesce(sheet_sync_id, '') <> '';

create unique index if not exists salu_message_events_sheet_sync_id_unique
  on salu.message_events(sheet_sync_id)
  where coalesce(sheet_sync_id, '') <> '';

drop trigger if exists config_touch_updated_at on salu.config;
create trigger config_touch_updated_at
before update on salu.config
for each row execute function salu.touch_updated_at();

drop trigger if exists services_touch_updated_at on salu.services;
create trigger services_touch_updated_at
before update on salu.services
for each row execute function salu.touch_updated_at();

drop trigger if exists stylists_touch_updated_at on salu.stylists;
create trigger stylists_touch_updated_at
before update on salu.stylists
for each row execute function salu.touch_updated_at();

drop trigger if exists stylist_services_touch_updated_at on salu.stylist_services;
create trigger stylist_services_touch_updated_at
before update on salu.stylist_services
for each row execute function salu.touch_updated_at();

drop trigger if exists availability_touch_updated_at on salu.availability;
create trigger availability_touch_updated_at
before update on salu.availability
for each row execute function salu.touch_updated_at();

drop trigger if exists stylist_availability_touch_updated_at on salu.stylist_availability;
create trigger stylist_availability_touch_updated_at
before update on salu.stylist_availability
for each row execute function salu.touch_updated_at();

create or replace function salu.sheet_text(payload jsonb, key_name text, default_value text default '')
returns text
language sql
immutable
as $$
select coalesce(nullif(trim(payload->>key_name), ''), default_value);
$$;

create or replace function salu.sheet_int(payload jsonb, key_name text, default_value integer default null)
returns integer
language plpgsql
immutable
as $$
declare
  raw text := nullif(regexp_replace(coalesce(payload->>key_name, ''), '[^0-9-]', '', 'g'), '');
begin
  if raw is null then
    return default_value;
  end if;
  return raw::integer;
exception when others then
  return default_value;
end;
$$;

create or replace function salu.sheet_bool(payload jsonb, key_name text, default_value boolean default false)
returns boolean
language sql
immutable
as $$
select case
  when payload ? key_name then salu.as_bool(to_jsonb(payload->>key_name), default_value)
  else default_value
end;
$$;

create or replace function salu.sheet_date(payload jsonb, key_name text)
returns date
language plpgsql
immutable
as $$
declare
  raw text := nullif(trim(coalesce(payload->>key_name, '')), '');
begin
  if raw is null then
    return null;
  end if;
  return raw::date;
exception when others then
  return null;
end;
$$;

create or replace function salu.strip_sync_fields(payload jsonb)
returns jsonb
language sql
immutable
as $$
select coalesce(payload, '{}'::jsonb)
  - '_sync_id' - '_sync_hash' - '_sync_source' - '_sync_updated_at' - '_sync_deleted'
  - 'sheet_sync_id' - 'sheet_sync_hash' - 'sheet_sync_source' - 'sheet_synced_at' - 'sheet_sync_deleted';
$$;

create or replace function salu.sheet_row_hash(payload jsonb)
returns text
language sql
immutable
as $$
select md5(coalesce(salu.strip_sync_fields(payload), '{}'::jsonb)::text);
$$;

create or replace function salu.sheet_row_key(tab_name text, row_data jsonb)
returns text
language plpgsql
immutable
as $$
declare
  tab text := lower(trim(tab_name));
  explicit_id text := nullif(trim(coalesce(row_data->>'_sync_id', row_data->>'sheet_sync_id', '')), '');
  natural_id text := '';
begin
  if explicit_id is not null then
    return explicit_id;
  end if;

  natural_id := case tab
    when 'config' then 'default'
    when 'services' then salu.sheet_text(row_data, 'service_id', salu.sheet_text(row_data, 'id', ''))
    when 'stylists' then salu.sheet_text(row_data, 'stylist_id', salu.sheet_text(row_data, 'id', ''))
    when 'stylist_services' then concat_ws(':', salu.sheet_text(row_data, 'stylist_id', ''), salu.sheet_text(row_data, 'service_id', ''))
    when 'availability' then coalesce(
      nullif(trim(row_data->>'availability_id'), ''),
      nullif(concat_ws(':',
        salu.sheet_text(row_data, 'service_id', ''),
        lower(salu.sheet_text(row_data, 'day_name', '')),
        salu.sheet_text(row_data, 'blackout_date', ''),
        salu.sheet_text(row_data, 'open_time', ''),
        salu.sheet_text(row_data, 'close_time', '')
      ), '::::'),
      ''
    )
    when 'stylist_availability' then coalesce(
      nullif(trim(row_data->>'stylist_availability_id'), ''),
      nullif(concat_ws(':',
        salu.sheet_text(row_data, 'stylist_id', ''),
        lower(salu.sheet_text(row_data, 'day_name', '')),
        salu.sheet_text(row_data, 'blackout_date', ''),
        salu.sheet_text(row_data, 'effective_from', ''),
        salu.sheet_text(row_data, 'effective_to', ''),
        salu.sheet_text(row_data, 'open_time', ''),
        salu.sheet_text(row_data, 'close_time', '')
      ), '::::::'),
      ''
    )
    when 'sessions' then salu.sheet_text(row_data, 'phone', '')
    when 'customer_profiles' then salu.sheet_text(row_data, 'phone', '')
    when 'bookings' then salu.sheet_text(row_data, 'booking_id', '')
    when 'payments' then salu.sheet_text(row_data, 'reference_id', '')
    when 'message_log' then salu.sheet_text(row_data, 'message_id', salu.sheet_text(row_data, 'event_id', ''))
    else ''
  end;

  if natural_id = '' and tab in ('availability', 'stylist_availability') then
    natural_id := md5(salu.strip_sync_fields(row_data)::text);
  end if;

  if natural_id = '' then
    return '';
  end if;
  return tab || ':' || natural_id;
end;
$$;

create or replace function salu.sheet_row_deleted(row_data jsonb)
returns boolean
language sql
immutable
as $$
select salu.as_bool(to_jsonb(coalesce(row_data->>'_sync_deleted', row_data->>'sheet_sync_deleted')), false);
$$;

create or replace function salu.mark_sync_state(sync_name_value text, last_mirrored_value timestamptz default null, status_value text default 'success', error_value text default '')
returns void
language plpgsql
as $$
begin
  insert into salu.sheet_sync_state(sync_name, last_seen_at, last_mirrored_at, last_status, last_error, updated_at)
  values (sync_name_value, now(), last_mirrored_value, status_value, error_value, now())
  on conflict (sync_name) do update set
    last_seen_at = excluded.last_seen_at,
    last_mirrored_at = coalesce(excluded.last_mirrored_at, salu.sheet_sync_state.last_mirrored_at),
    last_status = excluded.last_status,
    last_error = excluded.last_error,
    updated_at = now();
end;
$$;

create or replace function salu.sync_sheet_snapshot(tab_name text, rows jsonb, source text default 'google_sheets')
returns jsonb
language plpgsql
as $$
declare
  tab text := lower(trim(tab_name));
  row_items jsonb := case when jsonb_typeof(rows) = 'array' then rows else jsonb_build_array(rows) end;
  row_data jsonb;
  sync_key text;
  hash_value text;
  now_value timestamptz := now();
  v_upserted_count integer := 0;
  v_soft_deleted_count integer := 0;
  v_error_count integer := 0;
  v_changed_count integer := 0;
  seen_keys text[] := array[]::text[];
  source_value text := coalesce(nullif(source, ''), 'google_sheets');
  booking_payload jsonb;
  existing_booking salu.bookings%rowtype;
  existing_payment salu.payments%rowtype;
  run_id bigint;
begin
  if tab not in (
    'config', 'services', 'stylists', 'stylist_services', 'availability', 'stylist_availability',
    'sessions', 'customer_profiles', 'bookings', 'payments', 'message_log'
  ) then
    raise exception 'Unsupported sheet sync tab: %', tab_name;
  end if;

  insert into salu.sheet_sync_runs(tab_name, source, row_count, status)
  values (tab, source_value, coalesce(jsonb_array_length(row_items), 0), 'running')
  returning id into run_id;

  for row_data in select value from jsonb_array_elements(row_items)
  loop
    begin
      row_data := coalesce(row_data, '{}'::jsonb);
      sync_key := salu.sheet_row_key(tab, row_data);
      if sync_key = '' then
        continue;
      end if;
      seen_keys := array_append(seen_keys, sync_key);
      hash_value := salu.sheet_row_hash(row_data);

      if source_value like 'google_sheets%'
         and lower(coalesce(row_data->>'_sync_source', '')) = 'supabase'
         and nullif(row_data->>'_sync_hash', '') = hash_value then
        continue;
      end if;

      if salu.sheet_row_deleted(row_data) then
        if tab = 'services' then
          update salu.services set active = false, sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id = sync_key or service_id = salu.sheet_text(row_data, 'service_id', '');
        elsif tab = 'stylists' then
          update salu.stylists set active = false, sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id = sync_key or stylist_id = salu.sheet_text(row_data, 'stylist_id', '');
        elsif tab = 'stylist_services' then
          update salu.stylist_services set active = false, sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id = sync_key;
        elsif tab = 'availability' then
          update salu.availability set active = false, sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id = sync_key;
        elsif tab = 'stylist_availability' then
          update salu.stylist_availability set active = false, sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id = sync_key;
        elsif tab = 'bookings' then
          update salu.bookings
             set status = case when payment_status = 'paid' then 'refund_required' when status = 'pending' then 'expired' else 'cancelled' end,
                 payment_status = case when payment_status = 'paid' then 'refund_required' when payment_status = 'pending' then 'expired' else payment_status end,
                 sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value
           where sheet_sync_id = sync_key or booking_id = salu.sheet_text(row_data, 'booking_id', '');
        elsif tab = 'payments' then
          update salu.payments
             set status = case when status = 'paid' then 'refund_required' when status = 'pending' then 'expired' else status end,
                 sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value
           where sheet_sync_id = sync_key or reference_id = salu.sheet_text(row_data, 'reference_id', '');
        elsif tab = 'sessions' then
          update salu.customer_sessions set sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id = sync_key or phone = salu.sheet_text(row_data, 'phone', '');
        elsif tab = 'customer_profiles' then
          update salu.customer_profiles set sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id = sync_key or phone = salu.sheet_text(row_data, 'phone', '');
        elsif tab = 'message_log' then
          update salu.message_events set sheet_sync_deleted = true, sheet_sync_hash = hash_value, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id = sync_key or event_id = salu.sheet_text(row_data, 'message_id', salu.sheet_text(row_data, 'event_id', ''));
        end if;
        v_soft_deleted_count := v_soft_deleted_count + 1;
        continue;
      end if;

      if tab = 'config' then
        insert into salu.config (
          config_id, salon_name, timezone, owner_number, address, hours, default_language, bot_policy_text,
          sheet_sync_id, sheet_sync_hash, sheet_sync_source, sheet_sync_deleted, sheet_synced_at
        )
        values (
          'default',
          salu.sheet_text(row_data, 'salon_name', 'Salu Salon'),
          salu.sheet_text(row_data, 'timezone', 'Asia/Kolkata'),
          salu.sheet_text(row_data, 'owner_number', ''),
          salu.sheet_text(row_data, 'address', ''),
          salu.sheet_text(row_data, 'hours', ''),
          salu.sheet_text(row_data, 'default_language', 'en'),
          salu.sheet_text(row_data, 'bot_policy_text', ''),
          sync_key, hash_value, source_value, false, now_value
        )
        on conflict (config_id) do update set
          salon_name = excluded.salon_name,
          timezone = excluded.timezone,
          owner_number = excluded.owner_number,
          address = excluded.address,
          hours = excluded.hours,
          default_language = excluded.default_language,
          bot_policy_text = excluded.bot_policy_text,
          sheet_sync_id = excluded.sheet_sync_id,
          sheet_sync_hash = excluded.sheet_sync_hash,
          sheet_sync_source = excluded.sheet_sync_source,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value;
      elsif tab = 'services' then
        if salu.sheet_text(row_data, 'service_id', '') = '' then continue; end if;
        insert into salu.services (
          service_id, service_name, duration_minutes, price_display, price_paise, deposit_paise,
          payment_required, payment_label, active, flow_order, notes, raw_row,
          sheet_sync_id, sheet_sync_hash, sheet_sync_source, sheet_sync_deleted, sheet_synced_at
        )
        values (
          salu.sheet_text(row_data, 'service_id', ''),
          salu.sheet_text(row_data, 'service_name', salu.sheet_text(row_data, 'name', '')),
          greatest(5, coalesce(salu.sheet_int(row_data, 'duration_minutes', null), salu.sheet_int(row_data, 'duration', 60), 60)),
          salu.sheet_text(row_data, 'price_display', salu.sheet_text(row_data, 'price', '')),
          coalesce(salu.sheet_int(row_data, 'price_paise', null), salu.sheet_int(row_data, 'amount_paise', 0), 0),
          coalesce(salu.sheet_int(row_data, 'deposit_paise', null), salu.sheet_int(row_data, 'advance_paise', 0), 0),
          salu.sheet_bool(row_data, 'payment_required', true),
          salu.sheet_text(row_data, 'payment_label', ''),
          salu.sheet_bool(row_data, 'active', true),
          coalesce(salu.sheet_int(row_data, 'flow_order', null), 999),
          salu.sheet_text(row_data, 'notes', ''),
          salu.strip_sync_fields(row_data),
          sync_key, hash_value, source_value, false, now_value
        )
        on conflict (service_id) do update set
          service_name = excluded.service_name,
          duration_minutes = excluded.duration_minutes,
          price_display = excluded.price_display,
          price_paise = excluded.price_paise,
          deposit_paise = excluded.deposit_paise,
          payment_required = excluded.payment_required,
          payment_label = excluded.payment_label,
          active = excluded.active,
          flow_order = excluded.flow_order,
          notes = excluded.notes,
          raw_row = excluded.raw_row,
          sheet_sync_id = excluded.sheet_sync_id,
          sheet_sync_hash = excluded.sheet_sync_hash,
          sheet_sync_source = excluded.sheet_sync_source,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value;
      elsif tab = 'stylists' then
        if salu.sheet_text(row_data, 'stylist_id', '') = '' then continue; end if;
        insert into salu.stylists (
          stylist_id, stylist_name, specialty, image_url, image_alt, bio, skills_summary,
          active, flow_order, notes, raw_row, sheet_sync_id, sheet_sync_hash, sheet_sync_source,
          sheet_sync_deleted, sheet_synced_at
        )
        values (
          salu.sheet_text(row_data, 'stylist_id', ''),
          salu.sheet_text(row_data, 'stylist_name', salu.sheet_text(row_data, 'name', '')),
          salu.sheet_text(row_data, 'specialty', ''),
          salu.sheet_text(row_data, 'image_url', ''),
          salu.sheet_text(row_data, 'image_alt', ''),
          salu.sheet_text(row_data, 'bio', ''),
          salu.sheet_text(row_data, 'skills_summary', ''),
          salu.sheet_bool(row_data, 'active', true),
          coalesce(salu.sheet_int(row_data, 'flow_order', null), 999),
          salu.sheet_text(row_data, 'notes', ''),
          salu.strip_sync_fields(row_data),
          sync_key, hash_value, source_value, false, now_value
        )
        on conflict (stylist_id) do update set
          stylist_name = excluded.stylist_name,
          specialty = excluded.specialty,
          image_url = excluded.image_url,
          image_alt = excluded.image_alt,
          bio = excluded.bio,
          skills_summary = excluded.skills_summary,
          active = excluded.active,
          flow_order = excluded.flow_order,
          notes = excluded.notes,
          raw_row = excluded.raw_row,
          sheet_sync_id = excluded.sheet_sync_id,
          sheet_sync_hash = excluded.sheet_sync_hash,
          sheet_sync_source = excluded.sheet_sync_source,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value;
      elsif tab = 'stylist_services' then
        if salu.sheet_text(row_data, 'stylist_id', '') = '' or salu.sheet_text(row_data, 'service_id', '') = '' then continue; end if;
        insert into salu.stylist_services (
          stylist_service_id, stylist_id, service_id, active, override_duration_minutes, override_price_paise,
          override_deposit_paise, skill_level, flow_order, notes, raw_row, sheet_sync_id, sheet_sync_hash,
          sheet_sync_source, sheet_sync_deleted, sheet_synced_at
        )
        values (
          sync_key,
          salu.sheet_text(row_data, 'stylist_id', ''),
          salu.sheet_text(row_data, 'service_id', ''),
          salu.sheet_bool(row_data, 'active', true),
          salu.sheet_int(row_data, 'override_duration_minutes', null),
          salu.sheet_int(row_data, 'override_price_paise', null),
          salu.sheet_int(row_data, 'override_deposit_paise', null),
          salu.sheet_text(row_data, 'skill_level', ''),
          coalesce(salu.sheet_int(row_data, 'flow_order', null), 999),
          salu.sheet_text(row_data, 'notes', ''),
          salu.strip_sync_fields(row_data),
          sync_key, hash_value, source_value, false, now_value
        )
        on conflict (stylist_service_id) do update set
          stylist_id = excluded.stylist_id,
          service_id = excluded.service_id,
          active = excluded.active,
          override_duration_minutes = excluded.override_duration_minutes,
          override_price_paise = excluded.override_price_paise,
          override_deposit_paise = excluded.override_deposit_paise,
          skill_level = excluded.skill_level,
          flow_order = excluded.flow_order,
          notes = excluded.notes,
          raw_row = excluded.raw_row,
          sheet_sync_id = excluded.sheet_sync_id,
          sheet_sync_hash = excluded.sheet_sync_hash,
          sheet_sync_source = excluded.sheet_sync_source,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value;
      elsif tab = 'availability' then
        insert into salu.availability (
          availability_id, day_name, open_time, close_time, slot_interval_minutes, blackout_date,
          service_id, active, notes, raw_row, sheet_sync_id, sheet_sync_hash, sheet_sync_source,
          sheet_sync_deleted, sheet_synced_at
        )
        values (
          sync_key,
          salu.sheet_text(row_data, 'day_name', ''),
          salu.sheet_text(row_data, 'open_time', ''),
          salu.sheet_text(row_data, 'close_time', ''),
          salu.sheet_int(row_data, 'slot_interval_minutes', salu.sheet_int(row_data, 'interval_minutes', null)),
          salu.sheet_date(row_data, 'blackout_date'),
          salu.sheet_text(row_data, 'service_id', ''),
          salu.sheet_bool(row_data, 'active', true),
          salu.sheet_text(row_data, 'notes', ''),
          salu.strip_sync_fields(row_data),
          sync_key, hash_value, source_value, false, now_value
        )
        on conflict (availability_id) do update set
          day_name = excluded.day_name,
          open_time = excluded.open_time,
          close_time = excluded.close_time,
          slot_interval_minutes = excluded.slot_interval_minutes,
          blackout_date = excluded.blackout_date,
          service_id = excluded.service_id,
          active = excluded.active,
          notes = excluded.notes,
          raw_row = excluded.raw_row,
          sheet_sync_id = excluded.sheet_sync_id,
          sheet_sync_hash = excluded.sheet_sync_hash,
          sheet_sync_source = excluded.sheet_sync_source,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value;
      elsif tab = 'stylist_availability' then
        insert into salu.stylist_availability (
          stylist_availability_id, stylist_id, day_name, open_time, close_time, slot_interval_minutes,
          blackout_date, effective_from, effective_to, active, notes, raw_row, sheet_sync_id,
          sheet_sync_hash, sheet_sync_source, sheet_sync_deleted, sheet_synced_at
        )
        values (
          sync_key,
          salu.sheet_text(row_data, 'stylist_id', ''),
          salu.sheet_text(row_data, 'day_name', ''),
          salu.sheet_text(row_data, 'open_time', ''),
          salu.sheet_text(row_data, 'close_time', ''),
          salu.sheet_int(row_data, 'slot_interval_minutes', salu.sheet_int(row_data, 'interval_minutes', null)),
          salu.sheet_date(row_data, 'blackout_date'),
          salu.sheet_date(row_data, 'effective_from'),
          salu.sheet_date(row_data, 'effective_to'),
          salu.sheet_bool(row_data, 'active', true),
          salu.sheet_text(row_data, 'notes', ''),
          salu.strip_sync_fields(row_data),
          sync_key, hash_value, source_value, false, now_value
        )
        on conflict (stylist_availability_id) do update set
          stylist_id = excluded.stylist_id,
          day_name = excluded.day_name,
          open_time = excluded.open_time,
          close_time = excluded.close_time,
          slot_interval_minutes = excluded.slot_interval_minutes,
          blackout_date = excluded.blackout_date,
          effective_from = excluded.effective_from,
          effective_to = excluded.effective_to,
          active = excluded.active,
          notes = excluded.notes,
          raw_row = excluded.raw_row,
          sheet_sync_id = excluded.sheet_sync_id,
          sheet_sync_hash = excluded.sheet_sync_hash,
          sheet_sync_source = excluded.sheet_sync_source,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value;
      elsif tab = 'sessions' then
        perform salu.upsert_customer_session(row_data);
        update salu.customer_sessions set
          sheet_sync_id = sync_key,
          sheet_sync_hash = hash_value,
          sheet_sync_source = source_value,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value
        where phone = salu.sheet_text(row_data, 'phone', '');
      elsif tab = 'customer_profiles' then
        perform salu.upsert_customer_profile(row_data);
        update salu.customer_profiles set
          sheet_sync_id = sync_key,
          sheet_sync_hash = hash_value,
          sheet_sync_source = source_value,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value
        where phone = salu.sheet_text(row_data, 'phone', '');
      elsif tab = 'bookings' then
        if salu.sheet_text(row_data, 'booking_id', '') = '' then continue; end if;
        select * into existing_booking from salu.bookings where booking_id = salu.sheet_text(row_data, 'booking_id', '');
        booking_payload := salu.strip_sync_fields(row_data)
          || jsonb_build_object(
            'booking_id', salu.sheet_text(row_data, 'booking_id', ''),
            'phone', salu.sheet_text(row_data, 'phone', coalesce(existing_booking.phone, '')),
            'wa_to', salu.sheet_text(row_data, 'wa_to', coalesce(existing_booking.wa_to, '')),
            'customer_name', salu.sheet_text(row_data, 'customer_name', coalesce(existing_booking.customer_name, 'Guest')),
            'service_assignment_ids', salu.sheet_text(row_data, 'service_assignment_ids', coalesce(existing_booking.service_assignment_ids, '')),
            'service_assignments_summary', salu.sheet_text(row_data, 'service_assignments_summary', coalesce(existing_booking.service_assignments_summary, '')),
            'service_assignments_json', salu.sheet_text(row_data, 'service_assignments_json', coalesce(existing_booking.service_assignments_json::text, '[]')),
            'stylist_ids', salu.sheet_text(row_data, 'stylist_ids', coalesce(existing_booking.stylist_ids, '')),
            'stylist_names', salu.sheet_text(row_data, 'stylist_names', coalesce(existing_booking.stylist_names, '')),
            'stylist_id', salu.sheet_text(row_data, 'stylist_id', coalesce(existing_booking.stylist_id, '')),
            'stylist_name', salu.sheet_text(row_data, 'stylist_name', coalesce(existing_booking.stylist_name, '')),
            'appointment_date', salu.sheet_text(row_data, 'appointment_date', coalesce(existing_booking.appointment_date::text, '')),
            'appointment_time', salu.sheet_text(row_data, 'appointment_time', coalesce(to_char(existing_booking.appointment_time, 'HH24:MI'), '')),
            'timezone', salu.sheet_text(row_data, 'timezone', coalesce(existing_booking.timezone, 'Asia/Kolkata')),
            'status', salu.sheet_text(row_data, 'status', coalesce(existing_booking.status, 'pending')),
            'duration_minutes', coalesce(salu.sheet_int(row_data, 'duration_minutes', null), existing_booking.duration_minutes, 60)::text,
            'calendar_event_id', coalesce(existing_booking.calendar_event_id, salu.sheet_text(row_data, 'calendar_event_id', '')),
            'calendar_event_link', coalesce(existing_booking.calendar_event_link, salu.sheet_text(row_data, 'calendar_event_link', '')),
            'calendar_status', coalesce(existing_booking.calendar_status, salu.sheet_text(row_data, 'calendar_status', '')),
            'calendar_updated_at', coalesce(existing_booking.calendar_updated_at::text, salu.sheet_text(row_data, 'calendar_updated_at', '')),
            'created_at', coalesce(existing_booking.created_at::text, salu.sheet_text(row_data, 'created_at', now_value::text))
          );
        if booking_payload->>'phone' <> '' and booking_payload->>'stylist_id' <> '' and booking_payload->>'appointment_date' <> '' and booking_payload->>'appointment_time' <> '' then
          perform salu.upsert_booking(booking_payload);
          update salu.bookings set
            sheet_sync_id = sync_key,
            sheet_sync_hash = hash_value,
            sheet_sync_source = source_value,
            sheet_sync_deleted = false,
            sheet_synced_at = now_value
          where booking_id = salu.sheet_text(row_data, 'booking_id', '');
        end if;
      elsif tab = 'payments' then
        if salu.sheet_text(row_data, 'reference_id', '') = '' then continue; end if;
        select * into existing_payment from salu.payments where reference_id = salu.sheet_text(row_data, 'reference_id', '');
        if salu.sheet_text(row_data, 'booking_id', coalesce(existing_payment.booking_id, '')) <> '' then
          perform salu.upsert_payment(
            salu.strip_sync_fields(row_data)
            || jsonb_build_object(
              'reference_id', salu.sheet_text(row_data, 'reference_id', ''),
              'booking_id', salu.sheet_text(row_data, 'booking_id', coalesce(existing_payment.booking_id, '')),
              'gateway_payment_link_id', coalesce(existing_payment.gateway_payment_link_id, salu.sheet_text(row_data, 'gateway_payment_link_id', '')),
              'gateway_order_id', coalesce(existing_payment.gateway_order_id, salu.sheet_text(row_data, 'gateway_order_id', '')),
              'gateway_payment_id', coalesce(existing_payment.gateway_payment_id, salu.sheet_text(row_data, 'gateway_payment_id', '')),
              'gateway_method', coalesce(existing_payment.gateway_method, salu.sheet_text(row_data, 'gateway_method', '')),
              'raw_update', coalesce(existing_payment.raw_update::text, salu.sheet_text(row_data, 'raw_update', '{}')),
              'paid_at', coalesce(existing_payment.paid_at::text, salu.sheet_text(row_data, 'paid_at', '')),
              'created_at', coalesce(existing_payment.created_at::text, salu.sheet_text(row_data, 'created_at', now_value::text))
            )
          );
          update salu.payments set
            sheet_sync_id = sync_key,
            sheet_sync_hash = hash_value,
            sheet_sync_source = source_value,
            sheet_sync_deleted = false,
            sheet_synced_at = now_value
          where reference_id = salu.sheet_text(row_data, 'reference_id', '');
        end if;
      elsif tab = 'message_log' then
        perform salu.upsert_message_event(row_data);
        update salu.message_events set
          sheet_sync_id = sync_key,
          sheet_sync_hash = hash_value,
          sheet_sync_source = source_value,
          sheet_sync_deleted = false,
          sheet_synced_at = now_value
        where event_id = salu.sheet_text(row_data, 'message_id', salu.sheet_text(row_data, 'event_id', ''));
      end if;

      v_upserted_count := v_upserted_count + 1;
    exception when others then
      v_error_count := v_error_count + 1;
      insert into salu.audit_events(event_type, severity, summary, payload)
      values ('sheet_sync_row_error', 'warning', sqlerrm, jsonb_build_object('tab_name', tab, 'source', source_value, 'row', row_data));
    end;
  end loop;

  if position('full' in source_value) > 0 then
    if tab = 'services' then
      update salu.services set active = false, sheet_sync_deleted = true, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id <> all(seen_keys) and sheet_sync_source like 'google_sheets%';
      get diagnostics v_changed_count = row_count;
      v_soft_deleted_count := v_soft_deleted_count + v_changed_count;
    elsif tab = 'stylists' then
      update salu.stylists set active = false, sheet_sync_deleted = true, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id <> all(seen_keys) and sheet_sync_source like 'google_sheets%';
      get diagnostics v_changed_count = row_count;
      v_soft_deleted_count := v_soft_deleted_count + v_changed_count;
    elsif tab = 'stylist_services' then
      update salu.stylist_services set active = false, sheet_sync_deleted = true, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id <> all(seen_keys) and sheet_sync_source like 'google_sheets%';
      get diagnostics v_changed_count = row_count;
      v_soft_deleted_count := v_soft_deleted_count + v_changed_count;
    elsif tab = 'availability' then
      update salu.availability set active = false, sheet_sync_deleted = true, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id <> all(seen_keys) and sheet_sync_source like 'google_sheets%';
      get diagnostics v_changed_count = row_count;
      v_soft_deleted_count := v_soft_deleted_count + v_changed_count;
    elsif tab = 'stylist_availability' then
      update salu.stylist_availability set active = false, sheet_sync_deleted = true, sheet_sync_source = source_value, sheet_synced_at = now_value where sheet_sync_id <> all(seen_keys) and sheet_sync_source like 'google_sheets%';
      get diagnostics v_changed_count = row_count;
      v_soft_deleted_count := v_soft_deleted_count + v_changed_count;
    end if;
  end if;

  update salu.sheet_sync_runs
     set upserted_count = v_upserted_count,
         soft_deleted_count = v_soft_deleted_count,
         error_count = v_error_count,
         status = case when v_error_count > 0 then 'warning' else 'success' end,
         summary = jsonb_build_object('seen_keys', seen_keys)
   where id = run_id;

  perform salu.mark_sync_state('sheet_to_db:' || tab, null, case when v_error_count > 0 then 'warning' else 'success' end, '');

  return jsonb_build_object(
    'ok', v_error_count = 0,
    'run_id', run_id,
    'tab_name', tab,
    'source', source_value,
    'row_count', coalesce(jsonb_array_length(row_items), 0),
    'upserted_count', v_upserted_count,
    'soft_deleted_count', v_soft_deleted_count,
    'error_count', v_error_count
  );
exception when others then
  insert into salu.sheet_sync_runs(tab_name, source, row_count, error_count, status, summary)
  values (tab, source_value, coalesce(jsonb_array_length(row_items), 0), 1, 'error', jsonb_build_object('error', sqlerrm));
  perform salu.mark_sync_state('sheet_to_db:' || tab, null, 'error', sqlerrm);
  return jsonb_build_object('ok', false, 'tab_name', tab, 'source', source_value, 'error', sqlerrm);
end;
$$;

create or replace function salu.pending_sheet_mirror_rows(since timestamptz default null)
returns table(tab_name text, key_column text, key_value text, row_data jsonb)
language sql
stable
as $$
with cutoff as (
  select coalesce(since, (select last_mirrored_at from salu.sheet_sync_state where sync_name = 'db_to_sheet'), now() - interval '10 minutes') as value
),
config_rows as (
  select 'config'::text as tab_name, '_sync_id'::text as key_column, sheet_sync_id as key_value,
    jsonb_build_object(
      'salon_name', salon_name, 'timezone', timezone, 'owner_number', owner_number, 'address', address,
      'hours', hours, 'default_language', default_language, 'bot_policy_text', bot_policy_text,
      '_sync_id', sheet_sync_id, '_sync_hash', sheet_sync_hash, '_sync_source', 'supabase',
      '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    ) as row_data
  from salu.config, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
service_rows as (
  select 'services'::text, 'service_id'::text, service_id,
    jsonb_build_object(
      'service_id', service_id, 'service_name', service_name, 'duration_minutes', duration_minutes,
      'price_display', price_display, 'price_paise', price_paise, 'deposit_paise', deposit_paise,
      'payment_required', payment_required::text, 'payment_label', payment_label, 'active', active::text,
      'flow_order', flow_order, 'notes', notes, 'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), 'services:' || service_id), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.services, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
stylist_rows as (
  select 'stylists'::text, 'stylist_id'::text, stylist_id,
    jsonb_build_object(
      'stylist_id', stylist_id, 'stylist_name', stylist_name, 'specialty', specialty, 'image_url', image_url,
      'image_alt', image_alt, 'bio', bio, 'skills_summary', skills_summary, 'active', active::text,
      'flow_order', flow_order, 'notes', notes, 'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), 'stylists:' || stylist_id), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.stylists, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
stylist_service_rows as (
  select 'stylist_services'::text, '_sync_id'::text, coalesce(nullif(sheet_sync_id, ''), stylist_service_id),
    jsonb_build_object(
      'stylist_id', stylist_id, 'service_id', service_id, 'active', active::text,
      'override_duration_minutes', override_duration_minutes, 'override_price_paise', override_price_paise,
      'override_deposit_paise', override_deposit_paise, 'skill_level', skill_level, 'flow_order', flow_order,
      'notes', notes, 'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), stylist_service_id), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.stylist_services, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
availability_rows as (
  select 'availability'::text, '_sync_id'::text, coalesce(nullif(sheet_sync_id, ''), availability_id),
    jsonb_build_object(
      'day_name', day_name, 'open_time', open_time, 'close_time', close_time,
      'slot_interval_minutes', slot_interval_minutes, 'blackout_date', coalesce(blackout_date::text, ''),
      'service_id', service_id, 'active', active::text, 'notes', notes,
      'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), availability_id), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.availability, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
stylist_availability_rows as (
  select 'stylist_availability'::text, '_sync_id'::text, coalesce(nullif(sheet_sync_id, ''), stylist_availability_id),
    jsonb_build_object(
      'stylist_id', stylist_id, 'day_name', day_name, 'open_time', open_time, 'close_time', close_time,
      'slot_interval_minutes', slot_interval_minutes, 'blackout_date', coalesce(blackout_date::text, ''),
      'effective_from', coalesce(effective_from::text, ''), 'effective_to', coalesce(effective_to::text, ''),
      'active', active::text, 'notes', notes, 'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), stylist_availability_id), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.stylist_availability, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
session_rows as (
  select 'sessions'::text, 'phone'::text, phone,
    jsonb_build_object(
      'phone', phone, 'wa_to', wa_to, 'language', language, 'human_mode', human_mode::text,
      'active_flow', active_flow, 'flow_token', flow_token, 'current_booking_id', current_booking_id,
      'current_service_id', current_service_id, 'current_booking_date', coalesce(current_booking_date::text, ''),
      'current_booking_time', coalesce(to_char(current_booking_time, 'HH24:MI'), ''), 'customer_name', customer_name,
      'last_intent', last_intent, 'summary', summary, 'pending_action', pending_action,
      'pending_booking_id', pending_booking_id, 'pending_payment_reference_id', pending_payment_reference_id,
      'pending_payment_link', pending_payment_link, 'pending_payment_gateway_link_id', pending_payment_gateway_link_id,
      'memory_json', memory_json::text, 'last_payment_checked_at', coalesce(last_payment_checked_at::text, ''),
      'last_customer_message', last_customer_message, 'last_inbound_at', coalesce(last_inbound_at::text, ''),
      'handoff_started_at', coalesce(handoff_started_at::text, ''), 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), 'sessions:' || phone), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.customer_sessions, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
profile_rows as (
  select 'customer_profiles'::text, 'phone'::text, phone,
    jsonb_build_object(
      'phone', phone, 'wa_to', wa_to, 'customer_name', customer_name, 'language', language,
      'profile_summary', profile_summary, 'preferred_service_id', preferred_service_id,
      'preferred_service_label', preferred_service_label, 'preferred_service_ids', preferred_service_ids,
      'preferred_services_summary', preferred_services_summary, 'preferred_stylist_id', preferred_stylist_id,
      'preferred_stylist_name', preferred_stylist_name, 'active_booking_id', active_booking_id,
      'pending_booking_id', pending_booking_id, 'pending_payment_reference_id', pending_payment_reference_id,
      'pending_payment_link', pending_payment_link, 'last_booking_id', last_booking_id,
      'last_intent', last_intent, 'last_customer_message', last_customer_message,
      'last_seen_at', coalesce(last_seen_at::text, ''), 'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), 'customer_profiles:' || phone), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.customer_profiles, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
booking_rows as (
  select 'bookings'::text, 'booking_id'::text, booking_id,
    jsonb_build_object(
      'booking_id', booking_id, 'phone', phone, 'wa_to', wa_to, 'customer_name', customer_name,
      'service_id', service_id, 'service_label', service_label, 'service_ids', service_ids,
      'service_labels', service_labels, 'service_details_json', service_details_json::text,
      'service_assignment_ids', service_assignment_ids,
      'service_assignments_summary', service_assignments_summary,
      'service_assignments_json', service_assignments_json::text,
      'stylist_ids', stylist_ids, 'stylist_names', stylist_names,
      'stylist_id', stylist_id, 'stylist_name', stylist_name, 'appointment_date', appointment_date::text,
      'appointment_time', to_char(appointment_time, 'HH24:MI'), 'timezone', timezone, 'status', status,
      'notes', notes, 'reminder_24h_sent', reminder_24h_sent::text, 'reminder_1h_sent', reminder_1h_sent::text,
      'source', source, 'calendar_event_id', calendar_event_id, 'calendar_event_link', calendar_event_link,
      'calendar_status', calendar_status, 'calendar_updated_at', coalesce(calendar_updated_at::text, ''),
      'duration_minutes', duration_minutes, 'payment_status', payment_status,
      'payment_reference_id', payment_reference_id, 'total_paise', total_paise, 'deposit_paise', deposit_paise,
      'balance_paise', balance_paise, 'hold_expires_at', coalesce(hold_expires_at::text, ''),
      'payment_link', payment_link, 'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), 'bookings:' || booking_id), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.bookings, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
payment_rows as (
  select 'payments'::text, 'reference_id'::text, reference_id,
    jsonb_build_object(
      'reference_id', reference_id, 'booking_id', booking_id, 'phone', phone, 'provider', provider, 'mode', mode,
      'amount_paise', amount_paise, 'currency', currency, 'status', status,
      'gateway_payment_link_id', gateway_payment_link_id, 'gateway_order_id', gateway_order_id,
      'gateway_payment_id', gateway_payment_id, 'gateway_method', gateway_method, 'payment_link', payment_link,
      'expires_at', coalesce(expires_at::text, ''), 'paid_at', coalesce(paid_at::text, ''),
      'raw_update', raw_update::text, 'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), 'payments:' || reference_id), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.payments, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
message_rows as (
  select 'message_log'::text, 'message_id'::text, event_id,
    jsonb_build_object(
      'message_id', event_id, 'phone', phone, 'wa_to', wa_to, 'event_type', event_type, 'route', route,
      'status', status, 'intent', intent, 'summary', summary, 'raw_text', raw_text,
      'created_at', created_at::text, 'updated_at', updated_at::text,
      '_sync_id', coalesce(nullif(sheet_sync_id, ''), 'message_log:' || event_id), '_sync_hash', sheet_sync_hash,
      '_sync_source', 'supabase', '_sync_updated_at', updated_at::text, '_sync_deleted', sheet_sync_deleted::text
    )
  from salu.message_events, cutoff
  where updated_at >= cutoff.value
    and coalesce(sheet_sync_source, '') not like 'google_sheets%'
),
raw_rows as (
  select * from config_rows
  union all select * from service_rows
  union all select * from stylist_rows
  union all select * from stylist_service_rows
  union all select * from availability_rows
  union all select * from stylist_availability_rows
  union all select * from session_rows
  union all select * from profile_rows
  union all select * from booking_rows
  union all select * from payment_rows
  union all select * from message_rows
)
select
  tab_name,
  key_column,
  key_value,
  row_data || jsonb_build_object('_sync_hash', salu.sheet_row_hash(row_data)) as row_data
from raw_rows
order by tab_name, key_value;
$$;


-- Source: 003_salu_handoff_capture.sql

-- Immediate inbound customer capture and durable human-handoff state.
-- Apply after sql/001_salu_booking_db.sql and sql/002_salu_sheet_sync.sql.

create schema if not exists salu;

alter table salu.customer_sessions
  add column if not exists unclear_turn_count integer not null default 0,
  add column if not exists handoff_reason text not null default '',
  add column if not exists handoff_category text not null default '',
  add column if not exists handoff_event_id text not null default '';

alter table salu.customer_profiles
  add column if not exists whatsapp_user_id text not null default '',
  add column if not exists email text not null default '',
  add column if not exists company text not null default '',
  add column if not exists first_inbound_at timestamptz,
  add column if not exists last_message_id text not null default '',
  add column if not exists last_message_type text not null default '',
  add column if not exists facts_json jsonb not null default '{}'::jsonb,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

alter table salu.message_events
  add column if not exists message_type text not null default '',
  add column if not exists whatsapp_user_id text not null default '',
  add column if not exists provider_timestamp timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_execution_id text not null default '',
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_sessions_unclear_turn_count_nonnegative'
      and conrelid = 'salu.customer_sessions'::regclass
  ) then
    alter table salu.customer_sessions
      add constraint customer_sessions_unclear_turn_count_nonnegative
      check (unclear_turn_count >= 0);
  end if;
end
$$;

create index if not exists salu_message_events_processing_status_idx
  on salu.message_events(status, processing_started_at);

create or replace function salu.prevent_terminal_booking_resurrection()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('expired', 'cancelled')
    and new.status in ('pending', 'confirmed') then
    new.status := old.status;
    new.payment_status := old.payment_status;
    new.hold_expires_at := old.hold_expires_at;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_terminal_booking_resurrection on salu.bookings;
create trigger prevent_terminal_booking_resurrection
before update of status on salu.bookings
for each row execute function salu.prevent_terminal_booking_resurrection();

create or replace function salu.expire_holds(p_now timestamptz default now())
returns jsonb
language plpgsql
as $$
declare
  expired_count integer := 0;
begin
  update salu.bookings b
     set status = 'expired',
         payment_status = case when b.payment_status = 'paid' then 'refund_required' else 'expired' end,
         calendar_status = '',
         sheet_sync_source = 'database',
         sheet_synced_at = null
   where b.status = 'pending'
     and b.hold_expires_at is not null
     and b.hold_expires_at <= p_now;

  get diagnostics expired_count = row_count;

  update salu.booking_segments s
     set status = b.status
    from salu.bookings b
   where s.booking_id = b.booking_id
     and b.status = 'expired';

  update salu.payments p
     set status = 'expired',
         sheet_sync_source = 'database',
         sheet_synced_at = null
    from salu.bookings b
   where p.booking_id = b.booking_id
     and b.status = 'expired'
     and p.status = 'pending';

  return jsonb_build_object('ok', true, 'expired_count', expired_count);
end;
$$;

create or replace function salu.inbound_provider_timestamp(payload jsonb)
returns timestamptz
language plpgsql
immutable
as $$
declare
  raw_value text := coalesce(payload->>'message_timestamp', payload->>'timestamp', '');
begin
  if raw_value = '' then
    return null;
  end if;

  if raw_value ~ '^\d{9,13}$' then
    return to_timestamp(
      case when length(raw_value) > 10
        then raw_value::numeric / 1000
        else raw_value::numeric
      end
    );
  end if;

  return raw_value::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function salu.upsert_customer_session(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  phone_value text := nullif(payload->>'phone', '');
begin
  if phone_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_phone');
  end if;

  insert into salu.customer_sessions (
    phone, wa_to, language, human_mode, active_flow, flow_token,
    current_booking_id, current_service_id, current_booking_date, current_booking_time,
    customer_name, last_intent, summary, pending_action, pending_booking_id,
    pending_payment_reference_id, pending_payment_link, pending_payment_gateway_link_id,
    memory_json, last_payment_checked_at, last_customer_message, last_inbound_at,
    handoff_started_at, unclear_turn_count, handoff_reason, handoff_category,
    handoff_event_id
  ) values (
    phone_value,
    coalesce(payload->>'wa_to', ''),
    coalesce(nullif(payload->>'language', ''), 'en'),
    salu.as_bool(to_jsonb(payload->>'human_mode'), false),
    coalesce(payload->>'active_flow', ''),
    coalesce(payload->>'flow_token', ''),
    coalesce(payload->>'current_booking_id', ''),
    coalesce(payload->>'current_service_id', ''),
    nullif(payload->>'current_booking_date', '')::date,
    nullif(payload->>'current_booking_time', '')::time,
    coalesce(nullif(payload->>'customer_name', ''), 'Guest'),
    coalesce(payload->>'last_intent', ''),
    coalesce(payload->>'summary', ''),
    coalesce(payload->>'pending_action', ''),
    coalesce(payload->>'pending_booking_id', ''),
    coalesce(payload->>'pending_payment_reference_id', ''),
    coalesce(payload->>'pending_payment_link', ''),
    coalesce(payload->>'pending_payment_gateway_link_id', ''),
    case when jsonb_typeof(payload->'memory_json') = 'object' then payload->'memory_json'
      else coalesce(nullif(payload->>'memory_json', '')::jsonb, '{}'::jsonb) end,
    nullif(payload->>'last_payment_checked_at', '')::timestamptz,
    coalesce(payload->>'last_customer_message', ''),
    nullif(payload->>'last_inbound_at', '')::timestamptz,
    nullif(payload->>'handoff_started_at', '')::timestamptz,
    greatest(coalesce(nullif(payload->>'unclear_turn_count', '')::integer, 0), 0),
    coalesce(payload->>'handoff_reason', ''),
    coalesce(payload->>'handoff_category', ''),
    coalesce(payload->>'handoff_event_id', '')
  )
  on conflict (phone) do update set
    wa_to = case when payload ? 'wa_to' then excluded.wa_to else salu.customer_sessions.wa_to end,
    language = case when payload ? 'language' then excluded.language else salu.customer_sessions.language end,
    human_mode = case
      when salu.customer_sessions.human_mode
        and not excluded.human_mode
        and not salu.as_bool(payload->'resume_authorized', false)
        then true
      when payload ? 'human_mode' then excluded.human_mode
      else salu.customer_sessions.human_mode
    end,
    active_flow = case when payload ? 'active_flow' then excluded.active_flow else salu.customer_sessions.active_flow end,
    flow_token = case when payload ? 'flow_token' then excluded.flow_token else salu.customer_sessions.flow_token end,
    current_booking_id = case when payload ? 'current_booking_id' then excluded.current_booking_id else salu.customer_sessions.current_booking_id end,
    current_service_id = case when payload ? 'current_service_id' then excluded.current_service_id else salu.customer_sessions.current_service_id end,
    current_booking_date = case when payload ? 'current_booking_date' then excluded.current_booking_date else salu.customer_sessions.current_booking_date end,
    current_booking_time = case when payload ? 'current_booking_time' then excluded.current_booking_time else salu.customer_sessions.current_booking_time end,
    customer_name = case when payload ? 'customer_name' and lower(excluded.customer_name) <> 'guest' then excluded.customer_name else salu.customer_sessions.customer_name end,
    last_intent = case when payload ? 'last_intent' then excluded.last_intent else salu.customer_sessions.last_intent end,
    summary = case when payload ? 'summary' then excluded.summary else salu.customer_sessions.summary end,
    pending_action = case when payload ? 'pending_action' then excluded.pending_action else salu.customer_sessions.pending_action end,
    pending_booking_id = case when payload ? 'pending_booking_id' then excluded.pending_booking_id else salu.customer_sessions.pending_booking_id end,
    pending_payment_reference_id = case when payload ? 'pending_payment_reference_id' then excluded.pending_payment_reference_id else salu.customer_sessions.pending_payment_reference_id end,
    pending_payment_link = case when payload ? 'pending_payment_link' then excluded.pending_payment_link else salu.customer_sessions.pending_payment_link end,
    pending_payment_gateway_link_id = case when payload ? 'pending_payment_gateway_link_id' then excluded.pending_payment_gateway_link_id else salu.customer_sessions.pending_payment_gateway_link_id end,
    memory_json = case when payload ? 'memory_json' then excluded.memory_json else salu.customer_sessions.memory_json end,
    last_payment_checked_at = case when payload ? 'last_payment_checked_at' then excluded.last_payment_checked_at else salu.customer_sessions.last_payment_checked_at end,
    last_customer_message = case when payload ? 'last_customer_message' then excluded.last_customer_message else salu.customer_sessions.last_customer_message end,
    last_inbound_at = case when payload ? 'last_inbound_at' then excluded.last_inbound_at else salu.customer_sessions.last_inbound_at end,
    handoff_started_at = case when payload ? 'handoff_started_at' then excluded.handoff_started_at else salu.customer_sessions.handoff_started_at end,
    unclear_turn_count = case when payload ? 'unclear_turn_count' then excluded.unclear_turn_count else salu.customer_sessions.unclear_turn_count end,
    handoff_reason = case when payload ? 'handoff_reason' then excluded.handoff_reason else salu.customer_sessions.handoff_reason end,
    handoff_category = case when payload ? 'handoff_category' then excluded.handoff_category else salu.customer_sessions.handoff_category end,
    handoff_event_id = case when payload ? 'handoff_event_id' then excluded.handoff_event_id else salu.customer_sessions.handoff_event_id end,
    sheet_sync_source = 'database',
    sheet_synced_at = null,
    updated_at = now();

  return jsonb_build_object('ok', true, 'status', 'upserted', 'phone', phone_value);
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
    last_message_id, last_message_type, facts_json, source_metadata
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
    source_value
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
    sheet_sync_source = 'database',
    sheet_synced_at = null,
    updated_at = now();

  return jsonb_build_object('ok', true, 'status', 'upserted', 'phone', phone_value);
end;
$$;

create or replace function salu.capture_inbound_customer_event(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  event_id_value text := coalesce(nullif(payload->>'event_id', ''), nullif(payload->>'message_id', ''));
  phone_value text := nullif(payload->>'phone', '');
  wa_to_value text := regexp_replace(coalesce(payload->>'wa_to', phone_value, ''), '\D', '', 'g');
  customer_name_value text := coalesce(nullif(payload->>'customer_name', ''), 'Guest');
  customer_text_value text := coalesce(payload->>'raw_text', payload->>'text', '');
  message_type_value text := coalesce(payload->>'message_type', '');
  whatsapp_user_id_value text := coalesce(payload->>'whatsapp_user_id', payload->>'from_user_id', '');
  execution_id_value text := coalesce(payload->>'execution_id', '');
  event_time timestamptz := coalesce(salu.inbound_provider_timestamp(payload), now());
  existing_status text;
  existing_started_at timestamptz;
  inserted_count integer := 0;
  should_process boolean := false;
  claim_reason text := 'new';
  facts_value jsonb := case
    when jsonb_typeof(payload->'facts_json') = 'object' then payload->'facts_json'
    else '{}'::jsonb
  end;
  source_value jsonb := jsonb_build_object(
    'last_inbound', payload - 'facts_json' - 'raw_event',
    'last_event_id', coalesce(event_id_value, ''),
    'last_seen_at', event_time
  );
begin
  if event_id_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_event_id', 'should_process', false);
  end if;

  if phone_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_phone', 'should_process', false);
  end if;

  insert into salu.customer_profiles (
    phone, wa_to, customer_name, language, profile_summary,
    last_intent, last_customer_message, last_seen_at,
    whatsapp_user_id, email, company, first_inbound_at,
    last_message_id, last_message_type, facts_json, source_metadata
  ) values (
    phone_value,
    wa_to_value,
    customer_name_value,
    coalesce(nullif(payload->>'language', ''), 'en'),
    '',
    'inbound_received',
    customer_text_value,
    event_time,
    whatsapp_user_id_value,
    lower(coalesce(payload->>'email', '')),
    coalesce(payload->>'company', ''),
    event_time,
    event_id_value,
    message_type_value,
    facts_value,
    source_value
  )
  on conflict (phone) do update set
    wa_to = coalesce(nullif(excluded.wa_to, ''), salu.customer_profiles.wa_to),
    customer_name = case
      when excluded.customer_name <> '' and lower(excluded.customer_name) <> 'guest'
        then excluded.customer_name
      else salu.customer_profiles.customer_name
    end,
    language = coalesce(nullif(payload->>'language', ''), salu.customer_profiles.language),
    last_customer_message = coalesce(nullif(excluded.last_customer_message, ''), salu.customer_profiles.last_customer_message),
    last_seen_at = greatest(coalesce(salu.customer_profiles.last_seen_at, '-infinity'::timestamptz), excluded.last_seen_at),
    whatsapp_user_id = coalesce(nullif(excluded.whatsapp_user_id, ''), salu.customer_profiles.whatsapp_user_id),
    email = coalesce(nullif(excluded.email, ''), salu.customer_profiles.email),
    company = coalesce(nullif(excluded.company, ''), salu.customer_profiles.company),
    first_inbound_at = least(coalesce(salu.customer_profiles.first_inbound_at, excluded.first_inbound_at), excluded.first_inbound_at),
    last_message_id = excluded.last_message_id,
    last_message_type = coalesce(nullif(excluded.last_message_type, ''), salu.customer_profiles.last_message_type),
    facts_json = coalesce(salu.customer_profiles.facts_json, '{}'::jsonb) || excluded.facts_json,
    source_metadata = coalesce(salu.customer_profiles.source_metadata, '{}'::jsonb) || excluded.source_metadata,
    sheet_sync_source = 'database',
    sheet_synced_at = null,
    updated_at = now();

  insert into salu.customer_sessions (
    phone, wa_to, language, customer_name, last_intent,
    last_customer_message, last_inbound_at
  ) values (
    phone_value,
    wa_to_value,
    coalesce(nullif(payload->>'language', ''), 'en'),
    customer_name_value,
    'inbound_received',
    customer_text_value,
    event_time
  )
  on conflict (phone) do update set
    wa_to = coalesce(nullif(excluded.wa_to, ''), salu.customer_sessions.wa_to),
    language = coalesce(nullif(payload->>'language', ''), salu.customer_sessions.language),
    customer_name = case
      when excluded.customer_name <> '' and lower(excluded.customer_name) <> 'guest'
        then excluded.customer_name
      else salu.customer_sessions.customer_name
    end,
    last_customer_message = coalesce(nullif(excluded.last_customer_message, ''), salu.customer_sessions.last_customer_message),
    last_inbound_at = greatest(coalesce(salu.customer_sessions.last_inbound_at, '-infinity'::timestamptz), excluded.last_inbound_at),
    sheet_sync_source = 'database',
    sheet_synced_at = null,
    updated_at = now();

  insert into salu.message_events (
    event_id, phone, wa_to, event_type, route, status, intent, summary,
    raw_text, payload, message_type, whatsapp_user_id, provider_timestamp,
    processing_started_at, processing_execution_id, attempt_count, last_error
  ) values (
    event_id_value,
    phone_value,
    wa_to_value,
    coalesce(nullif(payload->>'event_type', ''), 'text_message'),
    'ingress',
    'processing',
    'inbound_received',
    'Captured before routing',
    customer_text_value,
    payload,
    message_type_value,
    whatsapp_user_id_value,
    event_time,
    now(),
    execution_id_value,
    1,
    ''
  )
  on conflict (event_id) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    should_process := true;
  else
    select status, processing_started_at
      into existing_status, existing_started_at
      from salu.message_events
     where event_id = event_id_value
     for update;

    if existing_status = 'processed' then
      claim_reason := 'already_processed';
    elsif existing_status = 'processing'
      and existing_started_at is not null
      and existing_started_at > now() - interval '5 minutes' then
      claim_reason := 'already_processing';
    else
      should_process := true;
      claim_reason := 'reclaimed';
      update salu.message_events
         set phone = coalesce(nullif(phone_value, ''), phone),
             wa_to = coalesce(nullif(wa_to_value, ''), wa_to),
             event_type = coalesce(nullif(payload->>'event_type', ''), event_type),
             raw_text = coalesce(nullif(customer_text_value, ''), raw_text),
             payload = salu.message_events.payload || payload,
             message_type = coalesce(nullif(message_type_value, ''), message_type),
             whatsapp_user_id = coalesce(nullif(whatsapp_user_id_value, ''), whatsapp_user_id),
             provider_timestamp = coalesce(provider_timestamp, event_time),
             status = 'processing',
             route = 'ingress',
             intent = 'inbound_received',
             processing_started_at = now(),
             processing_execution_id = execution_id_value,
             attempt_count = attempt_count + 1,
             last_error = '',
             sheet_sync_source = 'database',
             sheet_synced_at = null,
             updated_at = now()
       where event_id = event_id_value;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', claim_reason,
    'should_process', should_process,
    'event_id', event_id_value,
    'phone', phone_value
  );
end;
$$;

create or replace function salu.activate_handoff(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  phone_value text := nullif(payload->>'phone', '');
  event_id_value text := coalesce(nullif(payload->>'event_id', ''), nullif(payload->>'message_id', ''));
  reason_value text := coalesce(nullif(payload->>'reason', ''), 'Human help requested');
  category_value text := coalesce(nullif(payload->>'category', ''), 'human_request');
  existing_event_id text := '';
  existing_human_mode boolean := false;
  should_notify boolean := true;
begin
  if phone_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_phone', 'should_notify', false);
  end if;

  select human_mode, handoff_event_id
    into existing_human_mode, existing_event_id
    from salu.customer_sessions
   where phone = phone_value
   for update;

  if existing_human_mode and event_id_value is not null and existing_event_id = event_id_value then
    should_notify := false;
  end if;

  insert into salu.customer_sessions (
    phone, wa_to, human_mode, active_flow, flow_token,
    last_intent, summary, handoff_started_at,
    handoff_reason, handoff_category, handoff_event_id,
    unclear_turn_count
  ) values (
    phone_value,
    regexp_replace(phone_value, '\D', '', 'g'),
    true,
    '',
    '',
    'handoff_notified',
    jsonb_build_object(
      'reason', reason_value,
      'category', category_value,
      'event_id', coalesce(event_id_value, ''),
      'bot_paused', true,
      'human_notified_at', now()
    )::text,
    now(),
    reason_value,
    category_value,
    coalesce(event_id_value, ''),
    0
  )
  on conflict (phone) do update set
    human_mode = true,
    active_flow = '',
    flow_token = '',
    last_intent = 'handoff_notified',
    summary = excluded.summary,
    handoff_started_at = case
      when salu.customer_sessions.human_mode then salu.customer_sessions.handoff_started_at
      else now()
    end,
    handoff_reason = reason_value,
    handoff_category = category_value,
    handoff_event_id = coalesce(event_id_value, salu.customer_sessions.handoff_event_id),
    unclear_turn_count = 0,
    sheet_sync_source = 'database',
    sheet_synced_at = null,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'status', case when should_notify then 'activated' else 'already_active_for_event' end,
    'should_notify', should_notify,
    'phone', phone_value,
    'event_id', coalesce(event_id_value, ''),
    'reason', reason_value,
    'category', category_value,
    'notification_context', coalesce(payload->'notification_context', '{}'::jsonb)
  );
end;
$$;

create or replace function salu.upsert_message_event(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  event_id_value text := coalesce(nullif(payload->>'event_id', ''), nullif(payload->>'message_id', ''));
  status_value text := coalesce(nullif(payload->>'status', ''), 'processed');
begin
  if event_id_value is null then
    return jsonb_build_object('ok', false, 'status', 'missing_event_id');
  end if;

  insert into salu.message_events (
    event_id, phone, wa_to, event_type, route, status, intent, summary, raw_text,
    payload, message_type, whatsapp_user_id, provider_timestamp,
    processing_started_at, processing_execution_id, attempt_count, last_error
  ) values (
    event_id_value,
    coalesce(payload->>'phone', ''),
    coalesce(payload->>'wa_to', ''),
    coalesce(payload->>'event_type', ''),
    coalesce(payload->>'route', ''),
    status_value,
    coalesce(payload->>'intent', ''),
    coalesce(payload->>'summary', ''),
    coalesce(payload->>'raw_text', ''),
    payload,
    coalesce(payload->>'message_type', ''),
    coalesce(payload->>'whatsapp_user_id', payload->>'from_user_id', ''),
    salu.inbound_provider_timestamp(payload),
    case when status_value = 'processing' then now() else null end,
    coalesce(payload->>'execution_id', ''),
    1,
    coalesce(payload->>'last_error', '')
  )
  on conflict (event_id) do update set
    phone = coalesce(nullif(excluded.phone, ''), salu.message_events.phone),
    wa_to = coalesce(nullif(excluded.wa_to, ''), salu.message_events.wa_to),
    event_type = coalesce(nullif(excluded.event_type, ''), salu.message_events.event_type),
    route = coalesce(nullif(excluded.route, ''), salu.message_events.route),
    status = excluded.status,
    intent = coalesce(nullif(excluded.intent, ''), salu.message_events.intent),
    summary = coalesce(nullif(excluded.summary, ''), salu.message_events.summary),
    raw_text = coalesce(nullif(excluded.raw_text, ''), salu.message_events.raw_text),
    payload = salu.message_events.payload || excluded.payload,
    message_type = coalesce(nullif(excluded.message_type, ''), salu.message_events.message_type),
    whatsapp_user_id = coalesce(nullif(excluded.whatsapp_user_id, ''), salu.message_events.whatsapp_user_id),
    provider_timestamp = coalesce(salu.message_events.provider_timestamp, excluded.provider_timestamp),
    processing_started_at = coalesce(excluded.processing_started_at, salu.message_events.processing_started_at),
    processing_execution_id = coalesce(nullif(excluded.processing_execution_id, ''), salu.message_events.processing_execution_id),
    last_error = excluded.last_error,
    sheet_sync_source = 'database',
    sheet_synced_at = null,
    updated_at = now();

  return jsonb_build_object('ok', true, 'status', 'upserted', 'event_id', event_id_value);
end;
$$;


-- Source: 001_initial_schema.sql

-- ============================================================
-- Idempotent migration — safe to run multiple times.
-- Uses IF NOT EXISTS for tables/indexes and DROP IF EXISTS
-- for policies/triggers (Postgres has no CREATE POLICY IF NOT EXISTS).
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  company TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own contacts" ON contacts;
CREATE POLICY "Users can manage own contacts" ON contacts FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own tags" ON tags;
CREATE POLICY "Users can manage own tags" ON tags FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- CONTACT_TAGS (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id);

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage contact tags" ON contact_tags;
CREATE POLICY "Users can manage contact tags" ON contact_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_tags.contact_id AND contacts.user_id = auth.uid()));

-- ============================================================
-- CUSTOM_FIELDS
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  field_options JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own custom fields" ON custom_fields;
CREATE POLICY "Users can manage own custom fields" ON custom_fields FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- CONTACT_CUSTOM_VALUES
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_custom_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id, custom_field_id)
);

ALTER TABLE contact_custom_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage custom values" ON contact_custom_values;
CREATE POLICY "Users can manage custom values" ON contact_custom_values FOR ALL
  USING (EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_custom_values.contact_id AND contacts.user_id = auth.uid()));

-- ============================================================
-- CONTACT_NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own notes" ON contact_notes;
CREATE POLICY "Users can manage own notes" ON contact_notes FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  assigned_agent_id UUID,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
CREATE POLICY "Users can manage own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),
  sender_id UUID,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'document', 'audio', 'video', 'location', 'template')),
  content_text TEXT,
  media_url TEXT,
  template_name TEXT,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Service role can insert messages" ON messages;
CREATE POLICY "Users can view own messages" ON messages FOR ALL
  USING (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid()));
CREATE POLICY "Service role can insert messages" ON messages FOR INSERT WITH CHECK (true);

-- ============================================================
-- WHATSAPP_CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT,
  access_token TEXT NOT NULL,
  verify_token TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own config" ON whatsapp_config;
CREATE POLICY "Users can manage own config" ON whatsapp_config FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- MESSAGE_TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Marketing' CHECK (category IN ('Marketing', 'Utility', 'Authentication')),
  language TEXT DEFAULT 'en_US',
  header_type TEXT CHECK (header_type IN ('text', 'image', 'video', 'document')),
  header_content TEXT,
  body_text TEXT NOT NULL,
  footer_text TEXT,
  buttons JSONB,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending', 'Approved', 'Rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own templates" ON message_templates;
CREATE POLICY "Users can manage own templates" ON message_templates FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- PIPELINES
-- ============================================================
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own pipelines" ON pipelines;
CREATE POLICY "Users can manage own pipelines" ON pipelines FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- PIPELINE_STAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage pipeline stages" ON pipeline_stages;
CREATE POLICY "Users can manage pipeline stages" ON pipeline_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM pipelines WHERE pipelines.id = pipeline_stages.pipeline_id AND pipelines.user_id = auth.uid()));

-- ============================================================
-- DEALS
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  conversation_id UUID REFERENCES conversations(id),
  title TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  expected_close_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own deals" ON deals;
CREATE POLICY "Users can manage own deals" ON deals FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- BROADCASTS
-- ============================================================
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'en_US',
  template_variables JSONB,
  audience_filter JSONB,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own broadcasts" ON broadcasts;
CREATE POLICY "Users can manage own broadcasts" ON broadcasts FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- BROADCAST_RECIPIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);

ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage broadcast recipients" ON broadcast_recipients;
CREATE POLICY "Users can manage broadcast recipients" ON broadcast_recipients FOR ALL
  USING (EXISTS (SELECT 1 FROM broadcasts WHERE broadcasts.id = broadcast_recipients.broadcast_id AND broadcasts.user_id = auth.uid()));

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at — drop existing triggers first to avoid conflicts
DROP TRIGGER IF EXISTS set_updated_at ON profiles;
DROP TRIGGER IF EXISTS set_updated_at ON contacts;
DROP TRIGGER IF EXISTS set_updated_at ON conversations;
DROP TRIGGER IF EXISTS set_updated_at ON whatsapp_config;
DROP TRIGGER IF EXISTS set_updated_at ON message_templates;
DROP TRIGGER IF EXISTS set_updated_at ON deals;
DROP TRIGGER IF EXISTS set_updated_at ON broadcasts;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON whatsapp_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON broadcasts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- AUTO-CREATE PROFILE ON USER SIGNUP
-- Uses SECURITY DEFINER with owner=postgres (bypasses RLS).
-- EXCEPTION block ensures signup still succeeds even if profile
-- insert fails — profile can be created later if needed.
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ENABLE REALTIME for key tables (idempotent via DO block)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;


-- Source: 001_setup_from_scratch.sql

-- I will generate the complete flattened schema here


-- Source: 002_pipelines_enhancements.sql

-- ============================================================
-- Pipeline enhancements:
--   * deals.assigned_to — optional FK to profiles.id
--   * deals.status — CHECK constraint ('open', 'won', 'lost')
--     (replaces the old default 'active' with spec-compliant values)
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- Add assigned_to (nullable, FK to profiles)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to);

-- Normalize status values: any existing 'active' row becomes 'open'
UPDATE deals SET status = 'open' WHERE status = 'active' OR status IS NULL;

-- Replace the old default and enforce allowed values
ALTER TABLE deals ALTER COLUMN status SET DEFAULT 'open';

-- Drop prior CHECK if any (none in 001, but be idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deals_status_check' AND conrelid = 'deals'::regclass
  ) THEN
    ALTER TABLE deals DROP CONSTRAINT deals_status_check;
  END IF;
END $$;

ALTER TABLE deals
  ADD CONSTRAINT deals_status_check CHECK (status IN ('open', 'won', 'lost'));


-- Source: 003_broadcast_recipient_wamid.sql

-- ============================================================
-- Broadcast recipient correlation + aggregate counts
--
-- Problem this solves:
--   * broadcast_recipients had no column to correlate with Meta's
--     message id, so webhook status updates (sent/delivered/read)
--     could not be mirrored into the recipient row and the broadcast
--     aggregate counts never advanced.
--   * aggregate counts on `broadcasts` (sent/delivered/read/replied/
--     failed) were updated ad-hoc by the sender, which drifted quickly
--     once webhooks arrived out of band.
--
-- This migration:
--   1. Adds whatsapp_message_id (+ unique index) so webhooks can find
--      a recipient given Meta's message id.
--   2. Adds a composite index on (broadcast_id, status) so the
--      aggregate trigger's COUNT(*) FILTER scans are fast.
--   3. Installs an AFTER INSERT/UPDATE/DELETE trigger on
--      broadcast_recipients that re-aggregates the parent broadcasts
--      row. Keeps writer code trivial — the webhook + hook only touch
--      the recipient row; counts stay consistent automatically.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;

-- UNIQUE so webhook retries can't create duplicate correlations.
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_wamid
  ON broadcast_recipients (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

-- Fast path for the aggregate trigger's COUNT(*) FILTER subqueries.
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast_status
  ON broadcast_recipients (broadcast_id, status);

-- ============================================================
-- Aggregate trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE broadcasts b SET
    sent_count      = agg.sent_count,
    delivered_count = agg.delivered_count,
    read_count      = agg.read_count,
    replied_count   = agg.replied_count,
    failed_count    = agg.failed_count,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','replied')) AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered','read','replied'))        AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('read','replied'))                    AS read_count,
      COUNT(*) FILTER (WHERE status = 'replied')                              AS replied_count,
      COUNT(*) FILTER (WHERE status = 'failed')                               AS failed_count
    FROM broadcast_recipients
    WHERE broadcast_id = bid
  ) agg
  WHERE b.id = bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.broadcast_recipient_aggregate_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_broadcast_counts(OLD.broadcast_id);
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE — only recompute when status changed (or on fresh insert)
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.recompute_broadcast_counts(NEW.broadcast_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS broadcast_recipients_aggregate ON broadcast_recipients;
CREATE TRIGGER broadcast_recipients_aggregate
AFTER INSERT OR UPDATE OR DELETE ON broadcast_recipients
FOR EACH ROW EXECUTE FUNCTION public.broadcast_recipient_aggregate_trigger();


-- Source: 004_contact_delete_set_null.sql

-- ============================================================
-- Allow contact deletion without wiping history.
--
-- broadcast_recipients.contact_id and deals.contact_id were declared
-- NOT NULL REFERENCES contacts(id) with no ON DELETE action, so
-- Postgres defaults to NO ACTION. The first time a user tried to
-- delete a contact that had ever received a broadcast or been
-- attached to a deal, the delete failed with:
--
--   ERROR 23503: update or delete on table "contacts" violates
--   foreign key constraint ... on table <other>
--
-- CASCADE is the wrong fix — it would silently wipe historical
-- broadcast recipient rows (breaking audit + retroactively moving
-- broadcasts.sent_count / delivered_count / read_count etc. via the
-- aggregate trigger) and deal rows.
--
-- SET NULL is the right fix: history rows survive with a NULL
-- contact_id. The UI is already null-safe (contact?.name ?? 'Unknown',
-- contact?.phone, etc.).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── broadcast_recipients.contact_id ────────────────────────────
ALTER TABLE broadcast_recipients
  ALTER COLUMN contact_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'broadcast_recipients_contact_id_fkey'
      AND conrelid = 'broadcast_recipients'::regclass
  ) THEN
    ALTER TABLE broadcast_recipients
      DROP CONSTRAINT broadcast_recipients_contact_id_fkey;
  END IF;
END $$;

ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
    ON DELETE SET NULL;

-- ── deals.contact_id ───────────────────────────────────────────
ALTER TABLE deals
  ALTER COLUMN contact_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deals_contact_id_fkey'
      AND conrelid = 'deals'::regclass
  ) THEN
    ALTER TABLE deals
      DROP CONSTRAINT deals_contact_id_fkey;
  END IF;
END $$;

ALTER TABLE deals
  ADD CONSTRAINT deals_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
    ON DELETE SET NULL;


-- Source: 005_broadcast_counts_incremental.sql

-- ============================================================
-- Incremental broadcast aggregate trigger.
--
-- Migration 003 installed a trigger that recomputed every counter
-- (sent/delivered/read/replied/failed) via COUNT(*) FILTER on every
-- row change. For a 10k-recipient broadcast, the send loop produces
-- 10k INSERTs + 10k UPDATEs = 20k full aggregate scans, each walking
-- the (broadcast_id, status) index. Workable at small scale, but
-- O(n²) overall.
--
-- This migration replaces that with an incremental trigger that
-- adjusts the parent broadcast's counts by ±1 based on the OLD →
-- NEW.status delta. O(1) per recipient change; no scans at all.
--
-- Semantic model (same as the lib/broadcast-status.ts "forward-only
-- ladder" in the webhook):
--   sent_count       = recipients whose status is at or past 'sent'
--   delivered_count  = ... at or past 'delivered'
--   read_count       = ... at or past 'read'
--   replied_count    = status = 'replied'
--   failed_count     = status = 'failed'
--
-- A webhook that advances a recipient pending → sent → delivered →
-- read → replied bumps every rung it crosses by 1. Going to 'failed'
-- only bumps failed_count (and can only happen from pending / sent,
-- enforced in the webhook).
--
-- Keeps the safety net: a public recompute_broadcast_counts() SQL
-- function is retained so ops can run it manually if counts ever
-- drift (e.g. after bulk DB surgery).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Delta a single column by +1 / -1.
CREATE OR REPLACE FUNCTION public._bcast_bump(bid UUID, col TEXT, delta INT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE broadcasts SET %I = GREATEST(0, %I + $1), updated_at = NOW() WHERE id = $2',
    col, col
  ) USING delta, bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Columns this recipient's status contributes to.
CREATE OR REPLACE FUNCTION public._bcast_cols_for_status(s TEXT)
RETURNS TEXT[] AS $$
BEGIN
  -- 'pending' contributes to nothing.
  IF s = 'pending' THEN RETURN ARRAY[]::TEXT[]; END IF;
  IF s = 'sent'      THEN RETURN ARRAY['sent_count']; END IF;
  IF s = 'delivered' THEN RETURN ARRAY['sent_count','delivered_count']; END IF;
  IF s = 'read'      THEN RETURN ARRAY['sent_count','delivered_count','read_count']; END IF;
  IF s = 'replied'   THEN RETURN ARRAY['sent_count','delivered_count','read_count','replied_count']; END IF;
  IF s = 'failed'    THEN RETURN ARRAY['failed_count']; END IF;
  RETURN ARRAY[]::TEXT[];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Replace the trigger body with the incremental version.
CREATE OR REPLACE FUNCTION public.broadcast_recipient_aggregate_trigger()
RETURNS TRIGGER AS $$
DECLARE
  old_cols TEXT[];
  new_cols TEXT[];
  c TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_cols := _bcast_cols_for_status(NEW.status);
    FOREACH c IN ARRAY new_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_cols := _bcast_cols_for_status(OLD.status);
    FOREACH c IN ARRAY old_cols LOOP
      PERFORM _bcast_bump(OLD.broadcast_id, c, -1);
    END LOOP;
    RETURN OLD;
  END IF;

  -- UPDATE: only care if status changed.
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    old_cols := _bcast_cols_for_status(OLD.status);
    new_cols := _bcast_cols_for_status(NEW.status);
    -- Subtract the old contributions, add the new.
    FOREACH c IN ARRAY old_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, -1);
    END LOOP;
    FOREACH c IN ARRAY new_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger itself remains the same (INSERT/UPDATE/DELETE) — just its
-- body has been replaced.

-- Safety net — rebuild counts from scratch. Retained as-is so ops can
-- run it on demand if something ever drifts. Matches the incremental
-- trigger's semantic model exactly.
CREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE broadcasts b SET
    sent_count      = agg.sent_count,
    delivered_count = agg.delivered_count,
    read_count      = agg.read_count,
    replied_count   = agg.replied_count,
    failed_count    = agg.failed_count,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','replied')) AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered','read','replied'))        AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('read','replied'))                    AS read_count,
      COUNT(*) FILTER (WHERE status = 'replied')                              AS replied_count,
      COUNT(*) FILTER (WHERE status = 'failed')                               AS failed_count
    FROM broadcast_recipients
    WHERE broadcast_id = bid
  ) agg
  WHERE b.id = bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Source: 006_automations.sql

-- ============================================================
-- 006_automations.sql — Automations feature
--
-- Idempotent migration — safe to run multiple times.
-- Follows the same conventions as 001_initial_schema.sql:
--   IF NOT EXISTS on tables/indexes, DROP IF EXISTS before
--   re-creating policies/triggers (Postgres has no
--   CREATE POLICY IF NOT EXISTS).
-- ============================================================

-- ============================================================
-- AUTOMATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id);
-- Partial index tuned for the engine's hot path: find active automations
-- whose trigger_type matches the fired event. RLS then narrows by user_id.
CREATE INDEX IF NOT EXISTS idx_automations_active_trigger
  ON automations(trigger_type) WHERE is_active = TRUE;

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own automations" ON automations;
CREATE POLICY "Users can manage own automations" ON automations FOR ALL
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON automations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- AUTOMATION_STEPS
--
-- `position`       — order within parent scope (root scope or a branch).
-- `parent_step_id` — NULL for root-level steps; set to the Condition
--                    step's id for steps that live inside one of its
--                    branches.
-- `branch`         — NULL for root steps. For children of a Condition,
--                    'yes' or 'no' identifying which path.
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE CASCADE,
  branch TEXT CHECK (branch IN ('yes', 'no')),
  step_type TEXT NOT NULL,
  step_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_steps_automation_id
  ON automation_steps(automation_id, position);
CREATE INDEX IF NOT EXISTS idx_automation_steps_parent
  ON automation_steps(parent_step_id) WHERE parent_step_id IS NOT NULL;

ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage steps of own automations" ON automation_steps;
CREATE POLICY "Users can manage steps of own automations" ON automation_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_steps.automation_id
        AND a.user_id = auth.uid()
    )
  );

-- ============================================================
-- AUTOMATION_LOGS
--
-- user_id is denormalized for simple RLS; contact_id is nullable so
-- history survives contact deletion (mirrors migration 004's pattern
-- on broadcast_recipients / deals).
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  trigger_event TEXT NOT NULL,
  steps_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation
  ON automation_logs(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user ON automation_logs(user_id);

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own automation logs" ON automation_logs;
CREATE POLICY "Users can view own automation logs" ON automation_logs FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- AUTOMATION_PENDING_EXECUTIONS
--
-- Queue row created when a running automation hits a `wait` step.
-- The cron endpoint drains rows where run_at <= now() and status =
-- 'pending', flips them to 'running', and resumes the automation
-- from `next_step_position` with the saved `context` jsonb.
--
-- Service-role only — writes never originate from the browser, and
-- the engine uses the service-role client. No user policy exposed.
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_pending_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  log_id UUID REFERENCES automation_logs(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE SET NULL,
  branch TEXT CHECK (branch IN ('yes', 'no')),
  next_step_position INTEGER NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_pending_due
  ON automation_pending_executions(run_at) WHERE status = 'pending';

ALTER TABLE automation_pending_executions ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policy for authenticated users — all
-- access is server-side via the service-role key.


-- Source: 007_automations_increment_counter.sql

-- ============================================================
-- 007_automations_increment_counter.sql
--
-- Atomic increment of automations.execution_count + refresh of
-- last_executed_at. Called via PostgREST RPC from the engine.
--
-- Before this, the engine did a read-modify-write:
--   UPDATE automations SET execution_count = <cached + 1> WHERE id = ...
-- so two concurrent dispatches (e.g. the same automation firing for
-- two different contacts in the same second) could both read N and
-- both write N+1, permanently losing one count.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_automation_execution_count(p_automation_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE automations
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_automation_id;
$$;

-- Only the service role needs to call this (engine uses the
-- service-role client). Explicitly lock anon / authenticated out so
-- an authenticated user can't juice someone else's counter via RPC.
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_automation_execution_count(UUID) TO service_role;


-- Source: 008_profile_avatars_storage.sql

-- ============================================================
-- 008_profile_avatars_storage.sql
--
-- Creates the `avatars` Supabase Storage bucket and the RLS policies
-- that let each user manage only their own avatar file while letting
-- everyone read (so rendering <img> tags without signed URLs works).
--
-- File path convention used by the app:
--   avatars/{auth.uid()}/avatar-<timestamp>.<ext>
-- The policies rely on the first path segment matching auth.uid()::text.
--
-- Idempotent — safe to re-run.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies live on storage.objects. Drop-if-exists because Postgres
-- has no CREATE POLICY IF NOT EXISTS, and we want this migration to
-- re-run cleanly.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- Source: 009_message_actions.sql

-- ============================================================
-- Chat actions: reply linkage + reactions
--
-- Adds two things the chat UI now needs:
--
--   1. `messages.reply_to_message_id` — a self-FK so a message can
--      point at the message it replies to. We use the internal UUID
--      (not Meta's message_id text), because Meta IDs aren't unique
--      across phone numbers and can't be FK-constrained. The webhook
--      resolves `context.id` from Meta into our internal UUID before
--      writing. ON DELETE SET NULL — a deleted parent must not nuke
--      its replies (which today never happens, but the constraint
--      should match intent).
--
--   2. `message_reactions` table — one row per (message, actor).
--      Reactions arrive concurrently from agents (UI) and customers
--      (webhook). A row-level uniqueness constraint enforces "one
--      reaction per actor per message" without read-modify-write
--      games on a JSONB column.
--
--      `conversation_id` is denormalised purely so Supabase Realtime
--      can filter on it with a plain `eq`. Realtime can't join.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Reply linkage on messages
-- ============================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
  REFERENCES messages(id) ON DELETE SET NULL;

-- Partial index — most messages aren't replies, so skip nulls.
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

-- ============================================================
-- 2. message_reactions
-- ============================================================
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'agent')),
  actor_id UUID,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, actor_type, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation
  ON message_reactions(conversation_id);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions(message_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see reactions on their conversations" ON message_reactions;
CREATE POLICY "Users see reactions on their conversations" ON message_reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = message_reactions.conversation_id
      AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users insert reactions on their conversations" ON message_reactions;
CREATE POLICY "Users insert reactions on their conversations" ON message_reactions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = message_reactions.conversation_id
      AND c.user_id = auth.uid()
  ));

-- Agents may remove their own reactions. Customer reactions are managed
-- by the webhook (service-role bypass), not the UI.
DROP POLICY IF EXISTS "Users delete their own agent reactions" ON message_reactions;
CREATE POLICY "Users delete their own agent reactions" ON message_reactions FOR DELETE
  USING (
    actor_type = 'agent'
    AND actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = message_reactions.conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- Agents may swap their own reaction emoji (UPDATE path is also used by
-- the upsert in /api/whatsapp/react).
DROP POLICY IF EXISTS "Users update their own agent reactions" ON message_reactions;
CREATE POLICY "Users update their own agent reactions" ON message_reactions FOR UPDATE
  USING (
    actor_type = 'agent'
    AND actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = message_reactions.conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- Realtime — let the thread subscribe filtered by conversation_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
END $$;


-- Source: 010_flows.sql

-- ============================================================
-- Conversational Flows: stateful, branching WhatsApp chatbot.
--
-- What this migration adds:
--
--   1. `flows` — the definition envelope (name, trigger config,
--      entry node, fallback policy, status). One row per authored bot.
--
--   2. `flow_nodes` — the graph rows. Edges live INSIDE each node's
--      `config` JSONB (e.g. each button row carries its own
--      `next_node_key`). Why edges-in-config rather than a separate
--      `flow_edges` table:
--        - The runner only ever asks "given current node X, where does
--          reply Y go?" — that's a single-row lookup with the JSON
--          already on the row. Splitting edges out forces a join per
--          inbound message.
--        - The builder's natural unit of edit is the node ("change this
--          button's label and target"); a side table would force
--          coordinated inserts/deletes on every save.
--      Cross-node integrity is enforced at save-time by the validator
--      (mirrors what `automation_steps`/`validate.ts` already does).
--
--      `node_key` is a STABLE STRING (e.g. "menu_existing"), not the
--      UUID. Edge targets reference node_key, which means:
--        - Cloning a flow doesn't require UUID rewriting in JSON edges.
--        - Templates ship with human-readable keys.
--        - Direct DB inspection is debuggable.
--      The (flow_id, node_key) UNIQUE constraint guarantees lookup
--      determinism.
--
--   3. `flow_runs` — per-contact runtime state machine. The linchpin
--      is the partial unique index `idx_one_active_run_per_contact`:
--      at most one ACTIVE run per (user_id, contact_id). Two concurrent
--      webhook deliveries trying to start a run both attempt INSERT;
--      the second fails with 23505 and the runner catches & exits.
--      No locking required.
--
--   4. `flow_run_events` — append-only audit. Used by the runner for
--      idempotency (refuses to advance twice on the same Meta
--      message_id) and by the future run-history viewer.
--
--   5. Widens `messages.content_type` CHECK to allow 'interactive', and
--      adds `messages.interactive_reply_id`. With this, button/list
--      taps become first-class message rows with a queryable reply id
--      instead of getting silently coerced into the "Unsupported
--      message type" fallback in parseMessageContent.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Messages table — widen content_type, add interactive_reply_id
-- ============================================================

-- Drop & re-add the CHECK constraint to add 'interactive' as an allowed
-- value. Migration 001 named it `messages_content_type_check` (Postgres
-- default for an inline CHECK on a TEXT column).
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_content_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN (
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive'
  ));

-- Reply id of the button / list row the customer tapped. NULL for
-- everything that isn't an interactive reply. No FK — Meta button ids
-- are arbitrary user-chosen strings, not row references.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS interactive_reply_id TEXT;

-- ============================================================
-- 2. flows
-- ============================================================
CREATE TABLE IF NOT EXISTS flows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('keyword', 'first_inbound_message', 'manual')),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- References `flow_nodes.node_key` (a string, not the UUID). NULL
  -- while the flow is being authored; required before activation
  -- (enforced by the validator, not at the DB level so drafts can save).
  entry_node_id TEXT,
  fallback_policy JSONB NOT NULL DEFAULT
    '{"on_unknown_reply":"reprompt","max_reprompts":2,"on_timeout_hours":24,"on_exhaust":"handoff"}'::jsonb,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active-only lookups dominate the runner's hot path. Partial index
-- keeps it small even when archived flows accumulate.
CREATE INDEX IF NOT EXISTS idx_flows_active_trigger
  ON flows(user_id, trigger_type)
  WHERE status = 'active';

ALTER TABLE flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own flows" ON flows;
CREATE POLICY "Users can manage own flows" ON flows FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. flow_nodes
-- ============================================================
CREATE TABLE IF NOT EXISTS flow_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN (
    'start',
    'send_buttons',
    'send_list',
    'send_message',
    'collect_input',
    'condition',
    'set_tag',
    'handoff',
    'http_fetch',
    'end'
  )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Reserved for the v2 react-flow canvas. v1 list editor leaves both
  -- at 0; carrying the columns now avoids a follow-up migration when
  -- the canvas ships.
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow
  ON flow_nodes(flow_id);

ALTER TABLE flow_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage nodes on their flows" ON flow_nodes;
CREATE POLICY "Users manage nodes on their flows" ON flow_nodes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM flows f
    WHERE f.id = flow_nodes.flow_id
      AND f.user_id = auth.uid()
  ));

-- ============================================================
-- 4. flow_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS flow_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- contact_id intentionally SET NULL on delete (matches the
  -- automation_logs / broadcast_recipients pattern in migration 004):
  -- deleting a contact must not erase the historical audit trail.
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',           -- currently awaiting customer input
    'completed',        -- reached an end node naturally
    'handed_off',       -- ended via a handoff node
    'timed_out',        -- swept by the cron after fallback_policy.on_timeout_hours
    'paused_by_agent',  -- an agent manually replied; flow yielded
    'failed'            -- runner hit an unrecoverable error
  )),
  current_node_key TEXT,
  last_prompt_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  -- Captured collect_input values + http_fetch responses. Interpolated
  -- into downstream node configs at advance time.
  vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  reprompt_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_advanced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT
);

-- Linchpin of idempotency / concurrency safety. At most one active run
-- per (user_id, contact_id). Two concurrent webhook deliveries each
-- trying to start a run will collide on this index; the second INSERT
-- fails with 23505 and the runner catches & returns consumed:true.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_contact
  ON flow_runs(user_id, contact_id)
  WHERE status = 'active';

-- Cron sweep query: "find active runs older than X hours" needs to be
-- index-supported so the sweeper stays cheap as flow volume grows.
CREATE INDEX IF NOT EXISTS idx_flow_runs_active_advanced
  ON flow_runs(last_advanced_at)
  WHERE status = 'active';

-- Detail / history page queries: "list runs for this flow, newest first".
CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_started
  ON flow_runs(flow_id, started_at DESC);

ALTER TABLE flow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own flow runs" ON flow_runs;
CREATE POLICY "Users see own flow runs" ON flow_runs FOR SELECT
  USING (auth.uid() = user_id);

-- The runner uses service_role for all writes; users never INSERT /
-- UPDATE / DELETE flow_runs from the client. Omitting those policies
-- keeps the surface tight (mirrors automation_pending_executions).

-- ============================================================
-- 5. flow_run_events
-- ============================================================
CREATE TABLE IF NOT EXISTS flow_run_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_run_id UUID NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'started',
    'node_entered',
    'message_sent',
    'reply_received',
    'fallback_fired',
    'handoff',
    'timeout',
    'error',
    'completed'
  )),
  node_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency check in the runner needs fast lookup by
-- (flow_run_id, event_type, payload->>'meta_message_id'). The runner
-- does the JSONB extraction client-side; index just needs the first
-- two columns to narrow.
CREATE INDEX IF NOT EXISTS idx_flow_run_events_run_type
  ON flow_run_events(flow_run_id, event_type);

-- History viewer: reverse-chronological scan per run.
CREATE INDEX IF NOT EXISTS idx_flow_run_events_run_time
  ON flow_run_events(flow_run_id, created_at DESC);

ALTER TABLE flow_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see events on their runs" ON flow_run_events;
CREATE POLICY "Users see events on their runs" ON flow_run_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM flow_runs r
    WHERE r.id = flow_run_events.flow_run_id
      AND r.user_id = auth.uid()
  ));

-- ============================================================
-- 6. updated_at trigger on flows
-- ============================================================
-- Reuses update_updated_at_column() from migration 001. Trigger name
-- matches the convention used on every other table that has one
-- (see migration 001 lines 361-367).
DROP TRIGGER IF EXISTS set_updated_at ON flows;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON flows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. Realtime publication
-- ============================================================
-- Add flow_runs so the inbox can render "this contact is in flow X at
-- node Y" live as the runner advances. Other flow tables don't need
-- realtime — the builder reads on demand, the runner is server-side.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'flow_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE flow_runs;
  END IF;
END $$;


-- Source: 011_profile_beta_features.sql

-- ============================================================
-- Per-account beta feature flag column on `profiles`.
--
-- Adds an array of opted-in beta feature keys to each profile row.
-- Currently used to gate the Flows feature (`'flows'`); shape is
-- generic so subsequent betas (e.g. `'ai_replies'`, `'voice_notes'`)
-- can land in this column without another migration.
--
-- Why a per-account flag rather than a global env var:
--   - Self-hosted wacrm instances are multi-user (small teams, shared
--     workspaces). A global flag would force every account on the
--     instance to opt into a not-yet-stable feature simultaneously.
--   - The owner wanted to dogfood the feature on their own account
--     before exposing it to teammates. Flipping a column via
--     Supabase Studio (`UPDATE profiles SET beta_features = ...
--     WHERE user_id = '<theirs>'`) is the lowest-friction toggle.
--   - DB-managed flags survive env rotation, deploy-restart timing,
--     and (since beta_features is a TEXT[]) extend naturally to
--     additional features without further schema work.
--
-- Default is the empty array, so every existing profile row opts
-- out of every beta feature on apply. NOT NULL keeps callers from
-- having to defend against `beta_features == null` at every site.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS beta_features TEXT[]
    NOT NULL
    DEFAULT ARRAY[]::TEXT[];

-- No new RLS policy needed: the existing `Users can view own profile` /
-- `Users can update own profile` policies (migration 001) already gate
-- access to this column. Server-side reads via service_role bypass RLS
-- as they do for every other column.
--
-- No index needed: the column is read on the login codepath (one row
-- lookup by primary key / user_id, both already indexed) and very
-- rarely written.


-- Source: 012_flows_increment_counter.sql

-- ============================================================
-- 012_flows_increment_counter.sql
--
-- Atomic increment of flows.execution_count + refresh of
-- last_executed_at. Called via PostgREST RPC from the engine.
--
-- Before this, startNewRun did a read-modify-write:
--   UPDATE flows SET execution_count = <cached + 1> WHERE id = ...
-- so two concurrent dispatches (e.g. two webhooks for the same flow
-- starting runs for different contacts in the same second) could both
-- read N and both write N+1, permanently losing one count.
--
-- Mirrors migration 007 for automations — same shape, same security
-- posture. Idempotent: safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_flow_execution_count(p_flow_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE flows
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_flow_id;
$$;

-- Only the service role needs to call this (engine uses the
-- service-role client). Explicitly lock anon / authenticated out so
-- an authenticated user can't juice someone else's counter via RPC.
REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_flow_execution_count(UUID) TO service_role;


-- Source: 013_whatsapp_config_phone_number_id_unique.sql

-- ============================================================
-- whatsapp_config: enforce one user per phone_number_id
--
-- The webhook routes inbound messages by `phone_number_id` and uses
-- `.single()` to find the owning config row. If two users have saved
-- the same `phone_number_id`, `.single()` errors PGRST116 ("multiple
-- rows returned") and the webhook silently drops every inbound
-- message — see issue #136.
--
-- wacrm is single-tenant per WhatsApp number by design (RLS on
-- conversations / messages is `auth.uid() = user_id`, so another user
-- physically cannot read a conversation routed to a different owner).
-- A UNIQUE constraint at the DB level makes that intent enforceable
-- and stops races between the app-level check and the insert.
--
-- ─── On existing data ───────────────────────────────────────────
-- If duplicates already exist in production, this migration FAILS
-- LOUDLY rather than silently dropping rows. Auto-deduping would
-- destroy user data (encrypted tokens, connection state) — the
-- operator has to choose which user keeps the number. To resolve:
--
--   SELECT phone_number_id, array_agg(user_id) AS owners
--   FROM whatsapp_config
--   GROUP BY phone_number_id
--   HAVING count(*) > 1;
--
-- Then DELETE the duplicate rows you don't want to keep and re-run
-- migrations.
--
-- Idempotent — safe to run multiple times once the constraint is in
-- place.
-- ============================================================

-- 1. Fail loudly if duplicates exist. Spelling out the conflicting
--    phone_number_id and the user_ids that own it gives the operator
--    a copy-pasteable starting point.
DO $$
DECLARE
  conflict_count INT;
  sample TEXT;
BEGIN
  SELECT count(*) INTO conflict_count
  FROM (
    SELECT phone_number_id
    FROM whatsapp_config
    GROUP BY phone_number_id
    HAVING count(*) > 1
  ) dupes;

  IF conflict_count > 0 THEN
    SELECT string_agg(
      phone_number_id || ' -> [' || array_to_string(owners, ', ') || ']',
      E'\n  '
    )
    INTO sample
    FROM (
      SELECT phone_number_id, array_agg(user_id::text) AS owners
      FROM whatsapp_config
      GROUP BY phone_number_id
      HAVING count(*) > 1
    ) dupe_detail;

    RAISE EXCEPTION
      E'Cannot add UNIQUE(phone_number_id) on whatsapp_config — % phone_number_id value(s) are claimed by more than one user:\n  %\nDelete the duplicate rows you do not want to keep (see migration comment), then re-run migrations.',
      conflict_count,
      sample;
  END IF;
END $$;

-- 2. Add the UNIQUE constraint. PostgreSQL has no "ADD CONSTRAINT IF
--    NOT EXISTS", so guard via pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_config_phone_number_id_key'
      AND conrelid = 'whatsapp_config'::regclass
  ) THEN
    ALTER TABLE whatsapp_config
      ADD CONSTRAINT whatsapp_config_phone_number_id_key
      UNIQUE (phone_number_id);
  END IF;
END $$;


-- Source: 014_message_templates_meta_integration.sql

-- ============================================================
-- message_templates: Meta-integration columns + raw-enum status
--
-- Why this exists:
--   The original schema (001) treated message_templates as a local
--   catalog with a TitleCase status ('Draft'|'Pending'|'Approved'|
--   'Rejected'). When the sync route imports from Meta, several of
--   Meta's real statuses (PAUSED, DISABLED, IN_APPEAL, PENDING_REVIEW)
--   got collapsed into the four-bucket TitleCase set — losing
--   information that the upcoming submit / edit / resubmit flows
--   need (e.g. a PAUSED template is recoverable; a DISABLED one is
--   gone for 30 days; an IN_APPEAL one shouldn't be edited).
--
--   This migration switches `status` to the raw Meta enum and adds
--   the columns the submit/webhook/edit flows need:
--
--     - sample_values    JSONB     {body: string[], header: string[]}
--                                  required by Meta for variable templates
--     - meta_template_id TEXT      Meta's id once the template is
--                                  submitted; used as hsm_id on edit/delete
--                                  so we scope to a single language
--     - rejection_reason TEXT      surfaced from webhook on REJECTED
--     - quality_score    TEXT      GREEN | YELLOW | RED, from webhook
--     - header_handle    TEXT      from Resumable Upload, for media headers
--     - header_media_url TEXT      URL fallback for media headers (v1 path)
--     - submission_error TEXT      last 4xx from Meta on submit, for retry
--     - last_submitted_at          rate-limit awareness (100 creates/hour)
--
--   Also adds a unique index on (user_id, name, language) so the sync
--   upsert can match on it instead of select-then-insert, and so users
--   can't create two local rows for the same Meta template variant.
--
--   Buttons CHECK enforces a shape guard (array of objects with a
--   recognised `type`) at the DB level — strict per-type validation
--   lives in the API layer so error messages can be specific.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. New columns. ADD COLUMN IF NOT EXISTS is idempotent.
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS sample_values JSONB,
  ADD COLUMN IF NOT EXISTS meta_template_id TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS quality_score TEXT,
  ADD COLUMN IF NOT EXISTS header_handle TEXT,
  ADD COLUMN IF NOT EXISTS header_media_url TEXT,
  ADD COLUMN IF NOT EXISTS submission_error TEXT,
  ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ;

-- 2. quality_score CHECK — GREEN / YELLOW / RED only (or NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_templates_quality_score_check'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_quality_score_check
      CHECK (quality_score IS NULL OR quality_score IN ('GREEN', 'YELLOW', 'RED'));
  END IF;
END $$;

-- 3. status: swap TitleCase enum for raw Meta enum.
--    Order: drop old check → backfill data → add new check → update default.
--    Doing it in this order means rows are momentarily check-free, but
--    the backfill is a single UPDATE so the window is microseconds.
DO $$
BEGIN
  -- Drop the legacy check by introspecting pg_constraint (the original
  -- constraint name from migration 001 is auto-generated; match by
  -- column + table).
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'message_templates'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%Draft%Pending%Approved%Rejected%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE message_templates DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint c
      WHERE c.conrelid = 'message_templates'::regclass
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%status%Draft%Pending%Approved%Rejected%'
      LIMIT 1
    );
  END IF;
END $$;

-- Backfill existing rows. Idempotent — already-uppercase rows are no-ops.
UPDATE message_templates SET status = 'DRAFT'    WHERE status = 'Draft';
UPDATE message_templates SET status = 'PENDING'  WHERE status = 'Pending';
UPDATE message_templates SET status = 'APPROVED' WHERE status = 'Approved';
UPDATE message_templates SET status = 'REJECTED' WHERE status = 'Rejected';

-- Add the raw-enum check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_templates_status_meta_check'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_status_meta_check
      CHECK (status IN (
        'DRAFT',
        'PENDING',
        'APPROVED',
        'REJECTED',
        'PAUSED',
        'DISABLED',
        'IN_APPEAL',
        'PENDING_DELETION'
      ));
  END IF;
END $$;

-- New default for fresh inserts.
ALTER TABLE message_templates ALTER COLUMN status SET DEFAULT 'DRAFT';

-- 4. buttons shape guard. Postgres disallows subqueries in CHECK
--    constraints, so we can only assert the outer shape here (is-array
--    + max length). Per-element type validation (recognised `type`
--    values, max counts per type, QUICK_REPLY-vs-CTA exclusivity, URL
--    example required when {{1}} is present) lives in the API
--    validators in src/lib/whatsapp/template-validators.ts — that's
--    where error messages can be specific to the offending button
--    anyway.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_templates_buttons_shape_check'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_buttons_shape_check
      CHECK (
        buttons IS NULL
        OR (
          jsonb_typeof(buttons) = 'array'
          AND jsonb_array_length(buttons) <= 10
        )
      );
  END IF;
END $$;

-- 5. Unique index on (user_id, name, language). Fails loudly on
--    duplicates rather than dropping rows — the operator picks which
--    one to keep (same pattern as migration 013).
DO $$
DECLARE
  dupe_count INT;
  sample TEXT;
BEGIN
  SELECT count(*) INTO dupe_count
  FROM (
    SELECT user_id, name, language
    FROM message_templates
    GROUP BY user_id, name, language
    HAVING count(*) > 1
  ) dupes;

  IF dupe_count > 0 THEN
    SELECT string_agg(
      user_id::text || ' / ' || name || ' / ' || COALESCE(language, '(null)') ||
        ' (' || count || ' rows)',
      E'\n  '
    )
    INTO sample
    FROM (
      SELECT user_id, name, language, count(*) AS count
      FROM message_templates
      GROUP BY user_id, name, language
      HAVING count(*) > 1
    ) dupe_detail;

    RAISE EXCEPTION
      E'Cannot add UNIQUE(user_id, name, language) on message_templates — % duplicate combination(s):\n  %\nDelete the rows you do not want to keep, then re-run migrations.',
      dupe_count, sample;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS message_templates_user_name_language_key
  ON message_templates (user_id, name, language);

-- 6. Lookup index for the webhook handler — incoming events identify
--    templates by (waba_id, meta_template_id). meta_template_id is the
--    discriminator we'll match on.
CREATE INDEX IF NOT EXISTS idx_message_templates_meta_template_id
  ON message_templates (meta_template_id)
  WHERE meta_template_id IS NOT NULL;


-- Source: 015_whatsapp_config_registration.sql

-- ============================================================
-- whatsapp_config: track Meta Cloud API registration state
--
-- Why this exists:
--   Saving a row to whatsapp_config does NOT make a phone number
--   actually receive webhook events from Meta. Two extra Cloud API
--   calls are required:
--
--     POST /{phone_number_id}/register     — subscribes the number
--                                            with a 2FA PIN, makes
--                                            it routable to OUR app
--     POST /{waba_id}/subscribed_apps      — subscribes the WABA
--                                            (one-time per app, but
--                                            idempotent so we can
--                                            call on every save)
--
--   Until those two complete successfully, Meta routes inbound
--   events to whichever app last registered the number (often the
--   one that did Embedded Signup originally). Symptom: a second
--   wacrm user adds a second number under the same WABA, the UI
--   reports "Connected" because metadata verification succeeds,
--   but Meta's activity log shows zero events for that number.
--
--   These columns let the UI distinguish "credentials saved" from
--   "actually live" and let users retry registration without
--   re-entering everything.
--
-- Backfill: every column is nullable. Existing rows survive with
-- NULL values; the UI shows them as "registration status unknown —
-- click Verify Registration" and the diagnostic endpoint fills the
-- timestamps on the next probe.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscribed_apps_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_registration_error TEXT;

-- Index supports the "find all numbers awaiting registration"
-- query a future admin dashboard might want; cheap to maintain.
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_registered_at
  ON whatsapp_config (registered_at)
  WHERE registered_at IS NULL;


-- Source: 016_flow_media.sql

-- ============================================================
-- 016_flow_media.sql
--
-- Adds support for media nodes in conversational flows:
--
--   1. New 'send_media' value on `flow_nodes.node_type` CHECK
--      constraint. Mirrors the same drop-and-recreate pattern migration
--      010 used to land the original list. The node config lives in
--      JSONB and is shape-checked by the validator + TS types, not the
--      DB.
--
--   2. `flow-media` Supabase Storage bucket where the builder uploads
--      the file the customer will receive. Public bucket so Meta can
--      pull the URL without auth — same trade-off as the avatars
--      bucket (see migration 008). Per-user RLS on writes scopes the
--      bucket so one tenant can't read/overwrite another's media.
--
--      Path convention:
--        flow-media/{auth.uid()}/<timestamp>-<basename>.<ext>
--      First path segment must equal auth.uid()::text — same shape
--      migration 008 uses for avatars so the policy code reads the
--      same.
--
--      Size limit 16 MB — Meta's WhatsApp Cloud API caps documents at
--      100 MB but videos at 16 MB and images at 5 MB; we pick the
--      tightest universal cap that still works for the document case
--      that prompted this feature (PDF invoices / receipts).
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. flow_nodes.node_type — add 'send_media'
-- ============================================================
ALTER TABLE flow_nodes
  DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;

ALTER TABLE flow_nodes
  ADD CONSTRAINT flow_nodes_node_type_check
  CHECK (node_type IN (
    'start',
    'send_buttons',
    'send_list',
    'send_message',
    'send_media',
    'collect_input',
    'condition',
    'set_tag',
    'handoff',
    'http_fetch',
    'end'
  ));

-- ============================================================
-- 2. flow-media storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'flow-media',
  'flow-media',
  TRUE,
  16777216, -- 16 MB (Meta video cap; documents/images fit under this)
  ARRAY[
    -- Images
    'image/png', 'image/jpeg', 'image/webp',
    -- Videos
    'video/mp4', 'video/3gpp',
    -- Documents
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies live on storage.objects. Same drop-then-create pattern as
-- migration 008 (no CREATE POLICY IF NOT EXISTS in Postgres).
DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;
CREATE POLICY "Flow media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'flow-media');

DROP POLICY IF EXISTS "Users can upload their own flow media" ON storage.objects;
CREATE POLICY "Users can upload their own flow media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'flow-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update their own flow media" ON storage.objects;
CREATE POLICY "Users can update their own flow media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'flow-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own flow media" ON storage.objects;
CREATE POLICY "Users can delete their own flow media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'flow-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- Source: 017_account_sharing.sql

-- ============================================================
-- 017_account_sharing.sql — Multi-user accounts (foundation)
--
-- Turns wacrm from single-tenant-per-user into multi-tenant-per-
-- account. Every existing user becomes the sole `owner` of a
-- freshly-created account; every existing row is backfilled with
-- that account's id. Post-apply behaviour is identical to before
-- *until* a teammate is invited (which lands in later PRs).
--
-- What this migration does
--   1. Introduces `account_role_enum` and tables `accounts` /
--      `account_invitations`.
--   2. Adds an `is_account_member(account_id, min_role)` SECURITY
--      DEFINER helper used by every policy below.
--   3. Adds `account_id` (+ `account_role` on `profiles`) to every
--      table that previously carried a `user_id` FK to auth.users.
--   4. Backfills one account per existing user and propagates
--      `account_id` to every domain row.
--   5. Drops the old `auth.uid() = user_id` policies and replaces
--      them with membership-checked equivalents. Viewers may read;
--      agents+ may write to operational data; admins+ may write to
--      settings-class tables.
--   6. Swaps `whatsapp_config.UNIQUE(user_id)` for
--      `UNIQUE(account_id)` — one WhatsApp number per account.
--   7. Swaps the `flow_runs` "one active run per (user_id, contact)"
--      unique index for `(account_id, contact_id)`.
--   8. Replaces `handle_new_user` so new signups receive a freshly-
--      created personal account *and* the `owner` role atomically.
--
-- What this migration does NOT touch
--   - `profiles.role TEXT` (legacy, unused) stays. Flag for removal
--     in a later cleanup.
--   - The `user_id` columns on domain tables stay too — they still
--     identify "the agent who owns this row" (assignment, audit).
--     They are *no longer* used for tenancy isolation.
--   - Storage buckets (avatars, flow-media) stay user-scoped. A
--     later migration will rescope flow-media to account paths.
--   - No user-facing UI changes — those are gated separately on
--     `profiles.beta_features` containing 'account_sharing' in the
--     follow-up PRs.
--
-- Idempotent — safe to run multiple times. New columns use
-- IF NOT EXISTS; policies / triggers / indexes are dropped before
-- recreate (Postgres has no CREATE POLICY IF NOT EXISTS).
-- ============================================================

-- ============================================================
-- TYPES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_role_enum') THEN
    CREATE TYPE account_role_enum AS ENUM ('owner', 'admin', 'agent', 'viewer');
  END IF;
END $$;

-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  -- owner_user_id is denormalised for fast "is this user the owner of
  -- their account" reads and for the one-account-per-user invariant
  -- below. The source of truth for membership is profiles.account_id.
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One account per user (the locked design decision — single
-- membership). Drops automatically if we ever relax to many-to-many.
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_one_per_owner
  ON accounts(owner_user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ACCOUNT_INVITATIONS
--
-- One row per outstanding invite link. We store `token_hash` (SHA-
-- 256) rather than the raw token so a leaked DB snapshot doesn't
-- yield a usable invite. The plaintext token is returned exactly
-- once by the POST endpoint at creation time and never persisted.
-- ============================================================
CREATE TABLE IF NOT EXISTS account_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role account_role_enum NOT NULL CHECK (role <> 'owner'),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_account_invitations_account_pending
  ON account_invitations(account_id, expires_at)
  WHERE accepted_at IS NULL;

ALTER TABLE account_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILE EXTENSION
--
-- account_role lives on profiles (not a separate memberships table)
-- because the design is one-account-per-user; this keeps reads cheap
-- (one row, already loaded by the auth hook).
--
-- Added BEFORE the is_account_member helper below because LANGUAGE
-- sql functions resolve column references at CREATE time (unlike
-- plpgsql, which defers to call time).
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS account_role account_role_enum;

CREATE INDEX IF NOT EXISTS idx_profiles_account_role
  ON profiles(account_id, account_role);

-- ============================================================
-- MEMBERSHIP HELPER
--
-- SECURITY DEFINER so the policy body can read `profiles` without
-- recursive RLS evaluation. Returns true iff `auth.uid()` is a
-- member of `target_account_id` with at least `min_role`.
--
-- Role hierarchy: owner > admin > agent > viewer.
-- ============================================================
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

-- ============================================================
-- ADD account_id TO EVERY PARENT TENANT TABLE
--
-- Nullable for now — backfill runs below, then NOT NULL applied at
-- the end. Indexes too: every "list mine" query becomes "list my
-- account's", so account_id is the new hot lookup key.
-- ============================================================
ALTER TABLE contacts                       ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE tags                           ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE custom_fields                  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE contact_notes                  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE conversations                  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_config                ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE message_templates              ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE pipelines                      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE deals                          ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE broadcasts                     ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE automations                    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE automation_logs                ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE automation_pending_executions  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE flows                          ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE flow_runs                      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;

-- ============================================================
-- BACKFILL
--
-- Order is load-bearing:
--   1. Create one account per existing profile (the existing user
--      is the owner).
--   2. Stamp profile.account_id / account_role from the row above.
--   3. Propagate account_id to every domain table via the profile.
--   4. Apply NOT NULL on every account_id column.
--
-- Wrapped in a DO block so a partially-applied migration (e.g.
-- accounts already exist but propagation didn't finish) re-converges
-- on re-run rather than duplicating accounts.
-- ============================================================
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'contacts', 'tags', 'custom_fields', 'contact_notes',
    'conversations', 'whatsapp_config', 'message_templates',
    'pipelines', 'deals', 'broadcasts',
    'automations', 'automation_logs', 'automation_pending_executions',
    'flows', 'flow_runs'
  ];
BEGIN
  -- (1) Create one account per existing profile whose user does not
  -- yet own one. Idempotent: skips users that already have an account.
  INSERT INTO accounts (name, owner_user_id)
  SELECT COALESCE(NULLIF(p.full_name, ''), p.email, 'My account'),
         p.user_id
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.owner_user_id = p.user_id
  );

  -- (2) Stamp profile.account_id / account_role for every profile that
  -- hasn't been linked yet.
  UPDATE profiles p
  SET account_id   = a.id,
      account_role = 'owner'
  FROM accounts a
  WHERE a.owner_user_id = p.user_id
    AND p.account_id IS NULL;

  -- (3) Propagate account_id to every domain table. Uses the row's
  -- existing user_id → profiles.user_id → profiles.account_id chain.
  -- Only updates rows where account_id IS NULL so a re-run is cheap.
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format($f$
      UPDATE %I t
      SET account_id = p.account_id
      FROM profiles p
      WHERE t.user_id = p.user_id
        AND t.account_id IS NULL
    $f$, v_table);
  END LOOP;
END $$;

-- (4) NOT NULL — split out from the DO block so DDL changes happen
-- at the top transactional level. Idempotent: NOT NULL on an
-- already-NOT NULL column is a no-op error-free.
ALTER TABLE profiles                       ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE profiles                       ALTER COLUMN account_role SET NOT NULL;
ALTER TABLE contacts                       ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE tags                           ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE custom_fields                  ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE contact_notes                  ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE conversations                  ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE whatsapp_config                ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE message_templates              ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE pipelines                      ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE deals                          ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE broadcasts                     ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE automations                    ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE automation_logs                ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE automation_pending_executions  ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE flows                          ALTER COLUMN account_id   SET NOT NULL;
ALTER TABLE flow_runs                      ALTER COLUMN account_id   SET NOT NULL;

-- ============================================================
-- INDEXES ON account_id (every parent — these are the new hot keys)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contacts_account                ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_tags_account                    ON tags(account_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_account           ON custom_fields(account_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_account           ON contact_notes(account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_account           ON conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_account         ON whatsapp_config(account_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_account       ON message_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_account               ON pipelines(account_id);
CREATE INDEX IF NOT EXISTS idx_deals_account                   ON deals(account_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_account              ON broadcasts(account_id);
CREATE INDEX IF NOT EXISTS idx_automations_account             ON automations(account_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_account         ON automation_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_automation_pending_account      ON automation_pending_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_flows_account                   ON flows(account_id);
CREATE INDEX IF NOT EXISTS idx_flow_runs_account               ON flow_runs(account_id);

-- ============================================================
-- whatsapp_config: one WhatsApp number per ACCOUNT
--
-- Was UNIQUE(user_id). Same number cannot be configured by two
-- accounts; same account cannot register two numbers. If multi-
-- number-per-account is ever wanted, drop the unique and add a
-- "primary" boolean.
-- ============================================================
ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_user_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_config_account_id_key'
  ) THEN
    ALTER TABLE whatsapp_config ADD CONSTRAINT whatsapp_config_account_id_key UNIQUE (account_id);
  END IF;
END $$;

-- ============================================================
-- flow_runs: idempotency key swaps to (account_id, contact_id)
--
-- The "at most one active run per contact" invariant is per-account
-- now — two accounts that happen to share a contact phone number
-- must be able to run their own flows independently.
-- ============================================================
DROP INDEX IF EXISTS idx_one_active_run_per_contact;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_contact
  ON flow_runs(account_id, contact_id)
  WHERE status = 'active';

-- ============================================================
-- RLS REWRITE — PARENT TABLES
--
-- Replaces every `auth.uid() = user_id` policy with the membership
-- check. Three policy tiers:
--   - viewer    : SELECT  (read-only)
--   - agent+    : SELECT + INSERT/UPDATE/DELETE (operational data)
--   - admin+    : same  + write paths on settings-class tables
--
-- The legacy `user_id` column stays on every row (still useful for
-- assignment + audit) but is no longer consulted for isolation.
-- ============================================================

-- ---- contacts ---------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own contacts" ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT USING (is_account_member(account_id));
CREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY contacts_update ON contacts FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY contacts_delete ON contacts FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- tags (settings-class) -------------------------------------
DROP POLICY IF EXISTS "Users can manage own tags" ON tags;
CREATE POLICY tags_select ON tags FOR SELECT USING (is_account_member(account_id));
CREATE POLICY tags_insert ON tags FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY tags_update ON tags FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY tags_delete ON tags FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- custom_fields (settings-class) ----------------------------
DROP POLICY IF EXISTS "Users can manage own custom fields" ON custom_fields;
CREATE POLICY custom_fields_select ON custom_fields FOR SELECT USING (is_account_member(account_id));
CREATE POLICY custom_fields_insert ON custom_fields FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY custom_fields_update ON custom_fields FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY custom_fields_delete ON custom_fields FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- contact_notes ---------------------------------------------
DROP POLICY IF EXISTS "Users can manage own notes" ON contact_notes;
CREATE POLICY contact_notes_select ON contact_notes FOR SELECT USING (is_account_member(account_id));
CREATE POLICY contact_notes_insert ON contact_notes FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY contact_notes_update ON contact_notes FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY contact_notes_delete ON contact_notes FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- conversations ---------------------------------------------
DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT USING (is_account_member(account_id));
CREATE POLICY conversations_insert ON conversations FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY conversations_update ON conversations FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY conversations_delete ON conversations FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- whatsapp_config (settings-class) --------------------------
DROP POLICY IF EXISTS "Users can manage own config" ON whatsapp_config;
CREATE POLICY whatsapp_config_select ON whatsapp_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY whatsapp_config_insert ON whatsapp_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY whatsapp_config_update ON whatsapp_config FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY whatsapp_config_delete ON whatsapp_config FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- message_templates (settings-class) ------------------------
DROP POLICY IF EXISTS "Users can manage own templates" ON message_templates;
CREATE POLICY message_templates_select ON message_templates FOR SELECT USING (is_account_member(account_id));
CREATE POLICY message_templates_insert ON message_templates FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY message_templates_update ON message_templates FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY message_templates_delete ON message_templates FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- pipelines (settings-class) --------------------------------
DROP POLICY IF EXISTS "Users can manage own pipelines" ON pipelines;
CREATE POLICY pipelines_select ON pipelines FOR SELECT USING (is_account_member(account_id));
CREATE POLICY pipelines_insert ON pipelines FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY pipelines_update ON pipelines FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY pipelines_delete ON pipelines FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- deals ------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own deals" ON deals;
CREATE POLICY deals_select ON deals FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY deals_update ON deals FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY deals_delete ON deals FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- broadcasts -------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own broadcasts" ON broadcasts;
CREATE POLICY broadcasts_select ON broadcasts FOR SELECT USING (is_account_member(account_id));
CREATE POLICY broadcasts_insert ON broadcasts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY broadcasts_update ON broadcasts FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY broadcasts_delete ON broadcasts FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- automations ------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own automations" ON automations;
CREATE POLICY automations_select ON automations FOR SELECT USING (is_account_member(account_id));
CREATE POLICY automations_insert ON automations FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY automations_update ON automations FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY automations_delete ON automations FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- automation_logs -------------------------------------------
DROP POLICY IF EXISTS "Users can view own automation logs" ON automation_logs;
CREATE POLICY automation_logs_select ON automation_logs FOR SELECT USING (is_account_member(account_id));
-- Service role inserts logs; no INSERT/UPDATE/DELETE policy for clients.

-- ---- automation_pending_executions -----------------------------
-- Service-role only (no client policies). Account_id is on the row
-- for consistency and so the cron can route account-scoped queries.

-- ---- flows ------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own flows" ON flows;
CREATE POLICY flows_select ON flows FOR SELECT USING (is_account_member(account_id));
CREATE POLICY flows_insert ON flows FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY flows_update ON flows FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY flows_delete ON flows FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- flow_runs --------------------------------------------------
DROP POLICY IF EXISTS "Users see own flow runs" ON flow_runs;
CREATE POLICY flow_runs_select ON flow_runs FOR SELECT USING (is_account_member(account_id));
-- Service-role driven; no client INSERT/UPDATE/DELETE.

-- ============================================================
-- RLS REWRITE — CHILD TABLES (parent-join semantics)
-- ============================================================

-- ---- contact_tags ----------------------------------------------
DROP POLICY IF EXISTS "Users can manage contact tags" ON contact_tags;
CREATE POLICY contact_tags_select ON contact_tags FOR SELECT USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id))
);
CREATE POLICY contact_tags_modify ON contact_tags FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id, 'agent'))
);

-- ---- contact_custom_values -------------------------------------
DROP POLICY IF EXISTS "Users can manage custom values" ON contact_custom_values;
CREATE POLICY contact_custom_values_select ON contact_custom_values FOR SELECT USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id))
);
CREATE POLICY contact_custom_values_modify ON contact_custom_values FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id, 'agent'))
);

-- ---- messages --------------------------------------------------
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Service role can insert messages" ON messages;
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id))
);
CREATE POLICY messages_modify ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id, 'agent'))
);
-- Service-role webhook inserts (Meta deliveries) bypass RLS as before.

-- ---- pipeline_stages -------------------------------------------
DROP POLICY IF EXISTS "Users can manage pipeline stages" ON pipeline_stages;
CREATE POLICY pipeline_stages_select ON pipeline_stages FOR SELECT USING (
  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id))
);
CREATE POLICY pipeline_stages_modify ON pipeline_stages FOR ALL USING (
  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id, 'admin'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id, 'admin'))
);

-- ---- broadcast_recipients --------------------------------------
DROP POLICY IF EXISTS "Users can manage broadcast recipients" ON broadcast_recipients;
CREATE POLICY broadcast_recipients_select ON broadcast_recipients FOR SELECT USING (
  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id))
);
CREATE POLICY broadcast_recipients_modify ON broadcast_recipients FOR ALL USING (
  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id, 'agent'))
);

-- ---- automation_steps ------------------------------------------
DROP POLICY IF EXISTS "Users can manage steps of own automations" ON automation_steps;
CREATE POLICY automation_steps_select ON automation_steps FOR SELECT USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id))
);
CREATE POLICY automation_steps_modify ON automation_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id, 'agent'))
);

-- ---- flow_nodes ------------------------------------------------
DROP POLICY IF EXISTS "Users manage nodes on their flows" ON flow_nodes;
CREATE POLICY flow_nodes_select ON flow_nodes FOR SELECT USING (
  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id))
);
CREATE POLICY flow_nodes_modify ON flow_nodes FOR ALL USING (
  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id, 'agent'))
);

-- ---- flow_run_events -------------------------------------------
DROP POLICY IF EXISTS "Users see events on their runs" ON flow_run_events;
CREATE POLICY flow_run_events_select ON flow_run_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM flow_runs r WHERE r.id = flow_run_events.flow_run_id AND is_account_member(r.account_id))
);

-- ---- message_reactions -----------------------------------------
DROP POLICY IF EXISTS "Users see reactions on their conversations" ON message_reactions;
DROP POLICY IF EXISTS "Users insert reactions on their conversations" ON message_reactions;
DROP POLICY IF EXISTS "Users delete their own agent reactions" ON message_reactions;
DROP POLICY IF EXISTS "Users update their own agent reactions" ON message_reactions;
CREATE POLICY message_reactions_select ON message_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id)
  )
);
CREATE POLICY message_reactions_modify ON message_reactions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id, 'agent')
  )
);

-- ============================================================
-- RLS — PROFILES (revised)
--
-- A profile row is readable by every member of its account so the
-- Members tab can render. It is only writable by the row's own
-- user (so an admin cannot edit a teammate's name/avatar — that's
-- the teammate's own settings). Role changes happen via the
-- separate /api/account/members endpoint (admin-only, server-side).
-- ============================================================
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (auth.uid() = user_id OR is_account_member(account_id));
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- RLS — ACCOUNTS & ACCOUNT_INVITATIONS
--
-- accounts: members read; admins+ update; nobody inserts via
-- client (the signup trigger / redeem RPC own creation).
-- invitations: admins+ full control; everyone else has no
-- visibility. The /api/invitations/[token]/peek endpoint uses the
-- service role to look up by token_hash anonymously.
-- ============================================================
DROP POLICY IF EXISTS accounts_select ON accounts;
DROP POLICY IF EXISTS accounts_update ON accounts;
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (is_account_member(id));
CREATE POLICY accounts_update ON accounts FOR UPDATE
  USING (is_account_member(id, 'admin'))
  WITH CHECK (is_account_member(id, 'admin'));

DROP POLICY IF EXISTS account_invitations_select ON account_invitations;
DROP POLICY IF EXISTS account_invitations_modify ON account_invitations;
CREATE POLICY account_invitations_select ON account_invitations FOR SELECT
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY account_invitations_modify ON account_invitations FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ============================================================
-- SIGNUP TRIGGER — replace to also create a personal account
--
-- Every new auth.users row now produces:
--   - a fresh `accounts` row owned by them
--   - a `profiles` row linked to that account with role = 'owner'
--
-- The invite-redemption RPC (later PR) will reassign profile.account_id
-- to the inviter's account and delete the orphan personal account if
-- it's still empty.
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Source: 018_account_member_rpcs.sql

-- ============================================================
-- 018_account_member_rpcs.sql — RPCs for member management
--
-- Why RPCs and not direct UPDATEs from the client
--
--   The `profiles_update` RLS policy from migration 017 only
--   allows a user to update their *own* profile row. That is
--   correct for self-service edits (name, avatar) but it would
--   block an admin from changing a teammate's role or moving
--   a removed member to a fresh personal account.
--
--   These three SECURITY DEFINER functions are the supervised
--   escape hatches: they bypass RLS to do exactly the writes the
--   matching API route needs, but every function self-checks the
--   caller's authority via `auth.uid()` first, so the privilege
--   bypass is scoped tightly.
--
-- Error contract
--
--   All functions raise Postgres exceptions with these SQLSTATEs:
--     42501 ("insufficient_privilege") — forbidden
--     22023 ("invalid_parameter_value") — bad input / 400
--   The `toErrorResponse` helper on the API side maps each to
--   the right HTTP status, with the RAISE message surfaced to
--   the caller.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- set_member_role(p_user_id, p_new_role)
--
-- Admin+ changes another member's role within the caller's
-- account. Cannot promote to / demote from 'owner' (that is the
-- transfer endpoint). Cannot target self.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_member_role(
  p_user_id UUID,
  p_new_role account_role_enum
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  -- Caller must be authenticated.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Resolve caller's account + role.
  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  -- Caller must be admin+.
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  -- Can't change own role via this endpoint.
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role'
      USING ERRCODE = '22023';
  END IF;

  -- Resolve target.
  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  -- Target must be in caller's account.
  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  -- Owner role changes go through transfer_account_ownership.
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to demote an owner'
      USING ERRCODE = '22023';
  END IF;
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to promote to owner'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET account_role = p_new_role
  WHERE user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.set_member_role(UUID, account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, account_role_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, account_role_enum) TO authenticated;

-- ============================================================
-- remove_account_member(p_user_id)
--
-- Admin+ removes another member from the caller's account. The
-- removed user is NOT deleted from auth.users — they keep their
-- login. Instead, a fresh personal account is created on the fly
-- and their profile is reassigned to it as 'owner'. This is the
-- mirror image of the signup trigger: the user effectively
-- "starts over" with an empty account, free to invite their own
-- teammates if they want.
--
-- Cannot target the owner. Cannot target self.
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_user_id UUID
) RETURNS UUID  -- the new personal account id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
  v_target_name TEXT;
  v_target_email TEXT;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself; transfer ownership or leave the account instead'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role, full_name, email
  INTO v_target_account_id, v_target_role, v_target_name, v_target_email
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the account owner; transfer ownership first'
      USING ERRCODE = '22023';
  END IF;

  -- Spin up a fresh personal account for the removed user. Mirror
  -- of handle_new_user's logic — keep them whole, just relocated.
  INSERT INTO accounts (name, owner_user_id)
  VALUES (
    COALESCE(NULLIF(v_target_name, ''), v_target_email, 'My account'),
    p_user_id
  )
  RETURNING id INTO v_new_account_id;

  UPDATE profiles
  SET account_id = v_new_account_id,
      account_role = 'owner'
  WHERE user_id = p_user_id;

  RETURN v_new_account_id;
END;
$$;

ALTER FUNCTION public.remove_account_member(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_account_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID) TO authenticated;

-- ============================================================
-- transfer_account_ownership(p_new_owner_user_id)
--
-- Owner only. Atomically:
--   - demotes the current owner to 'admin'
--   - promotes the target to 'owner'
--   - updates accounts.owner_user_id
--
-- Both writes happen in the same statement-level transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION public.transfer_account_ownership(
  p_new_owner_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the account owner can transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You are already the owner'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_new_owner_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  -- Demote current owner first so the temporary state where the
  -- account has zero owners is never visible — both writes happen
  -- in the same function transaction.
  UPDATE profiles SET account_role = 'admin'
  WHERE user_id = auth.uid();

  UPDATE profiles SET account_role = 'owner'
  WHERE user_id = p_new_owner_user_id;

  UPDATE accounts SET owner_user_id = p_new_owner_user_id
  WHERE id = v_caller_account_id;
END;
$$;

ALTER FUNCTION public.transfer_account_ownership(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID) TO authenticated;


-- Source: 019_invitation_rpcs.sql

-- ============================================================
-- 019_invitation_rpcs.sql — peek + redeem invitation RPCs
--
-- The third and last server-side migration in the multi-user
-- accounts series. Both functions are SECURITY DEFINER for the
-- same reason as the member RPCs in 018: the writes they need to
-- do (or, for peek, the reads) cross RLS boundaries that the
-- regular client policies (correctly) deny.
--
-- peek_invitation   — anonymous read. The /join/<token> page
--   calls this to render "You're being invited to <Account> as
--   <Role>" before the visitor signs in. Returns a uniform
--   `{ ok, reason?, account_name?, role?, expires_at? }` JSON
--   so the API route doesn't have to interpret error rows.
--
-- redeem_invitation — authenticated. Atomically moves the caller
--   from their just-created personal account to the inviter's
--   account, cleans up the orphan personal account, and stamps
--   the invitation accepted. Refuses if the caller's current
--   account holds any domain data (to avoid silent data loss).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- peek_invitation(p_token_hash text)
--
-- Anonymous read by token hash. The plaintext token never
-- reaches the DB; the route handler hashes it first.
--
-- Returns a JSON object with one of two shapes:
--   { "ok": true,  "account_name": "...", "role": "...",
--     "expires_at": "2026-..." }
--   { "ok": false, "reason": "not_found" | "expired" | "used" }
--
-- We could collapse all three failure cases to "not_found" to
-- harden against enumeration, but the join page needs the
-- distinction for UX ("This invite has expired — ask <name>
-- for a new one"). Tokens carry 256 bits of entropy, so the
-- enumeration risk is theoretical; rate-limiting the route on
-- the IP layer adds belt-and-braces.
-- ============================================================
CREATE OR REPLACE FUNCTION public.peek_invitation(
  p_token_hash TEXT
) RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv account_invitations%ROWTYPE;
  v_account_name TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'used');
  END IF;

  IF v_inv.expires_at <= NOW() THEN
    RETURN json_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT name INTO v_account_name
  FROM accounts
  WHERE id = v_inv.account_id;

  RETURN json_build_object(
    'ok', true,
    'account_name', v_account_name,
    'role', v_inv.role,
    'expires_at', v_inv.expires_at
  );
END;
$$;

ALTER FUNCTION public.peek_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.peek_invitation(TEXT) FROM PUBLIC;
-- `anon` so the /join/<token> page can call this before the user
-- signs in; `authenticated` so the same page works when already
-- signed in (e.g. existing user clicks a forwarded link).
GRANT EXECUTE ON FUNCTION public.peek_invitation(TEXT) TO anon, authenticated;

-- ============================================================
-- redeem_invitation(p_token_hash text)
--
-- Authenticated. The caller's auth.uid() is used both to scope
-- the move ("which profile am I editing?") and as the safety
-- check ("do you have any data we'd lose?").
--
-- Refusal codes (SQLSTATE):
--   22023 — invite invalid (not_found / used / expired)
--   42501 — caller not authenticated
--   23505 — caller's account has data (would be lost by joining)
--           NOTE: we reuse Postgres's "unique_violation" code here
--           rather than invent a custom SQLSTATE because there's
--           no proper standard SQLSTATE for "conflict"; the route
--           handler maps it to HTTP 409.
--
-- Order of operations
--   1. Lock the invite row (FOR UPDATE) so two concurrent redeems
--      of the same token can't both succeed.
--   2. Read caller's current account_id.
--   3. Verify caller is the sole owner of their current account
--      AND that the account has zero domain rows. (If the caller
--      already joined someone else's account once, their
--      profile.account_id points there, not to a personal account
--      they own — that case fails the "is owner" check and
--      surfaces as 23505.)
--   4. Move profile.account_id + account_role to invite's.
--   5. Mark invitation accepted (token_hash stays, so the same
--      token can't be re-used).
--   6. Delete the old personal account. The ON DELETE CASCADE on
--      `accounts(id) ← profiles.account_id` would normally try to
--      delete the caller's profile too, but step 4 already moved
--      them to the new account, so the cascade is a no-op.
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID  -- the joined account_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  -- Caller's current account + its owner.
  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    -- Defensive — every authenticated user has a profile post-017.
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  -- Edge case: the inviter sent themselves a link, or the
  -- caller is somehow already in the inviter's account.
  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  -- Safety: the caller must be the SOLE OWNER of their current
  -- account (i.e. their fresh personal account from signup or a
  -- prior removal). Any other state means they're either:
  --   - a member of another shared account (joining a second
  --     would silently orphan their access to the first), or
  --   - the owner of an account with teammates (they'd abandon
  --     their team to join the inviter's).
  -- Either way, the safe answer is "make a different login".
  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- Belt: even if they own their account, refuse if it has any
  -- domain data — joining would orphan their contacts, deals,
  -- broadcasts, automations, flows, templates, etc.
  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- Move the profile first so the cascade-on-delete of the old
  -- account doesn't try to nuke this user's profile too.
  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  -- Clean up the orphan personal account. Empty by the checks
  -- above, so this is purely housekeeping — no cascades fire
  -- because no other rows reference it.
  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;


-- Source: 020_account_sharing_followups.sql

-- ============================================================
-- 020_account_sharing_followups.sql — review-board fixes for
-- the multi-user accounts series (#167-#177).
--
-- Two concerns this migration addresses:
--
--   1. Engine dispatch indexes — the per-inbound automations and
--      flows lookups now scope by `account_id + trigger_type/status
--      + is_active/status='active'`. The pre-017 partial indexes
--      (`idx_automations_active_trigger`, no flows equivalent) were
--      account-blind. For shared accounts with 100+ teammates each
--      authoring rules, the planner ends up post-filtering by
--      account_id. Composite partial indexes drop the post-filter
--      cost to zero on the hot path.
--
--   2. Flow-media storage scoping — migration 016 created the
--      `flow-media` bucket with per-user RLS policies keyed on
--      `auth.uid() = path[0]`. After the multi-user move, flows
--      are account-scoped but the storage paths remained user-
--      scoped: an agent who left the account would orphan every
--      flow node referencing media they had uploaded. This
--      migration switches the write policies to account-scoped
--      paths (`account-<account_id>/...`) while leaving the
--      legacy `<auth.uid()>/...` paths writable by their original
--      uploader for backward compatibility. The bucket is public,
--      so reads are unchanged.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- COMPOSITE INDEXES — engine dispatch hot path
-- ============================================================

-- `runAutomationsForTrigger` queries
--   automations WHERE account_id = X AND trigger_type = Y AND is_active = TRUE
-- Migration 006 added a partial index on (trigger_type) WHERE is_active.
-- Composite + partial index lets the planner answer all three predicates
-- from one index lookup. The existing partial index can stay as belt-and-
-- braces for any code path that filters only by trigger_type.
CREATE INDEX IF NOT EXISTS idx_automations_account_active_trigger
  ON automations(account_id, trigger_type)
  WHERE is_active = TRUE;

-- `findEntryFlow` queries
--   flows WHERE account_id = X AND status = 'active'
-- Migration 017 only added `idx_flows_account`; this partial composite
-- is tuned for the engine's lookup and skips archived/draft rows.
CREATE INDEX IF NOT EXISTS idx_flows_account_active
  ON flows(account_id)
  WHERE status = 'active';

-- ============================================================
-- FLOW-MEDIA STORAGE — account-scoped writes
--
-- New path convention: `account-<uuid>/<timestamp>-<base>.<ext>`
-- Legacy path convention: `<uuid>/<timestamp>-<base>.<ext>` (where
-- the uuid is auth.uid() — preserved for back-compat).
--
-- Reads stay public (the bucket is public so Meta can fetch media
-- URLs without credentials). Only the write policies change.
--
-- Drop existing per-user policies and replace with account-aware
-- ones that accept either path convention.
-- ============================================================
DROP POLICY IF EXISTS "Users can upload their own flow media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own flow media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own flow media" ON storage.objects;

DROP POLICY IF EXISTS "Members can upload flow media" ON storage.objects;
CREATE POLICY "Members can upload flow media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'flow-media'
    AND (
      -- New: any account member uploading under their account's folder.
      -- `'account-' || account_id` is how we namespace the folder, so
      -- two accounts that happen to be in the same Supabase project
      -- can never accidentally collide.
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      -- Legacy: the original uploader keeps write access to files they
      -- already uploaded under the pre-020 path convention.
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can update flow media" ON storage.objects;
CREATE POLICY "Members can update flow media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete flow media" ON storage.objects;
CREATE POLICY "Members can delete flow media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- Public read policy from 016 stays as-is; reads cross both path
-- conventions without modification.


-- Source: 021_account_default_currency.sql

-- ============================================================
-- 021_account_default_currency
--
-- Make the default deal currency configurable per account.
--
-- Before this, the app hardcoded USD everywhere — deal-value
-- formatters, the new-deal form, and automation-created deals all
-- assumed USD. wacrm is self-hostable and used globally, so a fixed
-- USD default made deal tracking unhelpful for non-US businesses
-- (issue #218).
--
-- We add a single `default_currency` column to `accounts`. New deals
-- and all aggregated totals (pipeline/dashboard) format in this
-- currency; existing deals keep their own saved `deals.currency`.
-- We enforce one currency per account (no FX conversion) — the
-- issue's recommended first pass.
--
-- RLS: no change needed. The existing `accounts_update` policy
-- (017) already restricts writes to admins+, which is exactly who
-- should change an account-wide setting.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';

-- Keep the value an ISO-4217-shaped 3-letter uppercase code without
-- pinning to a fixed enum — forks can use any currency Intl supports.
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_default_currency_format;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_default_currency_format
  CHECK (default_currency ~ '^[A-Z]{3}$');


-- Source: 022_contact_phone_dedup.sql

-- ============================================================
-- 022_contact_phone_dedup
--
-- Prevent the same phone number from becoming multiple contacts
-- within one account (issue #212).
--
-- Until now `contacts.phone` had only a non-unique index, phone was
-- stored un-normalized ("+1 555-123-4567" vs "15551234567" are
-- distinct strings), and only the WhatsApp webhook de-duped. Manual
-- create and CSV import inserted freely, fragmenting conversations,
-- deals, and tags across duplicate rows.
--
-- This migration, in order:
--   1. adds a generated `phone_normalized` column (digits-only,
--      mirroring the app's normalizePhone) that can never drift;
--   2. merges existing duplicates into the oldest row, re-pointing
--      all child records first so nothing is lost;
--   3. adds a UNIQUE index on (account_id, phone_normalized) — the
--      authoritative guarantee that covers every write path.
--
-- Idempotent. **No data loss** — duplicate rows are merged, not
-- dropped: child rows (conversations, messages, deals, notes, tags,
-- custom values, broadcast recipients, automation/flow records) are
-- re-pointed to the surviving (oldest) contact before deletion.
-- ============================================================

-- 1) Normalized phone — STORED generated column, kept in lockstep
--    with `phone` by Postgres. Matches normalizePhone()
--    (src/lib/whatsapp/phone-utils.ts): strip every non-digit.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT
  GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED;

-- 2) One-time (re-runnable) merge of existing duplicates.
--    SECURITY DEFINER so it can re-point rows across tables
--    regardless of the caller's RLS; it only ever collapses exact
--    normalized duplicates within the same account.
CREATE OR REPLACE FUNCTION public.merge_duplicate_contacts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group   RECORD;
  v_survivor UUID;
  v_losers   UUID[];
  v_merged   INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT account_id,
           phone_normalized,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids
    FROM contacts
    WHERE phone_normalized <> ''
    GROUP BY account_id, phone_normalized
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];

    -- Plain re-point: these tables have no contact-scoped unique
    -- constraint. `conversations` is ON DELETE CASCADE, so this
    -- re-point is what saves its rows (and their messages) from
    -- being deleted with the loser contact.
    UPDATE conversations                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE contact_notes                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE deals                         SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE broadcast_recipients          SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_logs               SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_pending_executions SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);

    -- Conflict-guarded re-point for UNIQUE(contact_id, tag_id):
    -- move only tags the survivor doesn't already have, drop the rest.
    UPDATE contact_tags ct SET contact_id = v_survivor
      WHERE ct.contact_id = ANY(v_losers)
        AND NOT EXISTS (
          SELECT 1 FROM contact_tags s
          WHERE s.contact_id = v_survivor AND s.tag_id = ct.tag_id
        );
    DELETE FROM contact_tags WHERE contact_id = ANY(v_losers);

    -- Same guard for UNIQUE(contact_id, custom_field_id). Survivor's
    -- own value wins on conflict.
    UPDATE contact_custom_values cv SET contact_id = v_survivor
      WHERE cv.contact_id = ANY(v_losers)
        AND NOT EXISTS (
          SELECT 1 FROM contact_custom_values s
          WHERE s.contact_id = v_survivor AND s.custom_field_id = cv.custom_field_id
        );
    DELETE FROM contact_custom_values WHERE contact_id = ANY(v_losers);

    -- flow_runs has a partial UNIQUE on active runs per contact.
    -- Re-point only NON-active runs (exempt from the partial index)
    -- to preserve history; any active loser run is left to be
    -- NULLed by its FK's ON DELETE SET NULL when the loser is
    -- removed below — avoids colliding with the survivor's active run.
    UPDATE flow_runs SET contact_id = v_survivor
      WHERE contact_id = ANY(v_losers) AND status <> 'active';

    DELETE FROM contacts WHERE id = ANY(v_losers);

    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

ALTER FUNCTION public.merge_duplicate_contacts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts() FROM PUBLIC;

-- Collapse whatever duplicates exist right now.
SELECT public.merge_duplicate_contacts();

-- 3) Authoritative guarantee. Partial index defends against any
--    empty normalized value (phone is NOT NULL, but belt-and-braces).
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_phone_normalized
  ON contacts (account_id, phone_normalized)
  WHERE phone_normalized <> '';


-- Source: 023_salu_crm_bridge.sql

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


-- Source: 024_salu_crm_transcript_cleanup.sql

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


-- Source: 025_salu_handoff_capture.sql

-- Surface Salu ingress capture and human handoffs in the shared CRM.
-- The Salu schema migration 003 must be applied before this migration.

alter table public.contacts
  add column if not exists whatsapp_user_id text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

alter table public.messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.conversations
  add column if not exists handoff_state text not null default 'none',
  add column if not exists handoff_priority text not null default 'normal',
  add column if not exists handoff_reason text,
  add column if not exists handoff_category text,
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists handoff_resolved_at timestamptz,
  add column if not exists bot_paused boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_handoff_state_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_handoff_state_check
      check (handoff_state in ('none', 'requested', 'active', 'resolved'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_handoff_priority_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_handoff_priority_check
      check (handoff_priority in ('normal', 'urgent'));
  end if;
end
$$;

create index if not exists conversations_handoff_queue_idx
  on public.conversations(account_id, handoff_state, handoff_priority, handoff_requested_at desc)
  where handoff_state in ('requested', 'active');

create or replace function public.salu_account_handoff_owner(p_account_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id
  from public.profiles p
  where p.account_id = p_account_id
    and p.user_id is not null
    and p.account_role in ('owner', 'admin', 'agent')
  order by
    case p.account_role
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    p.created_at asc,
    p.user_id
  limit 1
$$;

revoke all on function public.salu_account_handoff_owner(uuid) from public;

create or replace function public.salu_default_crm_owner()
returns table(account_id uuid, user_id uuid)
language sql
security definer
set search_path = public
as $$
  with ranked_accounts as (
    select
      p.account_id,
      p.user_id,
      case when exists (
        select 1
        from public.whatsapp_config wc
        where wc.account_id = p.account_id
          and wc.status = 'connected'
      ) then 0 else 10 end
      + case p.account_role
          when 'owner' then 0
          when 'admin' then 1
          when 'agent' then 2
          else 9
        end as priority,
      p.created_at
    from public.profiles p
    where p.account_id is not null
      and p.user_id is not null
      and p.account_role in ('owner', 'admin', 'agent')
  )
  select ranked_accounts.account_id, ranked_accounts.user_id
  from ranked_accounts
  order by priority asc, created_at asc, user_id
  limit 1
$$;

revoke all on function public.salu_default_crm_owner() from public;

create or replace function public.salu_enrich_crm_from_message_event()
returns trigger
language plpgsql
security definer
set search_path = public, salu
as $$
declare
  v_phone_key text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  v_profile salu.customer_profiles%rowtype;
begin
  select *
    into v_profile
    from salu.customer_profiles
   where regexp_replace(phone, '\D', '', 'g') = v_phone_key
   limit 1;

  update public.messages m
     set metadata = coalesce(m.metadata, '{}'::jsonb)
       || (coalesce(new.payload, '{}'::jsonb) - 'raw_event')
       || jsonb_build_object(
         'salu_event_id', new.event_id,
         'message_type', coalesce(new.message_type, ''),
         'whatsapp_user_id', coalesce(new.whatsapp_user_id, ''),
         'provider_timestamp', coalesce(new.provider_timestamp::text, '')
       )
   where m.message_id = new.event_id;

  if v_phone_key <> '' then
    update public.contacts c
       set name = case
             when coalesce(v_profile.customer_name, '') <> ''
               and lower(v_profile.customer_name) <> 'guest'
               then v_profile.customer_name
             else c.name
           end,
           email = coalesce(nullif(v_profile.email, ''), c.email),
           company = coalesce(nullif(v_profile.company, ''), c.company),
           whatsapp_user_id = coalesce(nullif(v_profile.whatsapp_user_id, ''), c.whatsapp_user_id),
           source_metadata = coalesce(c.source_metadata, '{}'::jsonb)
             || coalesce(v_profile.source_metadata, '{}'::jsonb),
           updated_at = now()
     where c.phone_normalized = v_phone_key;
  end if;

  return new;
end;
$$;

revoke all on function public.salu_enrich_crm_from_message_event() from public;

drop trigger if exists z_salu_message_event_metadata_bridge on salu.message_events;
create trigger z_salu_message_event_metadata_bridge
after insert or update on salu.message_events
for each row execute function public.salu_enrich_crm_from_message_event();

create or replace function public.salu_sync_customer_profile_to_crm()
returns trigger
language plpgsql
security definer
set search_path = public, salu
as $$
declare
  v_phone_key text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  if v_phone_key = '' then
    return new;
  end if;

  update public.contacts c
     set name = case
           when coalesce(new.customer_name, '') <> '' and lower(new.customer_name) <> 'guest'
             then new.customer_name
           else c.name
         end,
         email = coalesce(nullif(new.email, ''), c.email),
         company = coalesce(nullif(new.company, ''), c.company),
         whatsapp_user_id = coalesce(nullif(new.whatsapp_user_id, ''), c.whatsapp_user_id),
         source_metadata = coalesce(c.source_metadata, '{}'::jsonb)
           || coalesce(new.source_metadata, '{}'::jsonb),
         updated_at = now()
   where c.phone_normalized = v_phone_key;

  return new;
end;
$$;

revoke all on function public.salu_sync_customer_profile_to_crm() from public;

drop trigger if exists salu_customer_profile_crm_bridge on salu.customer_profiles;
create trigger salu_customer_profile_crm_bridge
after insert or update on salu.customer_profiles
for each row execute function public.salu_sync_customer_profile_to_crm();

create or replace function public.salu_sync_handoff_to_crm()
returns trigger
language plpgsql
security definer
set search_path = public, salu
as $$
declare
  v_phone_key text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  v_was_human_mode boolean := false;
begin
  if v_phone_key = '' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_was_human_mode := old.human_mode;
  end if;

  if new.human_mode then
    update public.conversations conv
       set status = 'pending',
           assigned_agent_id = coalesce(
             public.salu_account_handoff_owner(conv.account_id),
             conv.assigned_agent_id
           ),
           handoff_state = case
             when conv.handoff_state = 'active' then 'active'
             else 'requested'
           end,
           handoff_priority = 'urgent',
           handoff_reason = coalesce(nullif(new.handoff_reason, ''), conv.handoff_reason, 'Human help requested'),
           handoff_category = coalesce(nullif(new.handoff_category, ''), conv.handoff_category, 'human_request'),
           handoff_requested_at = case
             when v_was_human_mode then coalesce(conv.handoff_requested_at, new.handoff_started_at, now())
             else coalesce(new.handoff_started_at, now())
           end,
           handoff_resolved_at = null,
           bot_paused = true,
           updated_at = now()
      from public.contacts c
     where c.id = conv.contact_id
       and c.phone_normalized = v_phone_key;
  elsif tg_op = 'UPDATE' and old.human_mode and not new.human_mode then
    update public.conversations conv
       set status = 'open',
           handoff_state = 'resolved',
           handoff_priority = 'normal',
           handoff_resolved_at = now(),
           bot_paused = false,
           updated_at = now()
      from public.contacts c
     where c.id = conv.contact_id
       and c.phone_normalized = v_phone_key;
  end if;

  return new;
end;
$$;

revoke all on function public.salu_sync_handoff_to_crm() from public;

drop trigger if exists salu_session_handoff_crm_bridge on salu.customer_sessions;
create trigger salu_session_handoff_crm_bridge
after insert or update of human_mode, handoff_reason, handoff_category, handoff_started_at
on salu.customer_sessions
for each row execute function public.salu_sync_handoff_to_crm();

with crm_contacts as (
  select distinct on (c.phone_normalized)
    c.id,
    c.phone,
    c.phone_normalized,
    c.name,
    c.email,
    c.company,
    c.created_at,
    c.updated_at
  from public.contacts c
  where c.phone_normalized <> ''
  order by c.phone_normalized, c.updated_at desc nulls last, c.created_at desc, c.id
)
insert into salu.customer_profiles (
  phone, wa_to, customer_name, email, company,
  first_inbound_at, last_seen_at, source_metadata
)
select
  case when c.phone like '+%' then c.phone else '+' || c.phone_normalized end,
  c.phone_normalized,
  coalesce(nullif(c.name, ''), 'Guest'),
  coalesce(c.email, ''),
  coalesce(c.company, ''),
  c.created_at,
  coalesce(c.updated_at, c.created_at),
  jsonb_build_object('crm_contact_id', c.id, 'backfilled_from_crm', true)
from crm_contacts c
on conflict (phone) do update set
  customer_name = case
    when excluded.customer_name <> '' and lower(excluded.customer_name) <> 'guest'
      then excluded.customer_name
    else salu.customer_profiles.customer_name
  end,
  email = coalesce(nullif(excluded.email, ''), salu.customer_profiles.email),
  company = coalesce(nullif(excluded.company, ''), salu.customer_profiles.company),
  first_inbound_at = least(
    coalesce(salu.customer_profiles.first_inbound_at, excluded.first_inbound_at),
    excluded.first_inbound_at
  ),
  source_metadata = coalesce(salu.customer_profiles.source_metadata, '{}'::jsonb)
    || excluded.source_metadata,
  updated_at = now();


