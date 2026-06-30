import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Salu human handoff contracts', () => {
  it('pauses Salu before an agent send attempt and fails closed', () => {
    const route = source('../../app/api/whatsapp/send/route.ts');
    const pause = route.indexOf('await setSaluHumanMode(');
    const send = route.indexOf('waMessageId = await attempt(variant)');

    expect(pause).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(pause);
    expect(route).toContain("{ error: 'Could not pause the bot. The message was not sent.' }");
    expect(route).toContain('{ status: 503 }');
    expect(route).toContain('await logSaluAgentMessage({');
  });

  it('uses the dedicated webhook secret instead of the n8n API key', () => {
    const route = source('../../app/api/whatsapp/send/route.ts');
    expect(route).toContain('SALU_N8N_MANUAL_SEND_TOKEN');
    expect(route).toContain("'X-Salu-Webhook-Secret'");
    expect(route).not.toContain("'X-N8N-API-KEY': process.env.N8N_API_KEY");
  });

  it('surfaces an urgent Needs human queue in the inbox', () => {
    const list = source('../../components/inbox/conversation-list.tsx');
    const thread = source('../../components/inbox/message-thread.tsx');
    expect(list).toContain("value: 'needs_human'");
    expect(list).toContain('Needs human');
    expect(thread).toContain('Needs human');
  });

  it('assigns owner before admin and keeps resume manual', () => {
    const migration = source('../../../supabase/migrations/025_salu_handoff_capture.sql');
    const takeover = source('../../app/api/salu/takeover/route.ts');
    expect(migration).toMatch(/when 'owner' then 0\s+when 'admin' then 1/);
    expect(migration).toContain("handoff_priority = 'urgent'");
    expect(takeover).toContain('hasMinRole(accountRole, "agent")');
  });
});
