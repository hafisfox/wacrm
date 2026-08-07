import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { mergedEnv } from './env-utils.mjs';

export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'N8N_URL',
  'N8N_API_KEY',
  'SALU_DASHBOARD_MODE',
  'SALU_N8N_MANUAL_SEND_TOKEN',
];

export const REQUIRED_PUBLIC_TABLES = [
  'accounts',
  'account_invitations',
  'contact_notes',
  'contacts',
  'conversations',
  'message_reactions',
  'message_templates',
  'messages',
  'profiles',
  'whatsapp_config',
];

export const REQUIRED_SALU_TABLES = [
  'availability',
  'booking_segments',
  'bookings',
  'customer_profiles',
  'customer_sessions',
  'message_events',
  'payments',
  'services',
  'stylist_availability',
  'stylist_services',
  'stylists',
];

export const REQUIRED_SALU_FUNCTIONS = [
  'activate_handoff',
  'active_bookings_for_date',
  'cancel_booking',
  'capture_inbound_customer_event',
  'confirm_payment',
  'create_booking_hold',
  'expire_holds',
  'mark_calendar_result',
  'mark_reminder_sent',
  'reschedule_booking',
  'sync_booking_segments',
];

export const REQUIRED_PUBLIC_RPCS = [
  'peek_invitation',
  'redeem_invitation',
  'remove_account_member',
  'set_member_role',
  'transfer_account_ownership',
];

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'y', 'on'].includes(
    String(value).trim().toLowerCase()
  );
}

function databaseSslOptions(env) {
  const mode = String(env.SALU_BOOKING_DB_SSL || 'require')
    .trim()
    .toLowerCase();
  if (['disable', 'disabled', 'false', '0', 'off', 'none'].includes(mode)) {
    return undefined;
  }
  const allowUnauthorizedCerts = parseBoolean(
    env.SALU_BOOKING_DB_ALLOW_UNAUTHORIZED_CERTS,
    true
  );
  return { rejectUnauthorized: !allowUnauthorizedCerts };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function validateDashboardEnv(env) {
  const missingEnv = REQUIRED_ENV.filter((key) => !env[key]);
  const connectionString = env.SALU_BOOKING_DATABASE_URL || env.DATABASE_URL;
  if (!connectionString) {
    missingEnv.push('SALU_BOOKING_DATABASE_URL_OR_DATABASE_URL');
  }

  const invalidEnv = [];
  if (
    env.SALU_DASHBOARD_MODE &&
    env.SALU_DASHBOARD_MODE !== 'n8n-owned-whatsapp'
  ) {
    invalidEnv.push({
      key: 'SALU_DASHBOARD_MODE',
      message: 'must be n8n-owned-whatsapp',
    });
  }
  if (
    env.SALU_N8N_MANUAL_SEND_TOKEN &&
    String(env.SALU_N8N_MANUAL_SEND_TOKEN).length < 32
  ) {
    invalidEnv.push({
      key: 'SALU_N8N_MANUAL_SEND_TOKEN',
      message: 'must contain at least 32 characters',
    });
  }
  if (env.ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(env.ENCRYPTION_KEY)) {
    invalidEnv.push({
      key: 'ENCRYPTION_KEY',
      message: 'must be a 64-character hex string',
    });
  }

  return { missingEnv, invalidEnv, connectionString };
}

function bySchema(rows) {
  return rows.reduce((acc, row) => {
    const schema = row.table_schema;
    acc[schema] ||= new Set();
    acc[schema].add(row.table_name);
    return acc;
  }, {});
}

async function loadObjectChecks(client) {
  const { rows: tableRows } = await client.query(
    `
      select table_schema, table_name
      from information_schema.tables
      where table_schema in ('public', 'salu')
        and table_type = 'BASE TABLE'
      order by table_schema, table_name
    `
  );

  const tables = bySchema(tableRows);
  const missingPublicTables = REQUIRED_PUBLIC_TABLES.filter(
    (table) => !tables.public?.has(table)
  );
  const missingSaluTables = REQUIRED_SALU_TABLES.filter(
    (table) => !tables.salu?.has(table)
  );

  const { rows: functionRows } = await client.query(
    `
      select n.nspname as schema_name, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'salu')
        and (
          (n.nspname = 'salu' and p.proname = any($1::text[]))
          or (n.nspname = 'public' and p.proname = any($2::text[]))
        )
    `,
    [REQUIRED_SALU_FUNCTIONS, REQUIRED_PUBLIC_RPCS]
  );
  const saluFunctions = new Set(
    functionRows
      .filter((row) => row.schema_name === 'salu')
      .map((row) => row.proname)
  );
  const publicRpcs = new Set(
    functionRows
      .filter((row) => row.schema_name === 'public')
      .map((row) => row.proname)
  );

  return {
    missingPublicTables,
    missingSaluTables,
    missingSaluFunctions: REQUIRED_SALU_FUNCTIONS.filter(
      (fn) => !saluFunctions.has(fn)
    ),
    missingPublicRpcs: REQUIRED_PUBLIC_RPCS.filter((fn) => !publicRpcs.has(fn)),
  };
}

async function loadSetupCounts(client, canReadSalu, canReadPublic) {
  const counts = {};
  if (canReadSalu) {
    const { rows } = await client.query(
      `
        select
          (select count(*)::int from salu.bookings) as bookings,
          (select count(*)::int from salu.booking_segments) as booking_segments,
          (select count(*)::int from salu.payments) as payments,
          (select count(*)::int from salu.customer_profiles) as customers,
          (select count(*)::int from salu.message_events) as message_events,
          (select count(*)::int from salu.services where active) as active_services,
          (select count(*)::int from salu.stylists where active) as active_stylists,
          (select count(*)::int from salu.stylist_services where active) as active_stylist_services,
          (select count(*)::int from salu.availability where active) as active_availability,
          (select count(*)::int from salu.stylist_availability where active) as active_stylist_availability
      `
    );
    counts.salu = rows[0];
  }
  if (canReadPublic) {
    const { rows } = await client.query(
      `
        select
          (select count(*)::int from public.accounts) as accounts,
          (select count(*)::int from public.profiles) as profiles,
          (select count(*)::int from public.contacts) as contacts,
          (select count(*)::int from public.conversations) as conversations,
          (select count(*)::int from public.messages) as messages,
          (select count(*)::int from public.message_templates) as message_templates,
          (select count(*)::int from public.whatsapp_config) as whatsapp_configs
      `
    );
    counts.public = rows[0];
  }
  return counts;
}

export async function checkSaluSetup({
  env = mergedEnv(),
  createClient = (connectionString) =>
    new Client({ connectionString, ssl: databaseSslOptions(env) }),
} = {}) {
  const { missingEnv, invalidEnv, connectionString } =
    validateDashboardEnv(env);
  const report = {
    ok: false,
    env: {
      missingEnv,
      invalidEnv,
      n8nConfigured: Boolean(env.N8N_URL && env.N8N_API_KEY),
      manualSendReady:
        env.SALU_DASHBOARD_MODE === 'n8n-owned-whatsapp' &&
        String(env.SALU_N8N_MANUAL_SEND_TOKEN || '').length >= 32,
    },
    database: {
      connected: false,
      error: '',
      missingPublicTables: [],
      missingSaluTables: [],
      missingSaluFunctions: [],
      missingPublicRpcs: [],
    },
    counts: {},
  };

  if (!connectionString) {
    report.database.error = 'Missing database URL';
    return report;
  }

  const client = createClient(connectionString);
  try {
    await client.connect();
    report.database.connected = true;

    const objectChecks = await loadObjectChecks(client);
    Object.assign(report.database, objectChecks);

    const canReadSalu =
      objectChecks.missingSaluTables.length === 0 &&
      objectChecks.missingSaluFunctions.length === 0;
    const canReadPublic =
      objectChecks.missingPublicTables.length === 0 &&
      objectChecks.missingPublicRpcs.length === 0;

    try {
      report.counts = await loadSetupCounts(client, canReadSalu, canReadPublic);
    } catch (error) {
      report.database.error = `Count check failed: ${errorMessage(error)}`;
    }
  } catch (error) {
    report.database.error = errorMessage(error);
  } finally {
    if (report.database.connected) {
      await client.end().catch(() => {});
    }
  }

  report.ok =
    report.env.missingEnv.length === 0 &&
    report.env.invalidEnv.length === 0 &&
    report.database.connected &&
    !report.database.error &&
    report.database.missingPublicTables.length === 0 &&
    report.database.missingSaluTables.length === 0 &&
    report.database.missingSaluFunctions.length === 0 &&
    report.database.missingPublicRpcs.length === 0;

  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

if (import.meta.url === invokedPath) {
  const report = await checkSaluSetup();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}
