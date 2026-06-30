import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from './env-utils.mjs';

const ENVIRONMENTS = ['production', 'preview', 'development'];
const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SALU_BOOKING_DATABASE_URL',
  'DATABASE_URL',
  'N8N_URL',
  'N8N_API_KEY',
  'SALU_N8N_MANUAL_SEND_TOKEN',
  'NEXT_PUBLIC_SITE_URL',
  'ENCRYPTION_KEY',
  'SALU_DASHBOARD_MODE',
];

const API_BASE = 'https://api.vercel.com';

function redact(text, values) {
  let output = String(text || '');
  for (const value of values) {
    if (!value) continue;
    output = output.split(value).join('[redacted]');
  }
  return output;
}

function readJson(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} is missing: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getLinkedProject() {
  const repoPath = new URL('../.vercel/repo.json', import.meta.url);
  const repo = readJson(repoPath, 'dashboard/.vercel/repo.json');
  const project =
    repo.projects?.find((candidate) => candidate.name === 'salusalon-crm') ||
    repo.projects?.find((candidate) => candidate.directory === '.') ||
    repo.projects?.[0];

  if (!project?.id || !project?.orgId) {
    throw new Error('Could not find linked Vercel project id/orgId in dashboard/.vercel/repo.json.');
  }

  return project;
}

function getVercelToken() {
  const authPath = path.join(os.homedir(), 'Library/Application Support/com.vercel.cli/auth.json');
  const auth = readJson(authPath, 'Vercel CLI auth.json');
  if (!auth.token) throw new Error('Vercel CLI auth token is missing. Run `vercel login` first.');
  return auth.token;
}

function apiUrl(project, pathname, query = {}) {
  const url = new URL(pathname, API_BASE);
  url.searchParams.set('teamId', project.orgId);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url;
}

async function vercelFetch({ project, token, pathname, query, method = 'GET', body, secrets }) {
  const response = await fetch(apiUrl(project, pathname, query), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const redacted = redact(text, secrets);
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.error?.message || data?.message || redacted || response.statusText;
    throw new Error(`${method} ${pathname} failed (${response.status}): ${redact(message, secrets)}`);
  }

  return data;
}

function envRecordsFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.envs)) return data.envs;
  if (Array.isArray(data?.env)) return data.env;
  return [];
}

const envPath = new URL('../.env.local', import.meta.url);
const values = loadEnvFile(envPath);
const missing = KEYS.filter((key) => !String(values[key] || '').trim());
if (missing.length) throw new Error(`Missing required local env values: ${missing.join(', ')}`);

const project = getLinkedProject();
const token = getVercelToken();
const secrets = KEYS.map((key) => values[key]);
const results = [];

for (const key of KEYS) {
  const body = {
    type: 'encrypted',
    key,
    value: String(values[key]),
    target: ENVIRONMENTS,
  };

  await vercelFetch({
    project,
    token,
    pathname: `/v10/projects/${project.id}/env`,
    query: { upsert: 'true' },
    method: 'POST',
    body,
    secrets,
  });

  results.push({ key, environments: ENVIRONMENTS });
}

const verification = {};
for (const environment of ENVIRONMENTS) {
  const data = await vercelFetch({
    project,
    token,
    pathname: `/v10/projects/${project.id}/env`,
    query: { target: environment },
    secrets,
  });
  const present = new Set(envRecordsFromResponse(data).map((record) => record.key));
  verification[environment] = KEYS.filter((key) => present.has(key));
}

const missingRemote = Object.fromEntries(
  Object.entries(verification)
    .map(([environment, present]) => [
      environment,
      KEYS.filter((key) => !present.includes(key)),
    ])
    .filter(([, missingKeys]) => missingKeys.length > 0)
);

console.log(
  JSON.stringify(
    {
      ok: Object.keys(missingRemote).length === 0,
      project: 'hafisfox-projects/salusalon-crm',
      projectId: project.id,
      environments: ENVIRONMENTS,
      keyCount: KEYS.length,
      synced: results.length,
      verified: verification,
      missingRemote,
    },
    null,
    2
  )
);

if (Object.keys(missingRemote).length) process.exit(1);
