import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_USER_PAGES = 10;
const USERS_PER_PAGE = 1000;

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmailNotConfirmed(message: string): boolean {
  return message.toLowerCase().includes('email not confirmed');
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = supabaseAuthAdmin();
  let page = 1;

  while (page <= MAX_USER_PAGES) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email
    );
    if (match) return match.id;
    if (!data.nextPage) return null;

    page = data.nextPage;
  }

  return null;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`confirm-login:${ip}`, RATE_LIMITS.confirmLogin);
  if (!limit.success) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid login payload' },
      { status: 400 }
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: 'Invalid login payload' },
      { status: 400 }
    );
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email) || password.length < 1) {
    return NextResponse.json(
      { error: 'Invalid login credentials' },
      { status: 401 }
    );
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: 'Auth service is not configured' },
      { status: 500 }
    );
  }

  const passwordCheckClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { error: passwordError } =
    await passwordCheckClient.auth.signInWithPassword({
      email,
      password,
    });

  if (!passwordError) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  if (!isEmailNotConfirmed(passwordError.message)) {
    return NextResponse.json(
      { error: 'Invalid login credentials' },
      { status: 401 }
    );
  }

  let userId: string | null;
  try {
    userId = await findUserIdByEmail(email);
  } catch (err) {
    console.error('[confirm-login] list users error:', err);
    return NextResponse.json(
      { error: 'Could not confirm account' },
      { status: 500 }
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Invalid login credentials' },
      { status: 401 }
    );
  }

  const { error: updateError } =
    await supabaseAuthAdmin().auth.admin.updateUserById(userId, {
      email_confirm: true,
    });

  if (updateError) {
    console.error('[confirm-login] update user error:', updateError);
    return NextResponse.json(
      { error: 'Could not confirm account' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
