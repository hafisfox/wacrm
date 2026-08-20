'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  CalendarClock,
  CreditCard,
  MessageSquareText,
  Phone,
  Search,
  SearchX,
  UserRoundCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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
  { value: 'handoff', label: 'Needs reply' },
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
  const hasFilters = filter !== 'all' || Boolean(search.trim());

  return (
    <div className="ops-page">
      <header className="ops-page-header">
        <div>
          <h1 className="ops-page-heading">Customers</h1>
          <p className="ops-page-description">
            Find customer details, preferences, and recent messages.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <AutoRefresh />
          <dl
            className="border-border bg-card grid grid-cols-3 divide-x overflow-hidden rounded-lg border text-center"
            aria-label="Customer work waiting today"
          >
            <MiniStat label="needs reply" value={metrics.human_mode_sessions} />
            <MiniStat label="holds" value={metrics.pending_payment_holds} />
            <MiniStat label="today" value={metrics.today_bookings} />
          </dl>
        </div>
      </header>

      <section className="ops-surface p-3" aria-label="Customer filters">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <label htmlFor="customer-search" className="sr-only">
              Search customers
            </label>
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="customer-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, preference, or last message"
              className="border-border bg-background text-foreground h-11 pl-9"
            />
          </div>
          <div
            className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Filter customers by current state"
          >
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={cn(
                  'ops-focus-ring h-11 shrink-0 rounded-md border px-3 text-sm transition-colors',
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
        <div className="divide-border lg:divide-y">
          {filtered.map((customer) => (
            <CustomerRow key={customer.phone} customer={customer} />
          ))}
          {!filtered.length ? (
            <EmptyState
              icon={SearchX}
              title={
                hasFilters ? 'No customers match this view' : 'No customers yet'
              }
              description={
                hasFilters
                  ? 'Clear the search and filters to return to all customers.'
                  : 'Customer profiles will appear here after the first conversation.'
              }
              action={
                hasFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setFilter('all');
                    }}
                  >
                    Clear search and filters
                  </Button>
                ) : undefined
              }
            />
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
    <div className="border-border bg-background/30 m-2 grid gap-3 rounded-xl border p-4 lg:m-0 lg:grid-cols-[1.2fr_1fr_1fr_150px] lg:items-center lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-4">
      <div className="min-w-0">
        <p className="text-foreground truncate text-sm font-medium">
          {displayName}
        </p>
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
        <p className="text-foreground/70 mb-1 text-xs font-medium lg:hidden">
          Preferences
        </p>
        <p className="truncate">
          {customer.preferred_services_summary || 'No service preference'}
        </p>
        <p className="text-muted-foreground mt-1 truncate text-xs">
          {customer.preferred_stylist_name || 'No stylist preference'}
        </p>
      </div>

      <div>
        <p className="text-foreground/70 mb-2 text-xs font-medium lg:hidden">
          Current state
        </p>
        <div className="flex flex-wrap gap-2">
          {customer.human_mode ? (
            <StateBadge tone="danger" icon={UserRoundCheck}>
              needs reply
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
              className="ops-focus-ring hover:border-primary/50 border-border bg-muted text-foreground/80 hover:text-foreground inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-xs lg:min-h-8 lg:px-2 lg:py-0.5"
            >
              <MessageSquareText className="h-3 w-3" />
              Open conversation
            </Link>
          ) : null}
          {idle ? (
            <span className="text-muted-foreground text-sm">Idle</span>
          ) : null}
        </div>
      </div>

      <div className="text-muted-foreground text-sm">
        <p className="text-foreground/70 mb-1 text-xs font-medium lg:hidden">
          Last seen
        </p>
        {customer.last_seen_at ? (
          <>
            <span className="text-muted-foreground block">
              {formatOpsAge(customer.last_seen_at)}
            </span>
            <span className="hidden lg:inline">
              {formatDateTime(customer.last_seen_at)}
            </span>
          </>
        ) : (
          'Not seen'
        )}
      </div>

      {customer.last_customer_message || customer.profile_summary ? (
        <div className="border-border text-muted-foreground flex min-w-0 items-start gap-2 border-t pt-3 text-xs lg:col-span-4">
          <MessageSquareText className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="line-clamp-2">
            {customer.last_customer_message || customer.profile_summary}
          </p>
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
      variant={
        tone === 'good'
          ? 'success'
          : tone === 'warn'
            ? 'warning'
            : 'destructive'
      }
      className="gap-1"
    >
      <Icon className="h-3 w-3" />
      {children}
    </Badge>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-lg font-semibold tabular-nums">
        {value.toLocaleString('en-IN')}
      </dd>
    </div>
  );
}
