import crypto from 'node:crypto';
import fs from 'node:fs';
import { loadEnvFile, shellQuote } from './env-utils.mjs';

const existing = loadEnvFile(new URL('../.env.local', import.meta.url));

function first(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function encryptionKey() {
  const current = first(existing.ENCRYPTION_KEY);
  if (/^[a-f0-9]{64}$/i.test(current)) return current;
  return crypto.randomBytes(32).toString('hex');
}

const saluDatabaseUrl = first(
  existing.SALU_BOOKING_DATABASE_URL,
  existing.DATABASE_URL
);

const values = {
  NEXT_PUBLIC_SUPABASE_URL: first(existing.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: first(existing.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: first(existing.SUPABASE_SERVICE_ROLE_KEY),
  SALU_BOOKING_DATABASE_URL: saluDatabaseUrl,
  DATABASE_URL: saluDatabaseUrl,
  N8N_URL: first(existing.N8N_URL),
  N8N_API_KEY: first(existing.N8N_API_KEY),
  SALU_N8N_MANUAL_SEND_TOKEN: first(existing.SALU_N8N_MANUAL_SEND_TOKEN),
  NEXT_PUBLIC_SITE_URL: first(
    existing.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3000'
  ),
  ENCRYPTION_KEY: encryptionKey(),
  SALU_DASHBOARD_MODE: 'n8n-owned-whatsapp',
};

const missing = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SALU_BOOKING_DATABASE_URL',
  'N8N_URL',
  'N8N_API_KEY',
  'SALU_N8N_MANUAL_SEND_TOKEN',
].filter((key) => !values[key]);

if (missing.length) {
  throw new Error(
    `Missing required Salu dashboard env values in dashboard/.env.local: ${missing.join(', ')}`
  );
}

const lines = [
  '# Normalized by npm run setup:salu-env.',
  '# dashboard/.env.local is the canonical local env file for the dashboard.',
  '# n8n remains the production WhatsApp webhook owner for Salu.',
  '',
  ...Object.entries(values).map(
    ([key, value]) => `${key}=${shellQuote(value)}`
  ),
  '',
];

const target = new URL('../.env.local', import.meta.url);
fs.writeFileSync(target, lines.join('\n'), { mode: 0o600 });
console.log(
  JSON.stringify({
    ok: true,
    wrote: '.env.local',
    mode: values.SALU_DASHBOARD_MODE,
  })
);
