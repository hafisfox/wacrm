-- Make local WhatsApp template identity account-scoped.
--
-- This migration refuses to continue if an account already has duplicate
-- (name, language) rows. That keeps production data explicit: reconcile the
-- duplicates, rerun the migration, then application upserts can safely target
-- (account_id, name, language).

do $$
declare
  duplicate_count integer;
  legacy_index record;
begin
  select count(*)::int
    into duplicate_count
  from (
    select account_id, name, language
      from public.message_templates
     group by account_id, name, language
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception
      'message_templates has % duplicate account/name/language groups; merge or rename duplicates before applying 027_message_templates_account_unique',
      duplicate_count;
  end if;

  for legacy_index in
    select i.relname as index_name
      from pg_index x
      join pg_class t on t.oid = x.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class i on i.oid = x.indexrelid
     where n.nspname = 'public'
       and t.relname = 'message_templates'
       and x.indisunique
       and (
         select array_agg(a.attname order by key.ordinality)
           from unnest(x.indkey) with ordinality as key(attnum, ordinality)
           join pg_attribute a on a.attrelid = t.oid and a.attnum = key.attnum
       ) = array['user_id', 'name', 'language']::name[]
  loop
    execute format('drop index if exists public.%I', legacy_index.index_name);
  end loop;
end $$;

create unique index if not exists message_templates_account_name_language_unique
  on public.message_templates(account_id, name, language);
