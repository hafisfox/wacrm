import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { mergedEnv } from './env-utils.mjs';

const env = mergedEnv();
const connectionString = env.SALU_BOOKING_DATABASE_URL || env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Missing SALU_BOOKING_DATABASE_URL or DATABASE_URL');
}

const migrationsDir = fileURLToPath(new URL('../supabase/migrations', import.meta.url));
const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => path.join(migrationsDir, name));

if (!files.length) {
  throw new Error('No wacrm migrations found');
}

const client = new Client({ connectionString });
await client.connect();

try {
  for (const file of files) {
    await client.query(fs.readFileSync(file, 'utf8'));
    console.log(JSON.stringify({ applied: path.relative(process.cwd(), file) }));
  }
} finally {
  await client.end();
}
