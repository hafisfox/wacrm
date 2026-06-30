"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  CreditCard,
  MessageSquareText,
  Phone,
  Search,
  UserRoundCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { compactPhone, formatDateTime } from "@/lib/salu/format";
import {
  customerIsIdle,
  formatOpsAge,
  matchesCustomerOpsFilter,
  matchesCustomerSearch,
  type CustomerOpsFilter,
} from "@/lib/salu/ops";
import { cn } from "@/lib/utils";
import type { SaluCustomerRow, SaluMetrics } from "@/lib/salu/queries";

interface ContactsClientProps {
  customers: SaluCustomerRow[];
  metrics: SaluMetrics;
}

const FILTERS: Array<{ value: CustomerOpsFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "handoff", label: "Handoff" },
  { value: "payment", label: "Payment" },
  { value: "booking", label: "Booking" },
  { value: "recent", label: "Recent" },
  { value: "idle", label: "Idle" },
];

export function ContactsClient({ customers, metrics }: ContactsClientProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerOpsFilter>("all");

  const filtered = useMemo(
    () =>
      customers.filter(
        (customer) =>
          matchesCustomerOpsFilter(customer, filter) &&
          matchesCustomerSearch(customer, search),
      ),
    [customers, filter, search],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Durable WhatsApp customer memory from the Salu booking concierge.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniStat label="7d seen" value={metrics.customers_seen_7d} />
          <MiniStat label="handoff" value={metrics.human_mode_sessions} />
          <MiniStat label="holds" value={metrics.pending_payment_holds} />
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, preference, or last message"
              className="border-slate-800 bg-slate-950 pl-9 text-slate-100"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "h-9 rounded-md border px-3 text-sm transition-colors",
                  filter === item.value
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {filtered.length.toLocaleString("en-IN")} of{" "}
          {customers.length.toLocaleString("en-IN")} customers
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_150px] gap-3 border-b border-slate-800 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 max-lg:hidden">
          <span>Customer</span>
          <span>Preference</span>
          <span>Current State</span>
          <span>Last Seen</span>
        </div>
        <div className="divide-y divide-slate-800">
          {filtered.map((customer) => (
            <CustomerRow key={customer.phone} customer={customer} />
          ))}
          {!filtered.length ? (
            <p className="px-4 py-8 text-sm text-slate-500">
              No customers match this view.
            </p>
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
            className="block truncate text-sm font-medium text-white hover:text-primary"
          >
            {displayName}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium text-white">
            {displayName}
          </p>
        )}
        <a
          href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary"
        >
          <Phone className="h-3 w-3" />
          {compactPhone(customer.phone)}
        </a>
      </div>

      <div className="min-w-0 text-sm text-slate-400">
        <p className="truncate">
          {customer.preferred_services_summary || "No service preference"}
        </p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {customer.preferred_stylist_name || "No stylist preference"}
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
            className="max-w-full truncate border-slate-700 bg-slate-800 text-slate-300"
          >
            {customer.last_intent}
          </Badge>
        ) : null}
        {customer.conversation_id ? (
          <Link
            href={`/inbox?conversation=${customer.conversation_id}`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:border-primary/50 hover:text-white"
          >
            <MessageSquareText className="h-3 w-3" />
            open chat
          </Link>
        ) : null}
        {idle ? <span className="text-sm text-slate-500">Idle</span> : null}
      </div>

      <div className="text-sm text-slate-500">
        {customer.last_seen_at ? (
          <>
            <span className="block text-slate-400">
              {formatOpsAge(customer.last_seen_at)}
            </span>
            <span>{formatDateTime(customer.last_seen_at)}</span>
          </>
        ) : (
          "Not seen"
        )}
      </div>

      {customer.last_customer_message || customer.profile_summary ? (
        <div className="min-w-0 lg:col-span-4">
          <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
            <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
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
  tone: "good" | "warn" | "danger";
  icon: typeof CalendarClock;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-300",
        tone === "danger" && "border-red-500/30 bg-red-500/10 text-red-300",
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </Badge>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums text-white">
        {value.toLocaleString("en-IN")}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
