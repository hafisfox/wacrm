import { NextResponse } from 'next/server';

import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { passwordLengthError } from '@/lib/auth/password-policy';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`signup:${ip}`, RATE_LIMITS.signup);
  if (!limit.success) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid signup payload' },
      { status: 400 }
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: 'Invalid signup payload' },
      { status: 400 }
    );
  }

  const fullName =
    typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!fullName) {
    return NextResponse.json(
      { error: 'Full name is required' },
      { status: 400 }
    );
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: 'Enter a valid email address' },
      { status: 400 }
    );
  }

  const passwordError = passwordLengthError(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: 'Auth service is not configured' },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAuthAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error) {
    const alreadyExists =
      error.message.toLowerCase().includes('already') ||
      error.message.toLowerCase().includes('registered');

    if (alreadyExists) {
      return NextResponse.json(
        {
          error: 'An account with this email already exists. Sign in instead.',
        },
        { status: 409 }
      );
    }

    console.error('[signup] create user error:', error);
    return NextResponse.json(
      { error: 'Could not create account' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, userId: data.user?.id ?? null });
}
