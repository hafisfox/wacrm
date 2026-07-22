'use client';

// ============================================================
// HandoffActions
//
// Pause / resume the bot for one customer, straight from the
// dashboard's handoff queue.
//
// Everything on the ops dashboard used to be a link to somewhere else:
// seeing that a customer was waiting meant opening the inbox, finding
// the thread, and toggling there. The API for this already existed
// (POST /api/salu/takeover) — it just had no caller outside the
// message thread.
//
// Pausing acquires the Salu human-mode lock so n8n stops replying;
// "Resume bot" is the only way back, matching the contract documented
// in SALU_DASHBOARD.md.
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
        paused ? 'Bot resumed' : 'Bot paused — you have the thread'
      );
      // Re-render the server page so the queue reflects the new state
      // rather than waiting for the next auto-refresh tick.
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not update takeover'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <GatedButton
      canAct={canSend}
      gateReason="pause or resume the bot"
      size="sm"
      variant="outline"
      onClick={toggle}
      disabled={busy}
      aria-label={
        paused ? `Resume bot for ${phone}` : `Pause bot and take over ${phone}`
      }
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : paused ? (
        <PlayCircle className="h-3.5 w-3.5" />
      ) : (
        <PauseCircle className="h-3.5 w-3.5" />
      )}
      {paused ? 'Resume bot' : 'Take over'}
    </GatedButton>
  );
}
