import { CalendarClock, CreditCard, MessageSquareText, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { compactPhone, formatDateTime } from "@/lib/salu/format";
import { loadSaluCustomersPage } from "@/lib/salu/queries";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { customers, metrics } = await loadSaluCustomersPage();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Durable WhatsApp customer memory from the Salu booking automation.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniStat label="7d seen" value={metrics.customers_seen_7d} />
          <MiniStat label="handoff" value={metrics.human_mode_sessions} />
          <MiniStat label="holds" value={metrics.pending_payment_holds} />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_120px] gap-3 border-b border-slate-800 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 max-lg:hidden">
          <span>Customer</span>
          <span>Preference</span>
          <span>Current State</span>
          <span>Last Seen</span>
        </div>
        <div className="divide-y divide-slate-800">
          {customers.map((customer) => (
            <div
              key={customer.phone}
              className="grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_1fr_1fr_120px] lg:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {customer.customer_name || compactPhone(customer.phone)}
                </p>
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
                {customer.pending_payment_reference_id ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-300"
                  >
                    <CreditCard className="h-3 w-3" />
                    payment
                  </Badge>
                ) : null}
                {customer.pending_booking_id || customer.active_booking_id ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  >
                    <CalendarClock className="h-3 w-3" />
                    booking
                  </Badge>
                ) : null}
                {customer.last_intent ? (
                  <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
                    {customer.last_intent}
                  </Badge>
                ) : null}
                {!customer.pending_payment_reference_id &&
                !customer.pending_booking_id &&
                !customer.active_booking_id &&
                !customer.last_intent ? (
                  <span className="text-sm text-slate-500">Idle</span>
                ) : null}
              </div>

              <div className="text-sm text-slate-500">
                {customer.last_seen_at ? formatDateTime(customer.last_seen_at) : "Not seen"}
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
          ))}
          {!customers.length ? (
            <p className="px-4 py-8 text-sm text-slate-500">No customer profiles yet.</p>
          ) : null}
        </div>
      </section>
    </div>
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
