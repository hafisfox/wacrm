import { NextResponse } from 'next/server';

import {
  ForbiddenError,
  requireRole,
  toErrorResponse,
  UnauthorizedError,
} from '@/lib/auth/account';
import { loadSaluSystemHealth } from '@/lib/salu/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole('viewer');
    return NextResponse.json(await loadSaluSystemHealth());
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error);
    }
    console.error('[salu/system-health] failed:', error);
    return NextResponse.json(
      { error: 'Failed to load system health' },
      { status: 500 }
    );
  }
}
