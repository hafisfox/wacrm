import { Suspense } from 'react';

import { InboxClient } from './inbox-client';

export const dynamic = 'force-dynamic';

export default function InboxPage() {
  const sendingAvailable =
    process.env.SALU_DASHBOARD_MODE === 'n8n-owned-whatsapp';

  return (
    <Suspense
      fallback={
        <div className="bg-chat-canvas flex h-full items-center justify-center">
          <div
            className="flex flex-col items-center gap-3"
            role="status"
            aria-live="polite"
          >
            <div
              className="border-chat-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              aria-hidden
            />
            <p className="text-chat-muted text-sm">Loading conversations…</p>
          </div>
        </div>
      }
    >
      <InboxClient sendingAvailable={sendingAvailable} />
    </Suspense>
  );
}
