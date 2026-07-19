import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import {
  CONTROL_ROOM_MUTATION_ROLE,
  loadControlRoomData,
  updateFlowOrder,
} from '@/lib/salu/control-room';

import { controlRoomError, readJson } from '../_helpers';

export async function PUT(request: NextRequest) {
  try {
    await requireRole(CONTROL_ROOM_MUTATION_ROLE);
    await updateFlowOrder(await readJson(request));
    return NextResponse.json(await loadControlRoomData());
  } catch (error) {
    return controlRoomError(error);
  }
}
