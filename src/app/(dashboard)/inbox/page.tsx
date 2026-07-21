import { Suspense } from 'react';

import { InboxClient } from './inbox-client';

export const dynamic = 'force-dynamic';

export default function InboxPage() {
  const n8nOwnedWhatsapp =
    process.env.SALU_DASHBOARD_MODE === 'n8n-owned-whatsapp';

  return (
    <Suspense
      fallback={
        <div className="bg-chat-canvas flex h-full items-center justify-center">
          <div className="border-chat-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      }
    >
      <InboxClient n8nOwnedWhatsapp={n8nOwnedWhatsapp} />
    </Suspense>
  );
}
