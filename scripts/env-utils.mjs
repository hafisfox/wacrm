import fs from 'node:fs';

export function loadEnvFile(path) {
  const env = {};
  if (!fs.existsSync(path)) return env;

  for (const rawLine of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }

  return env;
}

export function shellQuote(value) {
  const raw = String(value ?? '');
  if (/^[A-Za-z0-9_./:@%+=,-]*$/.test(raw)) return raw;
  return JSON.stringify(raw);
}

export function mergedEnv() {
  return {
    ...loadEnvFile(new URL('../.env.local', import.meta.url)),
    ...process.env,
  };
}
