import { NextResponse, type NextRequest } from 'next/server';

import { safeNextPath } from '@/lib/auth/redirects';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const nextPath = safeNextPath(
    request.nextUrl.searchParams.get('next'),
    '/dashboard'
  );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }
    console.error('[auth/callback] code exchange failed:', error.message);
  }

  const retry = new URL('/forgot-password', request.url);
  retry.searchParams.set('error', 'invalid_or_expired');
  return NextResponse.redirect(retry);
}
