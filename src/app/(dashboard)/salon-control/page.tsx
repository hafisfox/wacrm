import { SalonControlClient } from './salon-control-client';
import { loadControlRoomData } from '@/lib/salu/control-room';
import {
  loadStylistEarnings,
  type StylistEarningsReport,
} from '@/lib/salu/stylist-earnings';
import { requireRole } from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

export default async function SalonControlPage() {
  // Defense in depth: Proxy keeps unauthenticated requests out, while this
  // server-side check prevents operational data from ever entering an RSC
  // payload if the proxy configuration drifts again.
  await requireRole('viewer');
  const [data, earnings] = await Promise.all([
    loadControlRoomData(),
    // Team is the landing tab, so today's earnings are rendered rather
    // than fetched on mount. Settled on its own: an analytical query must
    // never be able to take the setup page down with it.
    loadStylistEarnings({ period: 'day' }).catch((error) => {
      console.error('[salon] earnings load failed:', error);
      return null as StylistEarningsReport | null;
    }),
  ]);
  return <SalonControlClient initialData={data} initialEarnings={earnings} />;
}
