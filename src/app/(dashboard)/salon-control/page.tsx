import { SalonControlClient } from './salon-control-client';
import { loadControlRoomData } from '@/lib/salu/control-room';
import { requireRole } from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

export default async function SalonControlPage() {
  // Defense in depth: Proxy keeps unauthenticated requests out, while this
  // server-side check prevents operational data from ever entering an RSC
  // payload if the proxy configuration drifts again.
  await requireRole('viewer');
  const data = await loadControlRoomData();
  return <SalonControlClient initialData={data} />;
}
