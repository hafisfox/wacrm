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


-- Source: 002_salu_admin_setup.sql

-- Salu Salon admin setup state.
-- Apply after sql/001_salu_booking_db.sql.
--
-- Supabase/Postgres is the only admin data store. n8n reads these tables
-- directly for WhatsApp booking automation and never mirrors them elsewhere.

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salu.services (
  service_id text primary key,
  service_name text not null default '',
  duration_minutes integer not null default 60 check (duration_minutes >= 5),
  price_display text not null default '',
  price_paise integer not null default 0 check (price_paise >= 0),
  deposit_paise integer not null default 0 check (deposit_paise >= 0),
  payment_required boolean not null default true,
  payment_label text not null default '',
  active boolean not null default true,
  flow_order integer not null default 999,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salu.stylist_services (
  stylist_service_id text primary key,
  stylist_id text not null default '',
  service_id text not null default '',
  active boolean not null default true,
  override_duration_minutes integer check (override_duration_minutes is null or override_duration_minutes >= 5),
  override_price_paise integer check (override_price_paise is null or override_price_paise >= 0),
  override_deposit_paise integer check (override_deposit_paise is null or override_deposit_paise >= 0),
  skill_level text not null default '',
  flow_order integer not null default 999,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists salu_stylist_services_pair_unique
  on salu.stylist_services(stylist_id, service_id)
  where stylist_id <> '' and service_id <> '';

create table if not exists salu.availability (
  availability_id text primary key,
  day_name text not null default '',
  open_time text not null default '',
  close_time text not null default '',
  slot_interval_minutes integer check (slot_interval_minutes is null or slot_interval_minutes >= 5),
  blackout_date date,
  service_id text not null default '',
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salu.stylist_availability (
  stylist_availability_id text primary key,
  stylist_id text not null default '',
  day_name text not null default '',
  open_time text not null default '',
  close_time text not null default '',
  slot_interval_minutes integer check (slot_interval_minutes is null or slot_interval_minutes >= 5),
  blackout_date date,
  effective_from date,
  effective_to date,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create index if not exists salu_services_active_order_idx
  on salu.services(active, flow_order, service_name);

create index if not exists salu_stylists_active_order_idx
  on salu.stylists(active, flow_order, stylist_name);

create index if not exists salu_availability_active_day_idx
  on salu.availability(active, day_name, open_time);

create index if not exists salu_stylist_availability_active_day_idx
  on salu.stylist_availability(active, stylist_id, day_name, open_time);

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


-- Source: 003_salu_handoff_capture.sql

-- Immediate inbound customer capture and durable human-handoff state.
-- Apply after sql/001_salu_booking_db.sql and sql/002_salu_admin_setup.sql.

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
    updated_at = now();

  return jsonb_build_object('ok', true, 'status', 'upserted', 'event_id', event_id_value);
end;
$$;


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


-- Source: 026_salu_supabase_only_control_room.sql

-- Remove the retired workbook synchronization layer after the Supabase-only
-- control room and n8n bundle are deployed.

do $$
declare
  sync_prefix text := 'sheet' || '_sync';
  synced_column text := 'sheet' || '_synced_at';
  object_name text;
  table_name text;
  column_name text;
begin
  execute format('drop function if exists salu.%I(text, jsonb, text)', 'sync_' || 'sheet_snapshot');
  execute format('drop function if exists salu.%I(timestamptz)', 'pending_' || 'sheet_mirror_rows');
  execute format('drop function if exists salu.%I(text, timestamptz, text, text)', 'mark_' || 'sync_state');
  execute format('drop function if exists salu.%I(jsonb, text, text)', 'sheet' || '_text');
  execute format('drop function if exists salu.%I(jsonb, text)', 'sheet' || '_text');
  execute format('drop function if exists salu.%I(jsonb, text, integer)', 'sheet' || '_int');
  execute format('drop function if exists salu.%I(jsonb, text, boolean)', 'sheet' || '_bool');
  execute format('drop function if exists salu.%I(jsonb, text)', 'sheet' || '_date');
  execute format('drop function if exists salu.%I(jsonb, text)', 'sheet' || '_timestamptz');
  execute format('drop function if exists salu.%I(jsonb)', 'strip_' || 'sync_fields');

  foreach object_name in array array[
    'sheet' || '_sync_runs',
    'sheet' || '_sync_state'
  ]
  loop
    execute format('drop table if exists salu.%I', object_name);
  end loop;

  foreach table_name in array array[
    'config',
    'services',
    'stylists',
    'stylist_services',
    'availability',
    'stylist_availability',
    'customer_sessions',
    'customer_profiles',
    'bookings',
    'payments',
    'message_events'
  ]
  loop
    execute format('drop index if exists salu.%I', 'salu_' || table_name || '_' || sync_prefix || '_id_unique');

    foreach column_name in array array[
      sync_prefix || '_id',
      sync_prefix || '_hash',
      sync_prefix || '_source',
      sync_prefix || '_deleted',
      synced_column
    ]
    loop
      execute format('alter table if exists salu.%I drop column if exists %I', table_name, column_name);
    end loop;

    execute format('alter table if exists salu.%I drop column if exists raw_row', table_name);
  end loop;
end $$;


