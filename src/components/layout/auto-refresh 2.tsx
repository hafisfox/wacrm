'use client';

// ============================================================
// AutoRefresh
//
// Keeps a server-rendered page current without turning it into a
// client component.
//
// /dashboard and /contacts are `force-dynamic` server pages, so their
// data is a snapshot taken when the request was served — an operator
// who left the tab open at 9am was still looking at 9am at noon, with
// nothing on screen admitting it. The dashboard in particular is a
// queue view whose whole job is to be current.
//
// `router.refresh()` re-runs the server render and reconciles the new
// tree into the existing one: no full navigation, no scroll jump, and
// local state (open dialogs, filter chips) survives.
//
// Deliberately not realtime. These pages aggregate across the `salu`
// schema, which lives outside Supabase's realtime publication, and a
// minute of staleness on a booking count is fine — as long as the age
// is visible. What matters is that the number on screen is honest
// about how old it is.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Default cadence. Slow enough to be cheap, fast enough to be useful. */
const DEFAULT_INTERVAL_MS = 60_000;

export function AutoRefresh({
  intervalMs = DEFAULT_INTERVAL_MS,
  className,
}: {
  intervalMs?: number;
  className?: string;
}) {
  const router = useRouter();
  // Server render time isn't available to a client component, so treat
  // mount as t0. Off by however long the render took — well under the
  // granularity we display.
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);

  const refresh = useCallback(() => {
    setPending(true);
    router.refresh();
    setLastRefresh(Date.now());
  }, [router]);

  // Clear the spinner once the refreshed tree has landed. `refresh()`
  // returns void with no completion signal, so this keys off the
  // re-render it causes rather than awaiting anything.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 600);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  // A background tab gets its timers throttled, so returning to one
  // means the interval above has been firing erratically or not at
  // all. Refresh on the way back in rather than showing whatever the
  // last throttled tick managed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Ticks the displayed age. `now` is the only state here and the age
  // is derived from it — resetting a separate `age` to 0 on refresh
  // would be a synchronous setState in an effect body, which React 19
  // flags as a cascading render.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const age = Math.max(0, Math.floor((now - lastRefresh) / 1000));

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        className="text-muted-foreground text-xs tabular-nums"
        // Announcing every tick would be unbearable with a screen
        // reader; the button below is the accessible affordance.
        aria-hidden
      >
        {ageLabel(age)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={refresh}
        disabled={pending}
        aria-label="Refresh data now"
      >
        <RotateCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} />
        Refresh
      </Button>
    </div>
  );
}

function ageLabel(seconds: number) {
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${Math.floor(minutes / 60)}h ago`;
}
