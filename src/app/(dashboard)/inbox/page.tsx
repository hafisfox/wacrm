import { Suspense } from 'react';

import { InboxClient } from './inbox-client';

export const dynamic = 'force-dynamic';

export default function InboxPage() {
  const n8nOwnedWhatsapp =
    process.env.SALU_DASHBOARD_MODE === 'n8n-owned-whatsapp';

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#0b141a]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
        </div>
      }
    >
      <InboxClient n8nOwnedWhatsapp={n8nOwnedWhatsapp} />
    </Suspense>
  );
}
