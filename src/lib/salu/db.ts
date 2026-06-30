import { Pool, type QueryResultRow } from "pg";

declare global {
  var saluPgPool: Pool | undefined;
}

function connectionString() {
  return process.env.SALU_BOOKING_DATABASE_URL || process.env.DATABASE_URL;
}

export function getSaluPool() {
  const url = connectionString();
  if (!url) {
    throw new Error("Missing SALU_BOOKING_DATABASE_URL or DATABASE_URL");
  }

  if (!globalThis.saluPgPool) {
    globalThis.saluPgPool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      allowExitOnIdle: true,
    });
  }

  return globalThis.saluPgPool;
}

export async function saluQuery<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const result = await getSaluPool().query<T>(text, values);
  return result.rows;
}
