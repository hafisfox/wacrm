'use client';

// ============================================================
// HandoffActions
//
// Change the reply handling for one customer, straight from the
// dashboard's priority queue.
//
// The original dashboard only linked away from a customer who needed help:
// seeing that a customer was waiting meant opening the inbox, finding
// the thread, and toggling there. The API for this already existed
// (POST /api/salu/takeover) — it just had no caller outside the
// message thread.
//
// Taking over acquires the Salu human-mode lock; turning replies back on is
// the only way to return the conversation to automatic handling.
// ============================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PauseCircle, PlayCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { GatedButton } from '@/components/ui/gated-button';
import { useCan } from '@/hooks/use-can';
import { fetchWithTimeout, safeJson } from '@/lib/http';

export function HandoffActions({
  phone,
  paused,
}: {
  phone: string;
  paused: boolean;
}) {
  const router = useRouter();
  const canSend = useCan('send-messages');
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = saving || isPending;

  async function toggle() {
    if (busy || !phone || !canSend) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout('/api/salu/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          human_mode: !paused,
          reason: paused ? 'dashboard_resume_bot' : 'dashboard_manual_takeover',
        }),
      });

      // safeJson, not .json() — a gateway error page would otherwise
      // surface to the user as "Unexpected token '<'".
      const payload = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(payload.error || `Request failed (${res.status})`);
      }

      toast.success(
        paused
          ? 'Automatic replies are back on'
          : 'You are now handling this conversation'
      );
      // Re-render the server page so the queue reflects the new state
      // rather than waiting for the next auto-refresh tick.
      startTransition(() => router.refresh());
    } catch (error) {
      console.error('[handoff-actions] update failed:', error);
      toast.error('Could not update reply handling. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GatedButton
      canAct={canSend}
      gateReason="take over or turn on automatic replies"
      size="sm"
      variant="outline"
      className="min-h-11 lg:min-h-8"
      onClick={toggle}
      disabled={busy}
      aria-label={
        paused
          ? `Turn on automatic replies for ${phone}`
          : `Take over replies for ${phone}`
      }
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : paused ? (
        <PlayCircle className="h-3.5 w-3.5" />
      ) : (
        <PauseCircle className="h-3.5 w-3.5" />
      )}
      {paused ? 'Turn on replies' : 'Take over'}
    </GatedButton>
  );
}
