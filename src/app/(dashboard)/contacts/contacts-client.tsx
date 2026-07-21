'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  CalendarClock,
  CreditCard,
  MessageSquareText,
  Phone,
  Search,
  UserRoundCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AutoRefresh } from '@/components/layout/auto-refresh';
import { compactPhone, formatDateTime } from '@/lib/salu/format';
import {
  customerIsIdle,
  formatOpsAge,
  matchesCustomerOpsFilter,
  matchesCustomerSearch,
  type CustomerOpsFilter,
} from '@/lib/salu/ops';
import { cn } from '@/lib/utils';
import type { SaluCustomerRow, SaluMetrics } from '@/lib/salu/queries';

interface ContactsClientProps {
  customers: SaluCustomerRow[];
  metrics: SaluMetrics;
  /** True profile count, which may exceed the rows loaded. */
  total: number;
}

const FILTERS: Array<{ value: CustomerOpsFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'handoff', label: 'Handoff' },
  { value: 'payment', label: 'Payment' },
  { value: 'booking', label: 'Booking' },
  { value: 'recent', label: 'Recent' },
  { value: 'idle', label: 'Idle' },
];

export function ContactsClient({
  customers,
  metrics,
  total,
}: ContactsClientProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CustomerOpsFilter>('all');

  const filtered = useMemo(
    () =>
      customers.filter(
        (customer) =>
          matchesCustomerOpsFilter(customer, filter) &&
          matchesCustomerSearch(customer, search)
      ),
    [customers, filter, search]
  );

  return (
    <div className="ops-page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="ops-eyebrow">Customer memory</p>
          <h1 className="text-foreground text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Durable WhatsApp customer memory from the Salu booking concierge.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AutoRefresh />
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="7d seen" value={metrics.customers_seen_7d} />
            <MiniStat label="handoff" value={metrics.human_mode_sessions} />
            <MiniStat label="holds" value={metrics.pending_payment_holds} />
          </div>
        </div>
      </div>

      <section className="ops-surface p-3" aria-label="Customer filters">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, preference, or last message"
              className="border-border bg-background text-foreground pl-9"
            />
          </div>
          <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={cn(
                  'ops-focus-ring h-10 shrink-0 rounded-md border px-3 text-sm transition-colors',
                  filter === item.value
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-border hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-xs" aria-live="polite">
          {filtered.length.toLocaleString('en-IN')} of{' '}
          {customers.length.toLocaleString('en-IN')} customers
          {total > customers.length ? (
            <>
              {' '}
              · showing the {customers.length.toLocaleString('en-IN')} most
              recent of {total.toLocaleString('en-IN')} total
            </>
          ) : null}
        </p>
      </section>

      <section className="ops-surface overflow-hidden">
        <div className="border-border text-muted-foreground grid grid-cols-[1.2fr_1fr_1fr_150px] gap-3 border-b px-4 py-3 text-xs font-medium tracking-wide uppercase max-lg:hidden">
          <span>Customer</span>
          <span>Preference</span>
          <span>Current State</span>
          <span>Last Seen</span>
        </div>
        <div className="divide-border divide-y">
          {filtered.map((customer) => (
            <CustomerRow key={customer.phone} customer={customer} />
          ))}
          {!filtered.length ? (
            <div className="px-4 py-10 text-center">
              <p className="text-foreground/80 text-sm font-medium">
                No customers match this view
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Try clearing the search or choosing another queue.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function CustomerRow({ customer }: { customer: SaluCustomerRow }) {
  const idle = customerIsIdle(customer);
  const displayName = customer.customer_name || compactPhone(customer.phone);

  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_1fr_1fr_150px] lg:items-center">
      <div className="min-w-0">
        {customer.conversation_id ? (
          <Link
            href={`/inbox?conversation=${customer.conversation_id}`}
            className="ops-focus-ring hover:text-primary text-foreground block truncate rounded-sm text-sm font-medium"
          >
            {displayName}
          </Link>
        ) : (
          <p className="text-foreground truncate text-sm font-medium">
            {displayName}
          </p>
        )}
        <a
          href={`https://wa.me/${customer.phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="ops-focus-ring hover:text-primary text-muted-foreground mt-1 inline-flex items-center gap-1 rounded-sm text-xs"
        >
          <Phone className="h-3 w-3" />
          {compactPhone(customer.phone)}
        </a>
      </div>

      <div className="text-muted-foreground min-w-0 text-sm">
        <p className="truncate">
          {customer.preferred_services_summary || 'No service preference'}
        </p>
        <p className="text-muted-foreground mt-1 truncate text-xs">
          {customer.preferred_stylist_name || 'No stylist preference'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {customer.human_mode ? (
          <StateBadge tone="danger" icon={UserRoundCheck}>
            handoff
          </StateBadge>
        ) : null}
        {customer.pending_payment_reference_id ? (
          <StateBadge tone="warn" icon={CreditCard}>
            payment
          </StateBadge>
        ) : null}
        {customer.pending_booking_id || customer.active_booking_id ? (
          <StateBadge tone="good" icon={CalendarClock}>
            booking
          </StateBadge>
        ) : null}
        {customer.last_intent ? (
          <Badge
            variant="outline"
            className="border-border bg-muted text-foreground/80 max-w-full truncate"
          >
            {customer.last_intent}
          </Badge>
        ) : null}
        {customer.conversation_id ? (
          <Link
            href={`/inbox?conversation=${customer.conversation_id}`}
            className="ops-focus-ring hover:border-primary/50 border-border bg-muted text-foreground/80 hover:text-foreground inline-flex min-h-8 items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
          >
            <MessageSquareText className="h-3 w-3" />
            open chat
          </Link>
        ) : null}
        {idle ? (
          <span className="text-muted-foreground text-sm">Idle</span>
        ) : null}
      </div>

      <div className="text-muted-foreground text-sm">
        {customer.last_seen_at ? (
          <>
            <span className="text-muted-foreground block">
              {formatOpsAge(customer.last_seen_at)}
            </span>
            <span>{formatDateTime(customer.last_seen_at)}</span>
          </>
        ) : (
          'Not seen'
        )}
      </div>

      {customer.last_customer_message || customer.profile_summary ? (
        <div className="min-w-0 lg:col-span-4">
          <div className="border-border bg-background/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-xs">
            <MessageSquareText className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="line-clamp-2">
              {customer.last_customer_message || customer.profile_summary}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StateBadge({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'good' | 'warn' | 'danger';
  icon: typeof CalendarClock;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1',
        tone === 'good' &&
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'danger' && 'border-red-500/30 bg-red-500/10 text-red-300'
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </Badge>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border bg-card rounded-lg border px-3 py-2">
      <p className="text-foreground text-lg font-semibold tabular-nums">
        {value.toLocaleString('en-IN')}
      </p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
