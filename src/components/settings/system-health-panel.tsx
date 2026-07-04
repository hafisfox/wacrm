"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  SaluN8nHealth,
  SaluSetupHealth,
} from "@/lib/salu/queries";
import { cn } from "@/lib/utils";

interface SystemHealthPayload {
  n8n: SaluN8nHealth;
  setupHealth: SaluSetupHealth;
}

export function SystemHealthPanel() {
  const [data, setData] = useState<SystemHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/salu/system-health", {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      setData(payload as SystemHealthPayload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Unable to load health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading system health
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <div>
            <h2 className="text-sm font-semibold text-white">
              System health unavailable
            </h2>
            <p className="mt-1 text-sm text-red-100">{error}</p>
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
          label: "Active services",
          value: setupHealth.active_services,
          ok: setupHealth.active_services > 0,
        },
        {
          label: "Active stylists",
          value: setupHealth.active_stylists,
          ok: setupHealth.active_stylists > 0,
        },
        {
          label: "Missing stylist photos",
          value: setupHealth.stylists_missing_images,
          ok: setupHealth.stylists_missing_images === 0,
        },
        {
          label: "Stale pending holds",
          value: setupHealth.stale_pending_holds,
          ok: setupHealth.stale_pending_holds === 0,
        },
        {
          label: "Failed/refund payments",
          value: setupHealth.failed_payments,
          ok: setupHealth.failed_payments === 0,
        },
        {
          label: "Stylist mappings",
          value: setupHealth.active_stylist_services,
          ok: setupHealth.active_stylist_services > 0,
        },
      ]
    : [];

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">
              n8n Production Workflows
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {n8n.activeCount} of {n8n.expectedCount} active
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HealthBadge ok={n8n.ok} label={n8n.ok ? "healthy" : "review"} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {n8n.workflows.map((workflow) => (
            <div
              key={workflow.name}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-300">
                  {workflow.name}
                </p>
                {workflow.role === "bridge" ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Dashboard manual-send bridge
                  </p>
                ) : null}
              </div>
              <HealthBadge
                ok={workflow.active}
                label={workflow.active ? "active" : "off"}
              />
            </div>
          ))}
        </div>

        {n8n.error ? (
          <p className="mx-4 mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
            {n8n.error}
          </p>
        ) : null}
      </section>

      {setupHealth ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Salon Setup Readiness
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Read-only view of Supabase-backed salon setup.
              </p>
            </div>
            <HealthBadge
              ok={setupItems.every((item) => item.ok)}
              label={setupItems.every((item) => item.ok) ? "ready" : "review"}
            />
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {setupItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
              >
                <span className="text-sm text-slate-300">{item.label}</span>
                <HealthBadge
                  ok={item.ok}
                  label={item.value.toLocaleString("en-IN")}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Dashboard Bridge Readiness
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Manual replies stay routed through the n8n send webhook.
            </p>
          </div>
          <HealthBadge
            ok={n8n.manualSendReady}
            label={n8n.manualSendReady ? "ready" : "review"}
          />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {n8n.env.map((check) => (
            <div
              key={check.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-300">
                  {check.label}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {check.key}
                </p>
              </div>
              <HealthBadge
                ok={check.configured}
                label={check.configured ? "set" : "missing"}
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
        "shrink-0 capitalize",
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300",
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : null}
      {label}
    </Badge>
  );
}
