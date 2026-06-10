import { MessageCircle, Phone, UserRoundCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { compactPhone, formatDateTime } from "@/lib/salu/format";
import { loadSaluInbox } from "@/lib/salu/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { threads, messages } = await loadSaluInbox();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">WhatsApp Inbox</h1>
        <p className="mt-1 text-sm text-slate-400">
          Customer threads and recent n8n WhatsApp events for the Salu number.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
        <section className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Threads</h2>
            <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
              {threads.length}
            </Badge>
          </div>
          <div className="max-h-[calc(100vh-230px)] divide-y divide-slate-800 overflow-y-auto">
            {threads.map((thread) => (
              <a
                key={thread.phone}
                href={`https://wa.me/${thread.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="block p-4 transition-colors hover:bg-slate-800/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">
                        {thread.customer_name || compactPhone(thread.phone)}
                      </p>
                      {thread.human_mode ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 text-amber-300"
                        >
                          human
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {thread.raw_text || thread.summary || thread.intent || "No message text"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDateTime(thread.created_at)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Phone className="h-3 w-3" />
                    {compactPhone(thread.phone)}
                  </span>
                  {thread.pending_action ? (
                    <span className="text-amber-300">{thread.pending_action}</span>
                  ) : null}
                  {thread.pending_payment_reference_id ? (
                    <span className="text-slate-500">{thread.pending_payment_reference_id}</span>
                  ) : null}
                </div>
              </a>
            ))}
            {!threads.length ? (
              <p className="p-4 text-sm text-slate-500">No WhatsApp threads yet.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Recent Events</h2>
            <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
              live log
            </Badge>
          </div>
          <div className="max-h-[calc(100vh-230px)] divide-y divide-slate-800 overflow-y-auto p-4">
            {messages.map((message) => (
              <div key={message.event_id} className="grid gap-3 py-3 sm:grid-cols-[150px_1fr_auto]">
                <span className="text-xs text-slate-500">{formatDateTime(message.created_at)}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 shrink-0 text-slate-500" />
                    <p className="truncate text-sm text-white">
                      {message.raw_text || message.summary || message.intent || message.event_type}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {compactPhone(message.phone)} · {message.route || "route"} · {message.intent || "intent"}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex h-6 items-center justify-center rounded-full border px-2 text-xs",
                    message.status === "processed"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-700 bg-slate-800 text-slate-300",
                  )}
                >
                  {message.event_type}
                </span>
              </div>
            ))}
            {!messages.length ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <UserRoundCheck className="h-4 w-4" />
                No message events recorded yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
