import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  MessageSquareText,
  Scissors,
  UsersRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type SaluActivityRow,
  type SaluBookingRow,
  type SaluDashboardData,
  type SaluHandoffRow,
  type SaluPaymentQueueRow,
  loadSaluDashboardData,
} from '@/lib/salu/queries';
import {
  compactPhone,
  formatDate,
  formatDateTime,
  formatPaise,
  formatTime,
} from '@/lib/salu/format';
import {
  formatOpsAge,
  formatOpsCountdown,
  paymentQueueLabel,
  paymentQueueTone,
} from '@/lib/salu/ops';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let data: SaluDashboardData;

  try {
    data = await loadSaluDashboardData();
  } catch (error) {
    return <SetupError error={error} />;
  }

  const salonName = data.config?.salon_name || 'Salu Salon';

  return (
    <div className="ops-page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="ops-eyebrow">Today&apos;s control room</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
              {salonName}
            </h1>
            <StatusBadge tone={data.n8n.ok ? 'good' : 'warn'}>
              {data.n8n.ok
                ? 'n8n live'
                : data.n8n.configured
                  ? 'n8n needs review'
                  : 'n8n not configured'}
            </StatusBadge>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Prioritise customer handoffs, booking exceptions, and today&apos;s
            appointments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="/inbox" />}>
            <MessageSquareText className="h-4 w-4" />
            Open inbox
          </Button>
          <Button variant="outline" render={<Link href="/contacts" />}>
            <UsersRound className="h-4 w-4" />
            Customers
          </Button>
          {process.env.N8N_URL ? (
            <Button
              variant="outline"
              render={
                <a
                  href={process.env.N8N_URL}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <ExternalLink className="h-4 w-4" />
              n8n
            </Button>
          ) : null}
        </div>
      </div>

      <PriorityStrip data={data} />

      <section
        aria-label="Today at a glance"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricTile
          icon={CalendarCheck}
          label="Today"
          value={data.metrics.today_bookings.toLocaleString('en-IN')}
          detail={`${data.metrics.upcoming_confirmed.toLocaleString('en-IN')} upcoming confirmed`}
        />
        <MetricTile
          icon={CreditCard}
          label="Pending Deposits"
          value={data.metrics.pending_payment_holds.toLocaleString('en-IN')}
          detail={`${formatPaise(data.metrics.paid_today_paise)} paid today`}
          tone={data.metrics.pending_payment_holds ? 'warn' : 'normal'}
        />
        <MetricTile
          icon={AlertTriangle}
          label="Needs Attention"
          value={data.metrics.needs_attention.toLocaleString('en-IN')}
          detail={`${data.metrics.human_mode_sessions.toLocaleString('en-IN')} human handoff sessions`}
          tone={data.metrics.needs_attention ? 'danger' : 'normal'}
        />
        <MetricTile
          icon={MessageSquareText}
          label="WhatsApp Today"
          value={data.metrics.messages_today.toLocaleString('en-IN')}
          detail={`${data.metrics.customers_seen_7d.toLocaleString('en-IN')} customers seen in 7 days`}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Panel
          title="Today Schedule"
          action={
            <StatusBadge tone="neutral">{formatDate(todayKey())}</StatusBadge>
          }
          className="xl:col-span-2"
        >
          <BookingList bookings={data.todaySchedule} />
        </Panel>

        <Panel
          title="Next Appointments"
          action={
            <StatusBadge tone="neutral">{data.nextSchedule.length}</StatusBadge>
          }
        >
          <BookingList
            bookings={data.nextSchedule}
            showDate
            emptyText="No upcoming appointments after today."
          />
        </Panel>

        <Panel
          title="Human Handoffs"
          action={
            <StatusBadge tone={data.handoffQueue.length ? 'warn' : 'good'}>
              {data.handoffQueue.length}
            </StatusBadge>
          }
        >
          <HandoffQueue rows={data.handoffQueue} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Deposits & Exceptions"
          action={
            <StatusBadge tone={data.opsQueue.length ? 'warn' : 'good'}>
              {data.opsQueue.length}
            </StatusBadge>
          }
        >
          <PaymentQueue rows={data.opsQueue} />
        </Panel>

        <Panel title="WhatsApp Activity" className="xl:col-span-2">
          <ActivityList rows={data.recentActivity} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Setup Health" className="xl:col-span-2">
          <SetupHealth data={data} />
        </Panel>
        <Panel title="n8n Workflows">
          <div className="space-y-2">
            {data.n8n.workflows.map((workflow) => (
              <div
                key={workflow.name}
                className="border-border bg-background/50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <span className="text-foreground/80 min-w-0 truncate text-sm">
                  {workflow.name}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {workflow.role === 'bridge' ? (
                    <StatusBadge tone="neutral">bridge</StatusBadge>
                  ) : null}
                  <StatusBadge tone={workflow.active ? 'good' : 'danger'}>
                    {workflow.active ? 'active' : 'off'}
                  </StatusBadge>
                </div>
              </div>
            ))}
            <div className="border-border border-t pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Dashboard Bridge
                </p>
                <StatusBadge
                  tone={data.n8n.manualSendReady ? 'good' : 'danger'}
                >
                  {data.n8n.manualSendReady ? 'ready' : 'check env'}
                </StatusBadge>
              </div>
              <div className="space-y-2">
                {data.n8n.env.map((check) => (
                  <div
                    key={check.key}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-muted-foreground truncate">
                      {check.label}
                    </span>
                    <StatusBadge tone={check.configured ? 'good' : 'danger'}>
                      {check.configured ? 'set' : 'missing'}
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
  tone = 'normal',
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  detail: string;
  tone?: 'normal' | 'warn' | 'danger';
}) {
  return (
    <div
      className={cn(
        'ops-surface p-5',
        tone === 'warn' && 'border-amber-500/30',
        tone === 'danger' && 'border-red-500/30',
        tone === 'normal' && 'border-border'
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <div className="bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-foreground mt-3 text-[28px] leading-none font-bold tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground mt-2 text-sm">{detail}</p>
    </div>
  );
}

function PriorityStrip({ data }: { data: SaluDashboardData }) {
  const setupIssues =
    data.setupHealth.stylists_missing_images +
    data.setupHealth.stale_pending_holds +
    data.setupHealth.failed_payments +
    (data.setupHealth.active_services ? 0 : 1) +
    (data.setupHealth.active_stylists ? 0 : 1) +
    (data.setupHealth.active_stylist_services ? 0 : 1) +
    (data.setupHealth.availability_rules +
    data.setupHealth.stylist_availability_rules
      ? 0
      : 1);
  const handoffHref = data.handoffQueue[0]?.conversation_id
    ? `/inbox?conversation=${data.handoffQueue[0].conversation_id}`
    : '/inbox';

  const items = [
    {
      label: 'Human queue',
      value: data.handoffQueue.length,
      detail: data.handoffQueue[0]
        ? `${data.handoffQueue[0].customer_name || compactPhone(data.handoffQueue[0].phone)} · ${formatOpsAge(data.handoffQueue[0].handoff_requested_at || data.handoffQueue[0].last_message_at)}`
        : 'No active handoffs',
      href: handoffHref,
      tone: data.handoffQueue.length ? ('danger' as const) : ('good' as const),
    },
    {
      label: 'Deposit queue',
      value: data.opsQueue.length,
      detail: data.opsQueue[0]
        ? `${paymentQueueLabel(data.opsQueue[0])} · ${formatOpsCountdown(data.opsQueue[0].expires_at || data.opsQueue[0].hold_expires_at) || 'no expiry'}`
        : 'No payment exceptions',
      href: '/dashboard',
      tone: data.opsQueue.length ? ('warn' as const) : ('good' as const),
    },
    {
      label: 'Salon setup',
      value: setupIssues,
      detail: setupIssues
        ? `${setupIssues} setup checks need review`
        : 'Supabase setup looks steady',
      href: '/salon-control',
      tone: setupIssues ? ('warn' as const) : ('good' as const),
    },
    {
      label: 'Bridge',
      value: data.n8n.activeCount,
      detail: data.n8n.ok
        ? 'n8n and manual-send ready'
        : `${data.n8n.activeCount}/${data.n8n.expectedCount} workflows active`,
      href: '/system-health',
      tone: data.n8n.ok ? ('good' as const) : ('danger' as const),
    },
  ];

  return (
    <section aria-labelledby="priority-title" className="ops-surface p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h2 id="priority-title" className="ops-section-title">
            Act next
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            The queues that can affect a customer&apos;s experience today.
          </p>
        </div>
        <span className="text-muted-foreground text-xs font-medium">
          Live operational view
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              'ops-focus-ring group hover:border-primary/50 bg-background/50 hover:bg-card/80 rounded-xl border p-4 transition-colors',
              item.tone === 'good' && 'border-emerald-500/25',
              item.tone === 'warn' && 'border-amber-500/30',
              item.tone === 'danger' && 'border-red-500/30'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {item.label}
                </p>
                <p className="text-foreground mt-2 text-2xl font-bold tabular-nums">
                  {item.value.toLocaleString('en-IN')}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-sm">
                  {item.detail}
                </p>
              </div>
              <ArrowRight className="group-hover:text-primary text-muted-foreground/70 mt-1 h-4 w-4 shrink-0 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('ops-surface', className)}>
      <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-foreground text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function BookingList({
  bookings,
  showDate = false,
  emptyText = 'No appointments on the board for today.',
}: {
  bookings: SaluBookingRow[];
  showDate?: boolean;
  emptyText?: string;
}) {
  if (!bookings.length) return <EmptyLine text={emptyText} />;

  return (
    <div className="divide-border divide-y">
      {bookings.map((booking) => (
        <div
          key={booking.booking_id}
          className="grid gap-3 py-3 sm:grid-cols-[108px_1fr_auto]"
        >
          <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="text-muted-foreground h-4 w-4" />
            <span>
              {showDate ? (
                <>
                  {formatDate(booking.appointment_date)}
                  <span className="text-muted-foreground block text-xs font-normal">
                    {formatTime(booking.appointment_time)}
                  </span>
                </>
              ) : (
                formatTime(booking.appointment_time)
              )}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-medium">
              {booking.customer_name || compactPhone(booking.phone)}
            </p>
            <p className="text-muted-foreground mt-1 truncate text-xs">
              {booking.service_assignments_summary ||
                [
                  booking.service_labels || booking.service_label || 'Service',
                  booking.stylist_names || booking.stylist_name
                    ? `with ${booking.stylist_names || booking.stylist_name}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge
              tone={booking.status === 'confirmed' ? 'good' : 'warn'}
            >
              {booking.status}
            </StatusBadge>
            <StatusBadge
              tone={booking.payment_status === 'paid' ? 'good' : 'neutral'}
            >
              {booking.payment_status || 'no payment'}
            </StatusBadge>
          </div>
        </div>
      ))}
    </div>
  );
}

function HandoffQueue({ rows }: { rows: SaluHandoffRow[] }) {
  if (!rows.length)
    return (
      <EmptyLine text="No active handoffs. The bot is carrying the queue." />
    );

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Link
          key={row.conversation_id}
          href={`/inbox?conversation=${row.conversation_id}`}
          className="hover:border-primary/40 border-border bg-background/50 hover:bg-background block rounded-lg border p-3 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-medium">
                {row.customer_name || compactPhone(row.phone)}
              </p>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                {row.last_message_text ||
                  row.handoff_reason ||
                  'Needs human help'}
              </p>
            </div>
            <StatusBadge tone={row.unread_count ? 'warn' : 'neutral'}>
              {row.unread_count
                ? `${row.unread_count} unread`
                : formatOpsAge(row.handoff_requested_at || row.last_message_at)}
            </StatusBadge>
          </div>
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-2 text-xs">
            <span>{compactPhone(row.phone)}</span>
            <span>{row.handoff_category || 'handoff'}</span>
            {row.handoff_reason ? <span>{row.handoff_reason}</span> : null}
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
  if (!rows.length)
    return <EmptyLine text="No active payment or refund issues." />;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={`${row.booking_id}-${row.reference_id}`}
          className="border-border bg-background/50 rounded-lg border p-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-medium">
                {row.customer_name || compactPhone(row.phone)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {formatDate(row.appointment_date)} at{' '}
                {formatTime(row.appointment_time)} ·{' '}
                {row.service_assignments_summary ||
                  row.service_labels ||
                  row.service_label ||
                  'Service'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <StatusBadge tone={paymentQueueTone(row)}>
                {paymentQueueLabel(row)}
              </StatusBadge>
              <StatusBadge tone={paymentQueueTone(row)}>
                {row.payment_status_row || row.payment_status || 'payment'}
              </StatusBadge>
            </div>
          </div>
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span>{formatPaise(row.amount_paise)} deposit</span>
            {row.expires_at || row.hold_expires_at ? (
              <span>
                {formatOpsCountdown(row.expires_at || row.hold_expires_at)} ·{' '}
                {formatDateTime(row.expires_at || row.hold_expires_at)}
              </span>
            ) : null}
            {row.reference_id ? <span>ref {row.reference_id}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {row.conversation_id ? (
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link href={`/inbox?conversation=${row.conversation_id}`} />
                }
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                Open chat
              </Button>
            ) : null}
            {row.payment_link ? (
              <Button
                size="sm"
                variant="outline"
                render={
                  <a href={row.payment_link} target="_blank" rel="noreferrer" />
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Payment link
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ rows }: { rows: SaluActivityRow[] }) {
  if (!rows.length)
    return <EmptyLine text="No WhatsApp events recorded yet." />;

  return (
    <div className="divide-border divide-y">
      {rows.map((row) => (
        <div
          key={row.event_id}
          className="grid gap-3 py-3 sm:grid-cols-[160px_1fr_auto]"
        >
          <div className="text-muted-foreground text-xs">
            <span className="text-muted-foreground block">
              {formatOpsAge(row.created_at)}
            </span>
            <span>{formatDateTime(row.created_at)}</span>
          </div>
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm">
              {row.raw_text || row.summary || row.intent || row.event_type}
            </p>
            <p className="text-muted-foreground mt-1 truncate text-xs">
              {compactPhone(row.phone)} · {row.route || 'route'} ·{' '}
              {row.intent || 'intent'}
            </p>
          </div>
          <StatusBadge tone={row.status === 'processed' ? 'good' : 'neutral'}>
            {row.event_type || row.status}
          </StatusBadge>
        </div>
      ))}
    </div>
  );
}

function SetupHealth({ data }: { data: SaluDashboardData }) {
  const items = [
    {
      label: 'Active services',
      value: data.setupHealth.active_services,
      tone: 'good' as const,
    },
    {
      label: 'Active stylists',
      value: data.setupHealth.active_stylists,
      tone: 'good' as const,
    },
    {
      label: 'Missing stylist photos',
      value: data.setupHealth.stylists_missing_images,
      tone: data.setupHealth.stylists_missing_images
        ? ('warn' as const)
        : ('good' as const),
    },
    {
      label: 'Stylist service mappings',
      value: data.setupHealth.active_stylist_services,
      tone: 'good' as const,
    },
    {
      label: 'Salon availability rules',
      value: data.setupHealth.availability_rules,
      tone: 'neutral' as const,
    },
    {
      label: 'Stylist availability rules',
      value: data.setupHealth.stylist_availability_rules,
      tone: 'neutral' as const,
    },
    {
      label: 'Stale pending holds',
      value: data.setupHealth.stale_pending_holds,
      tone: data.setupHealth.stale_pending_holds
        ? ('danger' as const)
        : ('good' as const),
    },
    {
      label: 'Failed/refund payments',
      value: data.setupHealth.failed_payments,
      tone: data.setupHealth.failed_payments
        ? ('danger' as const)
        : ('good' as const),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="border-border bg-background/50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
          >
            <span className="text-muted-foreground text-sm">{item.label}</span>
            <StatusBadge tone={item.tone}>
              {item.value.toLocaleString('en-IN')}
            </StatusBadge>
          </div>
        ))}
      </div>

      <div className="border-border bg-background/50 rounded-lg border p-3">
        <div className="text-foreground mb-2 flex items-center gap-2 text-sm font-medium">
          <Scissors className="text-muted-foreground h-4 w-4" />
          Salon Control
        </div>
        <p className="text-muted-foreground text-sm">
          Services, stylists, staff mappings, salon hours, and availability are
          managed in Supabase from the control room.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          render={<Link href="/salon-control" />}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Open control room
        </Button>
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
          <h1 className="text-foreground text-lg font-semibold">
            Dashboard setup needs attention
          </h1>
          <p className="mt-2 text-sm text-red-100">
            {error instanceof Error
              ? error.message
              : 'Unable to load Salu dashboard data.'}
          </p>
          <p className="text-foreground/80 mt-3 text-sm">
            Run{' '}
            <code className="bg-background rounded px-1.5 py-0.5">
              npm run setup:salu-env
            </code>
            , then{' '}
            <code className="bg-background rounded px-1.5 py-0.5">
              npm run check:salu-setup
            </code>
            .
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
  tone: 'good' | 'warn' | 'danger' | 'neutral';
  children: ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize',
        tone === 'good' &&
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'danger' && 'border-red-500/30 bg-red-500/10 text-red-300',
        tone === 'neutral' && 'border-border bg-muted text-foreground/80'
      )}
    >
      {tone === 'good' ? <CheckCircle2 className="h-3 w-3" /> : null}
      {children}
    </Badge>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-muted-foreground py-4 text-sm">{text}</p>;
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
