import type { NextRequest } from 'next/server';

import { updateConfig } from '@/lib/salu/control-room';
import { withAdminMutation } from '../_helpers';

export async function PATCH(request: NextRequest) {
  return withAdminMutation(request, updateConfig);
}
