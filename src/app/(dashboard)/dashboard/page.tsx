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
  UsersRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AutoRefresh } from '@/components/layout/auto-refresh';
import { HandoffActions } from '@/components/dashboard/handoff-actions';
import { CopyLinkButton } from '@/components/dashboard/copy-link-button';
import { TrendsPanel } from '@/components/dashboard/trends-panel';
import { MetricTrend, Sparkline } from '@/components/dashboard/metric-trend';
import {
  type SaluActivityRow,
  type SaluBookingRow,
  type SaluDashboardData,
  type SaluDelta,
  type SaluHandoffRow,
  type SaluMetrics,
  type SaluPaymentQueueRow,
  type SaluSection,
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
  const data = await loadSaluDashboardData();

  // Only when *every* section failed — that is a connection-string or
  // unreachable-database problem, not nine coincidental query bugs, so
  // setup guidance is the useful response. Any lesser failure renders
  // the healthy panels and marks the broken ones individually.
  if (data.down) {
    return <SetupError />;
  }

  // Undefined when the trend queries failed, so the tiles simply omit
  // their delta and sparkline rather than rendering a flat fake zero.
  const trends = data.trends.ok ? data.trends.data : undefined;
  const salonName = data.config.data?.salon_name || 'Salu Salon';

  return (
    <div className="ops-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
            {salonName}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your appointments, customer messages, and deposits for today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <AutoRefresh className="mr-auto sm:mr-1" />
          <Button className="min-h-11" render={<Link href="/inbox" />}>
            <MessageSquareText className="h-4 w-4" />
            Messages
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            render={<Link href="/contacts" />}
          >
            <UsersRound className="h-4 w-4" />
            Customers
          </Button>
        </div>
      </div>

      <PartialFailureNotice data={data} />

      <PriorityStrip data={data} />

      <section
        aria-label="Today at a glance"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricTile
          icon={CalendarCheck}
          label="Appointments today"
          value={metricValue(data.metrics, (m) => m.today_bookings)}
          detail={`${count(data.metrics.data.upcoming_confirmed)} upcoming confirmed`}
          failed={!data.metrics.ok}
          delta={trends?.bookingsDelta}
          spark={trends?.daily.map((d) => d.bookings_created)}
        />
        <MetricTile
          icon={CreditCard}
          label="Pending Deposits"
          value={metricValue(data.metrics, (m) => m.pending_payment_holds)}
          detail={`${formatPaise(data.metrics.data.paid_today_paise)} paid today`}
          tone={data.metrics.data.pending_payment_holds ? 'warn' : 'normal'}
          failed={!data.metrics.ok}
          // No delta or sparkline: the headline here is a *stock*
          // (holds outstanding right now), and the only series we have
          // is a *flow* (deposits collected per day). Attaching one to
          // the other would put a trend under a number it doesn't
          // describe. The flow is charted properly in Trends below.
        />
        <MetricTile
          icon={AlertTriangle}
          label="Needs your reply"
          value={metricValue(data.metrics, (m) => m.needs_attention)}
          detail={`${count(data.metrics.data.human_mode_sessions)} conversation${data.metrics.data.human_mode_sessions === 1 ? '' : 's'} you're handling`}
          tone={data.metrics.data.needs_attention ? 'danger' : 'normal'}
          failed={!data.metrics.ok}
        />
        <MetricTile
          icon={MessageSquareText}
          label="Messages today"
          value={metricValue(data.metrics, (m) => m.messages_today)}
          detail={`${count(data.metrics.data.customers_seen_7d)} customers seen in 7 days`}
          failed={!data.metrics.ok}
          delta={trends?.messagesDelta}
          spark={trends?.daily.map((d) => d.messages)}
        />
      </section>

      <Panel title="This week" section={data.trends}>
        <TrendsPanel trends={data.trends.data} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Panel
          title="Today's appointments"
          section={data.todaySchedule}
          action={
            <StatusBadge tone="neutral">{formatDate(todayKey())}</StatusBadge>
          }
          className="xl:col-span-2"
        >
          <BookingList bookings={data.todaySchedule.data} />
        </Panel>

        <Panel
          title="Coming up"
          section={data.nextSchedule}
          action={
            <StatusBadge tone="neutral">
              {data.nextSchedule.data.length}
            </StatusBadge>
          }
        >
          <BookingList
            bookings={data.nextSchedule.data}
            showDate
            emptyText="No upcoming appointments after today."
          />
        </Panel>

        <Panel
          title="Needs your reply"
          section={data.handoffQueue}
          action={
            <StatusBadge tone={data.handoffQueue.data.length ? 'warn' : 'good'}>
              {data.handoffQueue.data.length}
            </StatusBadge>
          }
        >
          <HandoffQueue rows={data.handoffQueue.data} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          id="deposit-queue"
          title="Deposits to follow up"
          section={data.opsQueue}
          action={
            <StatusBadge tone={data.opsQueue.data.length ? 'warn' : 'good'}>
              {data.opsQueue.data.length}
            </StatusBadge>
          }
        >
          <PaymentQueue rows={data.opsQueue.data} />
        </Panel>

        <Panel
          title="Recent customer activity"
          section={data.recentActivity}
          className="xl:col-span-2"
        >
          <ActivityList rows={data.recentActivity.data} />
        </Panel>
      </div>
    </div>
  );
}

/** Locale-formatted count. */
function count(value: number) {
  return value.toLocaleString('en-IN');
}

/**
 * A metric reads as a hard fact, so a failed query must not render as
 * "0" — that is indistinguishable from a real zero and actively
 * misleading during an incident. Show an em dash instead.
 */
function metricValue(
  section: SaluSection<SaluMetrics>,
  pick: (m: SaluMetrics) => number
) {
  return section.ok ? count(pick(section.data)) : '—';
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'normal',
  failed = false,
  delta,
  invertDelta,
  spark,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  detail: string;
  tone?: 'normal' | 'warn' | 'danger';
  failed?: boolean;
  /** Week-on-week comparison. Omitted when trends failed to load. */
  delta?: SaluDelta;
  invertDelta?: boolean;
  /** 14-day series, oldest first. Context only — see MetricTrend. */
  spark?: number[];
}) {
  return (
    <div
      className={cn(
        'ops-surface flex flex-col p-5',
        !failed && tone === 'warn' && 'border-warning/30',
        !failed && tone === 'danger' && 'border-destructive/30'
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
      <p className="text-muted-foreground mt-2 text-sm">
        {failed ? 'Could not be loaded' : detail}
      </p>
      {!failed && delta ? (
        <div className="mt-2">
          <MetricTrend delta={delta} invert={invertDelta} />
        </div>
      ) : null}
      {!failed && spark?.length ? (
        <Sparkline values={spark} className="mt-3" />
      ) : null}
    </div>
  );
}

/**
 * Names which panels are stale when some — but not all — sections
 * failed. Without this the page looks healthy and the operator trusts
 * an empty queue that is empty only because its query threw.
 */
function PartialFailureNotice({ data }: { data: SaluDashboardData }) {
  const broken = (
    [
      ['Today Schedule', data.todaySchedule],
      ['Next Appointments', data.nextSchedule],
      ['Messages needing your reply', data.handoffQueue],
      ['Deposits to follow up', data.opsQueue],
      ['Recent customer activity', data.recentActivity],
      ['Today at a glance', data.metrics],
    ] as const
  )
    .filter(([, s]) => !s.ok)
    .map(([name]) => name);

  if (!broken.length) return null;

  return (
    <div
      role="status"
      className="border-warning/30 bg-warning/10 flex items-start gap-3 rounded-xl border p-4"
    >
      <AlertTriangle className="text-warning mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium">
          {broken.length === 1
            ? '1 panel could not be loaded'
            : `${broken.length} panels could not be loaded`}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          The rest of your information is still available. Try refreshing this
          page in a moment.
        </p>
      </div>
    </div>
  );
}

function PriorityStrip({ data }: { data: SaluDashboardData }) {
  const handoffs = data.handoffQueue.data;
  const opsQueue = data.opsQueue.data;

  const handoffHref = handoffs[0]?.conversation_id
    ? `/inbox?conversation=${handoffs[0].conversation_id}`
    : '/inbox';

  const items = [
    {
      label: 'Reply next',
      value: handoffs.length,
      detail: handoffs[0]
        ? `${handoffs[0].customer_name || compactPhone(handoffs[0].phone)} · ${formatOpsAge(handoffs[0].handoff_requested_at || handoffs[0].last_message_at)}`
        : 'No customer messages need you right now',
      href: handoffHref,
      ok: data.handoffQueue.ok,
      tone: handoffs.length ? ('danger' as const) : ('good' as const),
    },
    {
      label: 'Deposits',
      value: opsQueue.length,
      detail: opsQueue[0]
        ? `${paymentQueueLabel(opsQueue[0])} · ${formatOpsCountdown(opsQueue[0].expires_at || opsQueue[0].hold_expires_at) || 'no expiry'}`
        : 'No deposits need a follow-up',
      // Was '/dashboard' — a link to the page you are already standing
      // on. Anchors to the queue panel further down instead.
      href: '#deposit-queue',
      ok: data.opsQueue.ok,
      tone: opsQueue.length ? ('warn' as const) : ('good' as const),
    },
  ];

  return (
    <section aria-labelledby="priority-title" className="space-y-3">
      <h2 id="priority-title" className="text-foreground text-lg font-semibold">
        Take care of these first
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              'ops-focus-ring group ops-surface hover:border-primary/50 bg-card/80 p-4 transition-colors',
              // A tile whose query failed stays neutral. Painting it
              // green because the list came back empty would assert
              // "all clear" on data we do not actually have.
              item.ok && item.tone === 'good' && 'border-success/25',
              item.ok && item.tone === 'warn' && 'border-warning/30',
              item.ok && item.tone === 'danger' && 'border-destructive/30'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium">
                  {item.label}
                </p>
                <p className="text-foreground mt-2 text-2xl font-bold tabular-nums">
                  {item.ok ? count(item.value) : '—'}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-sm">
                  {item.ok ? item.detail : 'Could not be loaded'}
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
  id,
  title,
  action,
  className,
  section,
  children,
}: {
  id?: string;
  title: string;
  action?: ReactNode;
  className?: string;
  /** When this section failed, the panel shows why instead of its
   *  children — an empty list and a broken query must not look alike. */
  section?: { ok: boolean; error: string };
  children: ReactNode;
}) {
  const failed = section && !section.ok;

  return (
    <section id={id} className={cn('ops-surface scroll-mt-4', className)}>
      <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-foreground text-sm font-semibold">{title}</h2>
        {failed ? <StatusBadge tone="danger">unavailable</StatusBadge> : action}
      </div>
      <div className="p-4">{failed ? <PanelError /> : children}</div>
    </section>
  );
}

function PanelError() {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-foreground text-sm">This panel could not load.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Try refreshing in a moment.
        </p>
      </div>
    </div>
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
    return <EmptyLine text="No customer messages need your reply right now." />;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        // The card used to be one big <Link>. It can't be any more:
        // the take-over control is a button, and nesting interactive
        // elements is invalid HTML — the click would also bubble
        // straight into a navigation. The link now wraps the title,
        // which is the part that actually means "open this thread".
        <div
          key={row.conversation_id}
          className="border-border bg-background/50 rounded-lg border p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/inbox?conversation=${row.conversation_id}`}
                className="ops-focus-ring text-foreground hover:text-primary block truncate rounded text-sm font-medium transition-colors"
              >
                {row.customer_name || compactPhone(row.phone)}
              </Link>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                {row.last_message_text ||
                  row.handoff_reason ||
                  'This customer needs your help'}
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
            {row.handoff_requested_at ? (
              <span>{formatDateTime(row.handoff_requested_at)}</span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <HandoffActions phone={row.phone} paused={row.bot_paused} />
            <Button
              size="sm"
              variant="ghost"
              render={
                <Link href={`/inbox?conversation=${row.conversation_id}`} />
              }
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              Open chat
            </Button>
          </div>
        </div>
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
              <>
                <CopyLinkButton
                  value={row.payment_link}
                  label="Copy payment link"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  render={
                    <a
                      href={row.payment_link}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ rows }: { rows: SaluActivityRow[] }) {
  if (!rows.length)
    return <EmptyLine text="No customer activity recorded yet." />;

  return (
    <div className="divide-border divide-y">
      {rows.map((row) => (
        <div key={row.event_id} className="flex gap-3 py-3">
          <div className="min-w-0">
            {/* `raw_text` arrives already redacted from loadRecentActivity —
                identifiers are stripped server-side, not here. Don't swap in
                an unredacted field; the inbox thread is where a message is
                read in full. */}
            <p className="text-foreground truncate text-sm">
              {row.raw_text || row.summary || 'Customer activity'}
            </p>
            <p className="text-muted-foreground mt-1 truncate text-xs">
              {compactPhone(row.phone)}
            </p>
          </div>
          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
            {formatOpsAge(row.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SetupError() {
  return (
    <div className="border-destructive/30 bg-destructive/10 rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h1 className="text-foreground text-lg font-semibold">
            We couldn&apos;t load today&apos;s information
          </h1>
          <p className="text-foreground/80 mt-2 text-sm">
            Please refresh the page. If it keeps happening, contact your salon
            support team.
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
  // Maps this page's ops vocabulary onto the shared Badge variants
  // rather than re-declaring the colours inline.
  const variant = {
    good: 'success',
    warn: 'warning',
    danger: 'destructive',
    neutral: 'outline',
  } as const;

  return (
    <Badge variant={variant[tone]} className="border capitalize">
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
