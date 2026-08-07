import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('dashboard route role contracts', () => {
  it('requires agent access for operational WhatsApp and takeover actions', () => {
    const send = source('../../app/api/whatsapp/send/route.ts');
    const react = source('../../app/api/whatsapp/react/route.ts');
    const takeover = source('../../app/api/salu/takeover/route.ts');

    expect(send).toContain("requireRole('agent')");
    expect(send).not.toContain(".from('profiles')");
    expect(react).toContain("requireRole('agent')");
    expect(react).not.toContain(".from('profiles')");
    expect(takeover).toMatch(/requireRole\(['"]agent['"]\)/);
    expect(takeover).toContain('RATE_LIMITS.takeover');
  });

  it('requires admin access for account-wide WhatsApp configuration and templates', () => {
    const config = source('../../app/api/whatsapp/config/route.ts');
    const submit = source('../../app/api/whatsapp/templates/submit/route.ts');
    const sync = source('../../app/api/whatsapp/templates/sync/route.ts');
    const lifecycle = source('../../app/api/whatsapp/templates/[id]/route.ts');

    expect(config.match(/requireRole\('admin'\)/g)?.length).toBe(2);
    expect(submit).toContain("requireRole('admin')");
    expect(sync).toContain("requireRole('admin')");
    expect(lifecycle.match(/requireRole\('admin'\)/g)?.length).toBe(2);
  });

  it('keeps Salon Control mutations admin-only', () => {
    const controlRoom = source('control-room.ts');
    const helper = source('../../app/api/salu/control-room/_helpers.ts');

    expect(controlRoom).toContain('CONTROL_ROOM_MUTATION_ROLE = "admin"');
    expect(helper).toContain('requireRole(CONTROL_ROOM_MUTATION_ROLE)');
  });
});

describe('message template account uniqueness contract', () => {
  it('upserts templates by account/name/language', () => {
    const submit = source('../../app/api/whatsapp/templates/submit/route.ts');
    const migration = source(
      '../../../supabase/migrations/027_message_templates_account_unique.sql'
    );

    expect(submit).toContain("onConflict: 'account_id,name,language'");
    expect(submit).not.toContain("onConflict: 'user_id,name,language'");
    expect(migration).toContain(
      'message_templates_account_name_language_unique'
    );
    expect(migration).toContain('duplicate account/name/language groups');
  });
});
