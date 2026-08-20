import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
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
import {
  DaybookDate,
  DaybookTimeline,
  OperationalSummary,
  ShiftBrief,
} from '@/components/dashboard/today-daybook';
import {
  type SaluActivityRow,
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
  const data = await loadSaluDashboardData();

  // Only when *every* section failed — that is a connection-string or
  // unreachable-database problem, not nine coincidental query bugs, so
  // setup guidance is the useful response. Any lesser failure renders
  // the healthy panels and marks the broken ones individually.
  if (data.down) {
    return <SetupError />;
  }

  const salonName = data.config.data?.salon_name || 'Salu Salon';

  return (
    <div className="ops-page">
      <header className="ops-page-header">
        <div>
          <h1 className="ops-page-heading">Today at {salonName}</h1>
          <p className="ops-page-description">
            <span className="text-foreground font-medium">
              <DaybookDate />.
            </span>{' '}
            What needs attention now, followed by the rest of your shift.
          </p>
        </div>
        <div className="ops-page-actions items-center">
          <AutoRefresh className="col-span-2 mb-1 justify-between sm:mr-1 sm:mb-0" />
          <Button
            className="min-h-11 w-full sm:w-auto"
            render={<Link href="/inbox" />}
          >
            <MessageSquareText className="h-4 w-4" />
            Open messages
          </Button>
          <Button
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            render={<Link href="/contacts" />}
          >
            <UsersRound className="h-4 w-4" />
            Find customer
          </Button>
        </div>
      </header>

      <PartialFailureNotice data={data} />

      <ShiftBrief data={data} />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 xl:order-1">
          <DaybookTimeline section={data.todaySchedule} />
        </div>

        <aside
          aria-label="Shift exceptions"
          className="order-1 grid gap-4 sm:grid-cols-2 xl:order-2 xl:grid-cols-1"
        >
          <Panel
            title="Needs your reply"
            section={data.handoffQueue}
            action={
              <StatusBadge
                tone={data.handoffQueue.data.length ? 'warn' : 'good'}
              >
                {data.handoffQueue.data.length}
              </StatusBadge>
            }
          >
            <HandoffQueue rows={data.handoffQueue.data} />
          </Panel>

          <Panel
            id="deposit-queue"
            title="Deposit follow-up"
            section={data.opsQueue}
            action={
              <StatusBadge tone={data.opsQueue.data.length ? 'warn' : 'good'}>
                {data.opsQueue.data.length}
              </StatusBadge>
            }
          >
            <PaymentQueue rows={data.opsQueue.data} />
          </Panel>
        </aside>
      </div>

      <OperationalSummary metrics={data.metrics} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Coming up after today"
          section={data.nextSchedule}
          action={
            <StatusBadge tone="neutral">
              {data.nextSchedule.data.length}
            </StatusBadge>
          }
        >
          <FutureBookings bookings={data.nextSchedule.data} />
        </Panel>

        <Panel title="Recent customer activity" section={data.recentActivity}>
          <ActivityList rows={data.recentActivity.data} />
        </Panel>
      </div>

      <details className="ops-surface group overflow-hidden">
        <summary className="ops-focus-ring hover:bg-muted/40 flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-semibold transition-colors sm:px-5">
          This week’s insights
          <span className="text-muted-foreground text-xs font-normal group-open:hidden">
            Show charts
          </span>
          <span className="text-muted-foreground hidden text-xs font-normal group-open:inline">
            Hide charts
          </span>
        </summary>
        <div className="border-border border-t p-4 sm:p-5">
          {data.trends.ok ? (
            <TrendsPanel trends={data.trends.data} />
          ) : (
            <PanelError />
          )}
        </div>
      </details>
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
    <div role="status" className="ops-status-notice ops-status-notice-warning">
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

function FutureBookings({
  bookings,
}: {
  bookings: Array<{
    booking_id: string;
    appointment_date: string;
    appointment_time: string;
    customer_name: string;
    phone: string;
    service_assignments_summary: string;
    service_labels: string;
    service_label: string;
    stylist_names: string;
    stylist_name: string;
    status: string;
    payment_status: string;
  }>;
}) {
  if (!bookings.length)
    return <EmptyLine text="No upcoming appointments after today." />;

  return (
    <div className="divide-border divide-y">
      {bookings.map((booking) => (
        <div
          key={booking.booking_id}
          className="grid gap-3 py-3 sm:grid-cols-[7rem_1fr_auto]"
        >
          <div className="text-foreground text-sm font-semibold">
            {formatDate(booking.appointment_date)}
            <span className="text-muted-foreground block text-xs font-normal tabular-nums">
              {formatTime(booking.appointment_time)}
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
    <div className="divide-border divide-y">
      {rows.map((row) => (
        // The card used to be one big <Link>. It can't be any more:
        // the take-over control is a button, and nesting interactive
        // elements is invalid HTML — the click would also bubble
        // straight into a navigation. The link now wraps the title,
        // which is the part that actually means "open this thread".
        <div key={row.conversation_id} className="py-3 first:pt-0 last:pb-0">
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
    <div className="divide-border divide-y">
      {rows.map((row) => (
        <div
          key={`${row.booking_id}-${row.reference_id}`}
          className="py-3 first:pt-0 last:pb-0"
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
