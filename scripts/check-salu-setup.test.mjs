import { describe, expect, it } from 'vitest';
import {
  checkSaluSetup,
  REQUIRED_PUBLIC_TABLES,
  REQUIRED_PUBLIC_RPCS,
  REQUIRED_SALU_FUNCTIONS,
  REQUIRED_SALU_TABLES,
  validateDashboardEnv,
} from './check-salu-setup.mjs';

function validEnv(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    ENCRYPTION_KEY:
      '0000000000000000000000000000000000000000000000000000000000000000',
    N8N_URL: 'https://n8n.example.com',
    N8N_API_KEY: 'n8n',
    SALU_DASHBOARD_MODE: 'n8n-owned-whatsapp',
    SALU_N8N_MANUAL_SEND_TOKEN: 'x'.repeat(32),
    SALU_BOOKING_DATABASE_URL: 'postgres://user:pass@example/db',
    ...overrides,
  };
}

class FakeClient {
  constructor({ connectError, tables = [], functions = [] } = {}) {
    this.connectError = connectError;
    this.tables = tables;
    this.functions = functions;
    this.ended = false;
  }

  async connect() {
    if (this.connectError) throw this.connectError;
  }

  async end() {
    this.ended = true;
  }

  async query(sql) {
    if (sql.includes('information_schema.tables')) {
      return { rows: this.tables };
    }
    if (sql.includes('pg_proc')) {
      return { rows: this.functions };
    }
    if (sql.includes('from salu.bookings')) {
      return {
        rows: [
          {
            bookings: 0,
            booking_segments: 0,
            payments: 0,
            customers: 0,
            message_events: 0,
            active_services: 0,
            active_stylists: 0,
            active_stylist_services: 0,
            active_availability: 0,
            active_stylist_availability: 0,
          },
        ],
      };
    }
    if (sql.includes('from public.accounts')) {
      return {
        rows: [
          {
            accounts: 1,
            profiles: 1,
            contacts: 0,
            conversations: 0,
            messages: 0,
            message_templates: 0,
            whatsapp_configs: 0,
          },
        ],
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  }
}

function tableRows(schema, tables) {
  return tables.map((table_name) => ({ table_schema: schema, table_name }));
}

function functionRows(schema, functions) {
  return functions.map((proname) => ({ schema_name: schema, proname }));
}

describe('validateDashboardEnv', () => {
  it('reports missing and invalid dashboard env without secrets', () => {
    const result = validateDashboardEnv({
      SALU_DASHBOARD_MODE: 'direct-meta',
      SALU_N8N_MANUAL_SEND_TOKEN: 'short',
      ENCRYPTION_KEY: 'not-hex',
    });

    expect(result.missingEnv).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(result.missingEnv).toContain(
      'SALU_BOOKING_DATABASE_URL_OR_DATABASE_URL',
    );
    expect(result.invalidEnv.map((item) => item.key)).toEqual([
      'SALU_DASHBOARD_MODE',
      'SALU_N8N_MANUAL_SEND_TOKEN',
      'ENCRYPTION_KEY',
    ]);
  });
});

describe('checkSaluSetup', () => {
  it('returns structured JSON for connection failures', async () => {
    const report = await checkSaluSetup({
      env: validEnv(),
      createClient: () =>
        new FakeClient({ connectError: new Error('getaddrinfo ENOTFOUND') }),
    });

    expect(report.ok).toBe(false);
    expect(report.database.connected).toBe(false);
    expect(report.database.error).toBe('getaddrinfo ENOTFOUND');
    expect(report.database.missingPublicTables).toEqual([]);
  });

  it('reports missing public tables, Salu tables, functions, and RPCs', async () => {
    const report = await checkSaluSetup({
      env: validEnv(),
      createClient: () => new FakeClient(),
    });

    expect(report.ok).toBe(false);
    expect(report.database.connected).toBe(true);
    expect(report.database.missingPublicTables).toContain('message_templates');
    expect(report.database.missingSaluTables).toContain('booking_segments');
    expect(report.database.missingSaluFunctions).toContain('activate_handoff');
    expect(report.database.missingPublicRpcs).toContain('redeem_invitation');
  });

  it('passes when required schema objects are present', async () => {
    const report = await checkSaluSetup({
      env: validEnv(),
      createClient: () =>
        new FakeClient({
          tables: [
            ...tableRows('public', REQUIRED_PUBLIC_TABLES),
            ...tableRows('salu', REQUIRED_SALU_TABLES),
          ],
          functions: [
            ...functionRows('public', REQUIRED_PUBLIC_RPCS),
            ...functionRows('salu', REQUIRED_SALU_FUNCTIONS),
          ],
        }),
    });

    expect(report.ok).toBe(true);
    expect(report.counts.public.accounts).toBe(1);
    expect(report.counts.salu.active_services).toBe(0);
  });
});
