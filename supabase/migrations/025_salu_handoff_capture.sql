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
