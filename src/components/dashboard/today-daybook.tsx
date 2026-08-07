import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  CreditCard,
  MessageSquareText,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type {
  SaluBookingRow,
  SaluDashboardData,
  SaluMetrics,
  SaluSection,
} from '@/lib/salu/queries';
import {
  compactPhone,
  formatDate,
  formatPaise,
  formatTime,
} from '@/lib/salu/format';
import {
  formatOpsAge,
  formatOpsCountdown,
  paymentQueueLabel,
} from '@/lib/salu/ops';
import { cn } from '@/lib/utils';

const SALON_TIME_ZONE = 'Asia/Kolkata';

export function ShiftBrief({ data }: { data: SaluDashboardData }) {
  const handoff = data.handoffQueue.data[0];
  const deposit = data.opsQueue.data[0];
  const nextAppointment = findNextAppointment(data.todaySchedule.data);

  const items = [
    {
      label: 'Needs reply',
      value: data.handoffQueue.ok ? String(data.handoffQueue.data.length) : '—',
      detail: !data.handoffQueue.ok
        ? 'Could not be loaded'
        : handoff
          ? `${handoff.customer_name || compactPhone(handoff.phone)} · ${formatOpsAge(handoff.handoff_requested_at || handoff.last_message_at)}`
          : 'Inbox is clear',
      href: handoff?.conversation_id
        ? `/inbox?conversation=${handoff.conversation_id}`
        : '/inbox',
      icon: MessageSquareText,
      tone: handoff ? 'urgent' : 'clear',
    },
    {
      label: nextAppointment ? 'Next appointment' : 'Today’s appointments',
      value: nextAppointment
        ? formatTime(nextAppointment.appointment_time)
        : data.todaySchedule.ok
          ? String(data.todaySchedule.data.length)
          : '—',
      detail: !data.todaySchedule.ok
        ? 'Could not be loaded'
        : nextAppointment
          ? `${nextAppointment.customer_name || compactPhone(nextAppointment.phone)} · ${serviceSummary(nextAppointment)}`
          : data.todaySchedule.data.length
            ? 'The remaining schedule is complete'
            : 'No appointments on the board',
      href: '#today-daybook',
      icon: CalendarCheck2,
      tone: 'current',
    },
    {
      label: 'Deposit follow-up',
      value: data.opsQueue.ok ? String(data.opsQueue.data.length) : '—',
      detail: !data.opsQueue.ok
        ? 'Could not be loaded'
        : deposit
          ? `${paymentQueueLabel(deposit)} · ${formatOpsCountdown(deposit.expires_at || deposit.hold_expires_at) || 'no expiry'}`
          : 'No deposits need attention',
      href: '#deposit-queue',
      icon: CreditCard,
      tone: deposit ? 'warning' : 'clear',
    },
  ] as const;

  return (
    <section
      aria-labelledby="shift-brief-title"
      className="ops-surface overflow-hidden"
    >
      <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="bg-primary h-2 w-2 rounded-full shadow-[0_0_0_4px_var(--primary-soft)]" />
          <h2 id="shift-brief-title" className="text-sm font-semibold">
            Live shift brief
          </h2>
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatLiveTime()}
        </span>
      </div>
      <div className="divide-border grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="ops-focus-ring group hover:bg-muted/40 flex min-h-28 items-start gap-3 px-4 py-4 transition-colors sm:min-h-32 sm:px-5"
          >
            <span
              className={cn(
                'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border',
                item.tone === 'urgent' &&
                  'border-destructive/30 bg-destructive/10 text-destructive',
                item.tone === 'warning' &&
                  'border-warning/30 bg-warning/10 text-warning',
                item.tone === 'current' &&
                  'border-primary/30 bg-primary-soft text-primary',
                item.tone === 'clear' &&
                  'border-success/25 bg-success/10 text-success'
              )}
            >
              <item.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground block text-xs font-medium">
                {item.label}
              </span>
              <span className="text-foreground mt-1 block text-xl font-semibold tabular-nums">
                {item.value}
              </span>
              <span className="text-muted-foreground mt-1 block truncate text-xs">
                {item.detail}
              </span>
            </span>
            <ArrowRight className="text-muted-foreground group-hover:text-primary mt-1 size-4 shrink-0 transition-colors" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function DaybookTimeline({
  section,
}: {
  section: SaluSection<SaluBookingRow[]>;
}) {
  if (!section.ok) {
    return (
      <DaybookFrame>
        <div className="flex items-start gap-3 px-4 py-8 sm:px-5">
          <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-sm font-medium">
              Today’s appointments could not load.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Refresh in a moment.
            </p>
          </div>
        </div>
      </DaybookFrame>
    );
  }

  const bookings = section.data;
  const nowMinutes = minutesInSalon();
  const markerIndex = bookings.findIndex(
    (booking) => timeToMinutes(booking.appointment_time) >= nowMinutes
  );

  return (
    <DaybookFrame count={bookings.length}>
      {!bookings.length ? (
        <div className="px-4 py-10 text-center sm:px-5">
          <CalendarCheck2 className="text-muted-foreground/70 mx-auto size-6" />
          <p className="text-foreground mt-3 text-sm font-medium">
            The daybook is open.
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            No appointments are scheduled today.
          </p>
        </div>
      ) : (
        <ol className="relative">
          {bookings.map((booking, index) => (
            <li key={booking.booking_id}>
              {index === markerIndex ? <NowMarker /> : null}
              <AppointmentRow booking={booking} />
            </li>
          ))}
          {markerIndex === -1 ? (
            <li>
              <NowMarker complete />
            </li>
          ) : null}
        </ol>
      )}
    </DaybookFrame>
  );
}

function DaybookFrame({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <section
      id="today-daybook"
      aria-labelledby="daybook-title"
      className="ops-surface scroll-mt-4 overflow-hidden"
    >
      <div className="border-border flex items-end justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div>
          <p className="ops-eyebrow">Appointment ledger</p>
          <h2
            id="daybook-title"
            className="text-foreground mt-1 text-lg font-semibold tracking-tight"
          >
            Today’s daybook
          </h2>
        </div>
        {typeof count === 'number' ? (
          <Badge variant="outline" className="tabular-nums">
            {count} {count === 1 ? 'booking' : 'bookings'}
          </Badge>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function AppointmentRow({ booking }: { booking: SaluBookingRow }) {
  return (
    <div className="border-border/80 grid grid-cols-[4.75rem_minmax(0,1fr)] border-b last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
      <div className="border-border/80 text-muted-foreground relative border-r px-3 py-5 text-right text-sm font-semibold tabular-nums sm:px-4">
        {formatTime(booking.appointment_time)}
        <span className="bg-border absolute top-1/2 -right-1 size-2 -translate-y-1/2 rounded-full" />
      </div>
      <div className="min-w-0 px-4 py-4 sm:px-5">
        <p className="text-foreground truncate text-sm font-semibold">
          {booking.customer_name || compactPhone(booking.phone)}
        </p>
        <p className="text-muted-foreground mt-1 truncate text-sm">
          {serviceSummary(booking)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 sm:hidden">
          <BookingState booking={booking} />
        </div>
      </div>
      <div className="hidden items-center gap-2 px-4 py-4 sm:flex">
        <BookingState booking={booking} />
      </div>
    </div>
  );
}

function BookingState({ booking }: { booking: SaluBookingRow }) {
  const confirmed = booking.status === 'confirmed';
  const paid = booking.payment_status === 'paid';

  return (
    <>
      <Badge variant={confirmed ? 'success' : 'warning'} className="capitalize">
        {confirmed ? (
          <CheckCircle2 className="size-3" />
        ) : (
          <Clock3 className="size-3" />
        )}
        {booking.status || 'pending'}
      </Badge>
      <Badge variant={paid ? 'success' : 'outline'} className="capitalize">
        {booking.payment_status || 'no payment'}
      </Badge>
    </>
  );
}

function NowMarker({ complete = false }: { complete?: boolean }) {
  return (
    <div
      aria-label={`Current time ${formatLiveTime()}`}
      className="relative grid grid-cols-[4.75rem_minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)]"
    >
      <span className="text-primary border-primary/30 border-r px-3 py-2 text-right text-[10px] font-bold tracking-[0.12em] uppercase sm:px-4">
        Now
      </span>
      <span className="relative py-2 pl-4 text-xs">
        <span className="bg-primary absolute top-1/2 right-0 left-0 h-px" />
        <span className="bg-primary absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full shadow-[0_0_0_4px_var(--primary-soft)]" />
        <span className="bg-card text-primary relative px-2">
          {complete ? 'Shift schedule complete' : formatLiveTime()}
        </span>
      </span>
    </div>
  );
}

export function OperationalSummary({
  metrics,
}: {
  metrics: SaluSection<SaluMetrics>;
}) {
  const values = [
    ['Appointments', metrics.data.today_bookings.toLocaleString('en-IN')],
    ['Messages today', metrics.data.messages_today.toLocaleString('en-IN')],
    ['Paid today', formatPaise(metrics.data.paid_today_paise)],
    [
      'Customers · 7 days',
      metrics.data.customers_seen_7d.toLocaleString('en-IN'),
    ],
  ];

  return (
    <section
      aria-labelledby="summary-title"
      className="ops-surface overflow-hidden"
    >
      <div className="border-border border-b px-4 py-3 sm:px-5">
        <h2 id="summary-title" className="text-sm font-semibold">
          Shift totals
        </h2>
      </div>
      {!metrics.ok ? (
        <p className="text-muted-foreground px-4 py-5 text-sm sm:px-5">
          Totals could not be loaded.
        </p>
      ) : (
        <dl className="divide-border grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
          {values.map(([label, value]) => (
            <div key={label} className="px-4 py-4 sm:px-5">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-foreground mt-1 text-lg font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function serviceSummary(booking: SaluBookingRow) {
  return (
    booking.service_assignments_summary ||
    [
      booking.service_labels || booking.service_label || 'Service',
      booking.stylist_names || booking.stylist_name
        ? `with ${booking.stylist_names || booking.stylist_name}`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function findNextAppointment(bookings: SaluBookingRow[]) {
  const now = minutesInSalon();
  return bookings.find(
    (booking) => timeToMinutes(booking.appointment_time) >= now
  );
}

function timeToMinutes(value: string) {
  const [hours = '0', minutes = '0'] = String(value).split(':');
  return Number(hours) * 60 + Number(minutes);
}

function minutesInSalon() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SALON_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value || 0
  );
  return hour * 60 + minute;
}

function formatLiveTime() {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: SALON_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());
}

export function DaybookDate() {
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return formatDate(value);
}
