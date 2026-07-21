'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  SaluDatabaseHealth,
  SaluN8nHealth,
  SaluSetupHealth,
} from '@/lib/salu/queries';
import { cn } from '@/lib/utils';
import { fetchWithTimeout } from '@/lib/http';
import { formatOpsAge } from '@/lib/salu/ops';

interface SystemHealthPayload {
  n8n: SaluN8nHealth;
  setupHealth: SaluSetupHealth | null;
  database?: SaluDatabaseHealth;
}

export function SystemHealthPanel() {
  const [data, setData] = useState<SystemHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetchWithTimeout('/api/salu/system-health', {
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      const next = payload as SystemHealthPayload;
      // A 200 with a body we can't read is a failure, not a success.
      // Without this the panel fell through to `if (!n8n) return null`
      // below and rendered *nothing* — no error, no retry, no clue.
      if (!next?.n8n) {
        throw new Error('Health response was malformed');
      }
      setData(next);
    } catch (err) {
      // Keep the last good snapshot on screen. Blanking it meant a
      // momentary network blip threw away a perfectly useful reading
      // and left the operator with less information than before.
      setError(err instanceof Error ? err.message : 'Unable to load health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div
        className="ops-surface text-muted-foreground mt-4 flex items-center gap-2 p-5 text-sm"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading system health
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="border-destructive/30 bg-destructive/10 mt-4 rounded-xl border p-5"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="text-foreground text-sm font-semibold">
              System health unavailable
            </h2>
            <p className="text-foreground/80 mt-1 text-sm">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={load}
              className="mt-3"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const n8n = data?.n8n;
  if (!n8n) return null;
  const setupHealth = data.setupHealth;
  const setupItems = setupHealth
    ? [
        {
          label: 'Active services',
          value: setupHealth.active_services,
          ok: setupHealth.active_services > 0,
        },
        {
          label: 'Active stylists',
          value: setupHealth.active_stylists,
          ok: setupHealth.active_stylists > 0,
        },
        {
          label: 'Missing stylist photos',
          value: setupHealth.stylists_missing_images,
          ok: setupHealth.stylists_missing_images === 0,
        },
        {
          label: 'Stale pending holds',
          value: setupHealth.stale_pending_holds,
          ok: setupHealth.stale_pending_holds === 0,
        },
        {
          label: 'Failed/refund payments',
          value: setupHealth.failed_payments,
          ok: setupHealth.failed_payments === 0,
        },
        {
          label: 'Stylist mappings',
          value: setupHealth.active_stylist_services,
          ok: setupHealth.active_stylist_services > 0,
        },
      ]
    : [];

  return (
    <div className="mt-4 space-y-4">
      {/* We now keep the last good reading when a refresh fails, so say
          so plainly — silently showing stale health is worse than
          showing none. */}
      {error ? (
        <div
          className="border-warning/30 bg-warning/10 flex items-start gap-3 rounded-xl border p-4"
          role="alert"
        >
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-foreground/80 text-sm">
            Showing the last successful reading — the latest refresh failed:{' '}
            {error}
          </p>
        </div>
      ) : null}

      <section className="ops-surface">
        <div className="border-border flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-foreground text-sm font-semibold">
              n8n Production Workflows
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {n8n.activeCount} of {n8n.expectedCount} active
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HealthBadge ok={n8n.ok} label={n8n.ok ? 'healthy' : 'review'} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {n8n.workflows.map((workflow) => (
            <div
              key={workflow.name}
              className="border-border bg-background/50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-foreground/80 truncate text-sm">
                  {workflow.name}
                </p>
                {workflow.role === 'bridge' ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Dashboard manual-send bridge
                  </p>
                ) : null}
              </div>
              <HealthBadge
                ok={workflow.active}
                label={workflow.active ? 'active' : 'off'}
              />
            </div>
          ))}
        </div>

        {n8n.error ? (
          <p className="border-warning/20 bg-warning/10 text-warning mx-4 mb-4 rounded-lg border p-3 text-xs">
            {n8n.error}
          </p>
        ) : null}
      </section>

      {data.database ? (
        <section className="ops-surface">
          <div className="border-border flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Database Connectivity
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Supabase/Postgres setup checks.
                {/* The API has always returned `checkedAt`; nothing
                    rendered it, so a health page with no timestamp
                    could be five seconds or five hours old. */}
                {data.database.checkedAt ? (
                  <> Last checked {formatOpsAge(data.database.checkedAt)}.</>
                ) : null}
              </p>
            </div>
            <HealthBadge
              ok={data.database.ok}
              label={data.database.ok ? 'reachable' : 'review'}
            />
          </div>
          {!data.database.ok ? (
            <p className="border-warning/20 bg-warning/10 text-warning m-4 rounded-lg border p-3 text-xs">
              {data.database.error || 'Database setup check failed.'}
            </p>
          ) : null}
        </section>
      ) : null}

      {setupHealth ? (
        <section className="ops-surface">
          <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Salon Setup Readiness
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Read-only view of Supabase-backed salon setup.
              </p>
            </div>
            <HealthBadge
              ok={setupItems.every((item) => item.ok)}
              label={setupItems.every((item) => item.ok) ? 'ready' : 'review'}
            />
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {setupItems.map((item) => (
              <div
                key={item.label}
                className="border-border bg-background/50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <span className="text-foreground/80 text-sm">{item.label}</span>
                <HealthBadge
                  ok={item.ok}
                  label={item.value.toLocaleString('en-IN')}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="ops-surface">
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-foreground text-sm font-semibold">
              Dashboard Bridge Readiness
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Manual replies stay routed through the n8n send webhook.
            </p>
          </div>
          <HealthBadge
            ok={n8n.manualSendReady}
            label={n8n.manualSendReady ? 'ready' : 'review'}
          />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {n8n.env.map((check) => (
            <div
              key={check.key}
              className="border-border bg-background/50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-foreground/80 truncate text-sm">
                  {check.label}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {check.key}
                </p>
              </div>
              <HealthBadge
                ok={check.configured}
                label={check.configured ? 'set' : 'missing'}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HealthBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 capitalize',
        ok
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : null}
      {label}
    </Badge>
  );
}
