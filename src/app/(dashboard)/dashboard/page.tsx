import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  MessageSquareText,
  Scissors,
  UsersRound,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type SaluActivityRow,
  type SaluBookingRow,
  type SaluDashboardData,
  type SaluHandoffRow,
  type SaluPaymentQueueRow,
  loadSaluDashboardData,
} from "@/lib/salu/queries";
import {
  compactPhone,
  formatDate,
  formatDateTime,
  formatPaise,
  formatTime,
} from "@/lib/salu/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data: SaluDashboardData;

  try {
    data = await loadSaluDashboardData();
  } catch (error) {
    return <SetupError error={error} />;
  }

  const salonName = data.config?.salon_name || "Salu Salon";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{salonName}</h1>
            <StatusBadge tone={data.n8n.ok ? "good" : "warn"}>
              {data.n8n.ok
                ? "n8n live"
                : data.n8n.configured
                  ? "n8n needs review"
                  : "n8n not configured"}
            </StatusBadge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            WhatsApp bookings, deposits, customer memory, and workflow health.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/inbox" />}>
            <MessageSquareText className="h-4 w-4" />
            Inbox
          </Button>
          <Button variant="outline" render={<Link href="/contacts" />}>
            <UsersRound className="h-4 w-4" />
            Customers
          </Button>
          {process.env.N8N_URL ? (
            <Button
              variant="outline"
              render={<a href={process.env.N8N_URL} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="h-4 w-4" />
              n8n
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={CalendarCheck}
          label="Today"
          value={data.metrics.today_bookings.toLocaleString("en-IN")}
          detail={`${data.metrics.upcoming_confirmed.toLocaleString("en-IN")} upcoming confirmed`}
        />
        <MetricTile
          icon={CreditCard}
          label="Pending Deposits"
          value={data.metrics.pending_payment_holds.toLocaleString("en-IN")}
          detail={`${formatPaise(data.metrics.paid_today_paise)} paid today`}
          tone={data.metrics.pending_payment_holds ? "warn" : "normal"}
        />
        <MetricTile
          icon={AlertTriangle}
          label="Needs Attention"
          value={data.metrics.needs_attention.toLocaleString("en-IN")}
          detail={`${data.metrics.human_mode_sessions.toLocaleString("en-IN")} human handoff sessions`}
          tone={data.metrics.needs_attention ? "danger" : "normal"}
        />
        <MetricTile
          icon={MessageSquareText}
          label="WhatsApp Today"
          value={data.metrics.messages_today.toLocaleString("en-IN")}
          detail={`${data.metrics.customers_seen_7d.toLocaleString("en-IN")} customers seen in 7 days`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Today Schedule"
          action={<StatusBadge tone="neutral">{formatDate(todayKey())}</StatusBadge>}
        >
          <BookingList bookings={data.todaySchedule} />
        </Panel>

        <Panel
          title="Human Handoffs"
          action={
            <StatusBadge tone={data.handoffQueue.length ? "warn" : "good"}>
              {data.handoffQueue.length}
            </StatusBadge>
          }
        >
          <HandoffQueue rows={data.handoffQueue} />
        </Panel>

        <Panel
          title="Deposits & Exceptions"
          action={<StatusBadge tone={data.opsQueue.length ? "warn" : "good"}>{data.opsQueue.length}</StatusBadge>}
        >
          <PaymentQueue rows={data.opsQueue} />
        </Panel>
      </div>

      <Panel title="WhatsApp Activity">
        <ActivityList rows={data.recentActivity} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Setup Health" className="xl:col-span-2">
          <SetupHealth data={data} />
        </Panel>
        <Panel title="n8n Workflows">
          <div className="space-y-2">
            {data.n8n.workflows.map((workflow) => (
              <div
                key={workflow.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-slate-300">{workflow.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {workflow.role === "bridge" ? (
                    <StatusBadge tone="neutral">bridge</StatusBadge>
                  ) : null}
                  <StatusBadge tone={workflow.active ? "good" : "danger"}>
                    {workflow.active ? "active" : "off"}
                  </StatusBadge>
                </div>
              </div>
            ))}
            <div className="border-t border-slate-800 pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Dashboard Bridge
                </p>
                <StatusBadge tone={data.n8n.manualSendReady ? "good" : "danger"}>
                  {data.n8n.manualSendReady ? "ready" : "check env"}
                </StatusBadge>
              </div>
              <div className="space-y-2">
                {data.n8n.env.map((check) => (
                  <div
                    key={check.key}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="truncate text-slate-400">{check.label}</span>
                    <StatusBadge tone={check.configured ? "good" : "danger"}>
                      {check.configured ? "set" : "missing"}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </div>
            {data.n8n.error ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                {data.n8n.error}
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = "normal",
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  detail: string;
  tone?: "normal" | "warn" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-slate-900 p-5",
        tone === "warn" && "border-amber-500/30",
        tone === "danger" && "border-red-500/30",
        tone === "normal" && "border-slate-800",
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-500">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-[28px] leading-none font-bold tabular-nums text-white">
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-800 bg-slate-900", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function BookingList({ bookings }: { bookings: SaluBookingRow[] }) {
  if (!bookings.length) return <EmptyLine text="No appointments on the board for today." />;

  return (
    <div className="divide-y divide-slate-800">
      {bookings.map((booking) => (
        <div key={booking.booking_id} className="grid gap-3 py-3 sm:grid-cols-[88px_1fr_auto]">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Clock3 className="h-4 w-4 text-slate-500" />
            {formatTime(booking.appointment_time)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {booking.customer_name || compactPhone(booking.phone)}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {booking.service_assignments_summary ||
                [
                  booking.service_labels || booking.service_label || "Service",
                  booking.stylist_names || booking.stylist_name ? `with ${booking.stylist_names || booking.stylist_name}` : "",
                ].filter(Boolean).join(" ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge tone={booking.status === "confirmed" ? "good" : "warn"}>
              {booking.status}
            </StatusBadge>
            <StatusBadge tone={booking.payment_status === "paid" ? "good" : "neutral"}>
              {booking.payment_status || "no payment"}
            </StatusBadge>
          </div>
        </div>
      ))}
    </div>
  );
}

function HandoffQueue({ rows }: { rows: SaluHandoffRow[] }) {
  if (!rows.length) return <EmptyLine text="No active handoffs. The bot is carrying the queue." />;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Link
          key={row.conversation_id}
          href={`/inbox?conversation=${row.conversation_id}`}
          className="block rounded-lg border border-slate-800 bg-slate-950/50 p-3 transition-colors hover:border-primary/40 hover:bg-slate-950"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {row.customer_name || compactPhone(row.phone)}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                {row.last_message_text || row.handoff_reason || "Needs human help"}
              </p>
            </div>
            <StatusBadge tone={row.unread_count ? "warn" : "neutral"}>
              {row.unread_count ? `${row.unread_count} unread` : row.handoff_state}
            </StatusBadge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{compactPhone(row.phone)}</span>
            <span>{row.handoff_category || "handoff"}</span>
            {row.handoff_requested_at ? (
              <span>{formatDateTime(row.handoff_requested_at)}</span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

function PaymentQueue({ rows }: { rows: SaluPaymentQueueRow[] }) {
  if (!rows.length) return <EmptyLine text="No active payment or refund issues." />;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={`${row.booking_id}-${row.reference_id}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {row.customer_name || compactPhone(row.phone)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {formatDate(row.appointment_date)} at {formatTime(row.appointment_time)} ·{" "}
                {row.service_assignments_summary || row.service_labels || row.service_label || "Service"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <StatusBadge tone={issueTone(row.status, row.payment_status)}>
                {row.status}
              </StatusBadge>
              <StatusBadge tone={issueTone(row.payment_status_row || row.payment_status, "")}>
                {row.payment_status_row || row.payment_status || "payment"}
              </StatusBadge>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{formatPaise(row.amount_paise)} deposit</span>
            {row.expires_at || row.hold_expires_at ? (
              <span>expires {formatDateTime(row.expires_at || row.hold_expires_at)}</span>
            ) : null}
            {row.reference_id ? <span>ref {row.reference_id}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ rows }: { rows: SaluActivityRow[] }) {
  if (!rows.length) return <EmptyLine text="No WhatsApp events recorded yet." />;

  return (
    <div className="divide-y divide-slate-800">
      {rows.map((row) => (
        <div key={row.event_id} className="grid gap-3 py-3 sm:grid-cols-[160px_1fr_auto]">
          <div className="text-xs text-slate-500">{formatDateTime(row.created_at)}</div>
          <div className="min-w-0">
            <p className="truncate text-sm text-white">
              {row.raw_text || row.summary || row.intent || row.event_type}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {compactPhone(row.phone)} · {row.route || "route"} · {row.intent || "intent"}
            </p>
          </div>
          <StatusBadge tone={row.status === "processed" ? "good" : "neutral"}>
            {row.event_type || row.status}
          </StatusBadge>
        </div>
      ))}
    </div>
  );
}

function SetupHealth({ data }: { data: SaluDashboardData }) {
  const items = [
    { label: "Active services", value: data.setupHealth.active_services, tone: "good" as const },
    { label: "Active stylists", value: data.setupHealth.active_stylists, tone: "good" as const },
    {
      label: "Missing stylist photos",
      value: data.setupHealth.stylists_missing_images,
      tone: data.setupHealth.stylists_missing_images ? ("warn" as const) : ("good" as const),
    },
    { label: "Stylist service mappings", value: data.setupHealth.active_stylist_services, tone: "good" as const },
    { label: "Salon availability rules", value: data.setupHealth.availability_rules, tone: "neutral" as const },
    { label: "Stylist availability rules", value: data.setupHealth.stylist_availability_rules, tone: "neutral" as const },
    {
      label: "Stale pending holds",
      value: data.setupHealth.stale_pending_holds,
      tone: data.setupHealth.stale_pending_holds ? ("danger" as const) : ("good" as const),
    },
    {
      label: "Failed/refund payments",
      value: data.setupHealth.failed_payments,
      tone: data.setupHealth.failed_payments ? ("danger" as const) : ("good" as const),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
          >
            <span className="text-sm text-slate-400">{item.label}</span>
            <StatusBadge tone={item.tone}>{item.value.toLocaleString("en-IN")}</StatusBadge>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
            <Scissors className="h-4 w-4 text-slate-500" />
            Sheet Sync
          </div>
          <div className="space-y-2">
            {data.syncRuns.slice(0, 4).map((run) => (
              <div key={`${run.tab_name}-${run.created_at}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-slate-400">{run.tab_name || run.source}</span>
                <span className="text-slate-500">
                  {run.status} · {run.row_count} rows · {formatDateTime(run.created_at)}
                </span>
              </div>
            ))}
            {!data.syncRuns.length ? <EmptyLine text="No sheet sync runs recorded." /> : null}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
            <Workflow className="h-4 w-4 text-slate-500" />
            Sync State
          </div>
          <div className="space-y-2">
            {data.syncState.slice(0, 4).map((state) => (
              <div key={state.sync_name} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-slate-400">{state.sync_name}</span>
                <span className="text-slate-500">
                  {state.last_status || "seen"} · {formatDateTime(state.updated_at)}
                </span>
              </div>
            ))}
            {!data.syncState.length ? <EmptyLine text="No sync watermarks recorded." /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupError({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
        <div>
          <h1 className="text-lg font-semibold text-white">Dashboard setup needs attention</h1>
          <p className="mt-2 text-sm text-red-100">
            {error instanceof Error ? error.message : "Unable to load Salu dashboard data."}
          </p>
          <p className="mt-3 text-sm text-slate-300">
            Run <code className="rounded bg-slate-950 px-1.5 py-0.5">npm run setup:salu-env</code>, then{" "}
            <code className="rounded bg-slate-950 px-1.5 py-0.5">npm run check:salu-setup</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "good" | "warn" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-300",
        tone === "danger" && "border-red-500/30 bg-red-500/10 text-red-300",
        tone === "neutral" && "border-slate-700 bg-slate-800 text-slate-300",
      )}
    >
      {tone === "good" ? <CheckCircle2 className="h-3 w-3" /> : null}
      {children}
    </Badge>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="py-4 text-sm text-slate-500">{text}</p>;
}

function issueTone(status: string, paymentStatus: string) {
  const combined = `${status} ${paymentStatus}`.toLowerCase();
  if (combined.includes("refund") || combined.includes("failed")) return "danger";
  if (combined.includes("pending") || combined.includes("expired")) return "warn";
  return "neutral";
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
