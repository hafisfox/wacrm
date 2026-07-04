import { Client } from 'pg';
import { mergedEnv } from './env-utils.mjs';

const env = mergedEnv();
const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SALU_BOOKING_DATABASE_URL',
];
const missingEnv = requiredEnv.filter((key) => !env[key]);

const connectionString = env.SALU_BOOKING_DATABASE_URL || env.DATABASE_URL;
const requiredPublic = ['accounts', 'profiles', 'contacts', 'conversations', 'messages'];
const requiredSalu = ['bookings', 'payments', 'customer_profiles', 'message_events', 'services', 'stylists'];

if (!connectionString) {
  console.log(JSON.stringify({ ok: false, missingEnv, error: 'Missing database URL' }, null, 2));
  process.exit(1);
}

const client = new Client({ connectionString });
await client.connect();

try {
  const { rows } = await client.query(
    `
      select table_schema, table_name
      from information_schema.tables
      where table_schema in ('public', 'salu')
        and table_type = 'BASE TABLE'
      order by table_schema, table_name
    `,
  );

  const bySchema = rows.reduce((acc, row) => {
    const key = row.table_schema;
    acc[key] ||= new Set();
    acc[key].add(row.table_name);
    return acc;
  }, {});

  const missingPublic = requiredPublic.filter((table) => !bySchema.public?.has(table));
  const missingSalu = requiredSalu.filter((table) => !bySchema.salu?.has(table));

  const saluCounts = await client.query(
    `
      select
        (select count(*)::int from salu.bookings) as bookings,
        (select count(*)::int from salu.payments) as payments,
        (select count(*)::int from salu.customer_profiles) as customers,
        (select count(*)::int from salu.message_events) as message_events,
        (select count(*)::int from salu.services where active) as active_services,
        (select count(*)::int from salu.stylists where active) as active_stylists
    `,
  );

  const ok = !missingEnv.length && !missingPublic.length && !missingSalu.length;
  console.log(
    JSON.stringify(
      {
        ok,
        missingEnv,
        missingPublicTables: missingPublic,
        missingSaluTables: missingSalu,
        saluCounts: saluCounts.rows[0],
        n8nConfigured: Boolean(env.N8N_URL && env.N8N_API_KEY),
      },
      null,
      2,
    ),
  );

  if (!ok) process.exit(1);
} finally {
  await client.end();
}
