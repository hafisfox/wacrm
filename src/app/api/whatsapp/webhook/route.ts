import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const OWNER_MESSAGE =
  'Salu WhatsApp webhooks are owned by the live n8n workflows. Keep Meta inbound, Flow data exchange, payments, reminders, Supabase setup reads, and bot routing pointed at n8n.';

function n8nOwnerResponse() {
  return NextResponse.json(
    {
      error: 'webhook_owned_by_n8n',
      message: OWNER_MESSAGE,
    },
    { status: 409 }
  );
}

export async function GET() {
  return n8nOwnerResponse();
}

export async function POST() {
  return n8nOwnerResponse();
}
