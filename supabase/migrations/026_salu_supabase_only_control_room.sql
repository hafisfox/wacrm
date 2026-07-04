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
