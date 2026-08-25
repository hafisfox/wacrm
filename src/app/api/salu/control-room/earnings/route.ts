import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import { loadStylistEarnings } from '@/lib/salu/stylist-earnings';
import { controlRoomError } from '../_helpers';

export async function GET(request: NextRequest) {
  try {
    // Read-only, like the rest of the Salon Control loads — mutations are
    // the only thing gated at admin.
    await requireRole('viewer');
    const params = request.nextUrl.searchParams;
    return NextResponse.json(
      await loadStylistEarnings({
        period: params.get('period'),
        anchor: params.get('anchor'),
      })
    );
  } catch (error) {
    return controlRoomError(error);
  }
}
