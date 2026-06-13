"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import type { SaluCustomerDetails } from "@/lib/salu/crm";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  CalendarClock,
  CreditCard,
  Loader2,
  PauseCircle,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface ContactSidebarProps {
  contact: Contact | null;
  refreshToken?: number;
  onTakeoverChange?: () => void;
}

function formatMaybeDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "MMM d, HH:mm");
}

function formatMoney(paise?: number | null) {
  const value = Number(paise || 0) / 100;
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  });
}

function bookingTitle(details: SaluCustomerDetails | null) {
  const booking = details?.active_booking;
  if (!booking) return "";
  return (
    booking.service_assignments_summary ||
    booking.service_labels ||
    booking.service_label ||
    "Booking"
  );
}

export function ContactSidebar({
  contact,
  refreshToken = 0,
  onTakeoverChange,
}: ContactSidebarProps) {
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [saluDetails, setSaluDetails] = useState<SaluCustomerDetails | null>(
    null,
  );
  const [saluLoading, setSaluLoading] = useState(false);
  const [takeoverSaving, setTakeoverSaving] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  useEffect(() => {
    if (!contact?.phone) {
      setSaluDetails(null);
      return;
    }

    let cancelled = false;
    setSaluLoading(true);

    fetch(`/api/salu/customer?phone=${encodeURIComponent(contact.phone)}`)
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        return payload.details as SaluCustomerDetails;
      })
      .then((details) => {
        if (!cancelled) setSaluDetails(details);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[contact-sidebar] Salu details failed:", err);
        setSaluDetails(null);
      })
      .finally(() => {
        if (!cancelled) setSaluLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contact, refreshToken]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const handleTakeoverToggle = useCallback(
    async (humanMode: boolean) => {
      if (!contact?.phone || takeoverSaving) return;
      setTakeoverSaving(true);
      try {
        const res = await fetch("/api/salu/takeover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: contact.phone,
            human_mode: humanMode,
            reason: humanMode ? "dashboard_pause_bot" : "dashboard_resume_bot",
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
        setSaluDetails(payload.details as SaluCustomerDetails);
        onTakeoverChange?.();
        toast.success(humanMode ? "Bot paused for this customer" : "Bot resumed");
      } catch (err) {
        const reason = err instanceof Error ? err.message : "request failed";
        toast.error(`Could not update bot state: ${reason}`);
      } finally {
        setTakeoverSaving(false);
      }
    },
    [contact, onTakeoverChange, takeoverSaving],
  );

  if (!contact) {
    return (
      <div className="flex h-full w-80 items-center justify-center border-l border-[#233138] bg-[#111b21]">
        <p className="text-sm text-[#8696a0]">Select a conversation</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();
  const humanMode = saluDetails?.session?.human_mode ?? false;
  const activeBooking = saluDetails?.active_booking ?? null;
  const pendingPayment = saluDetails?.pending_payment ?? null;
  const profile = saluDetails?.profile ?? null;
  const session = saluDetails?.session ?? null;

  return (
    <div className="flex h-full w-80 flex-col border-l border-[#233138] bg-[#111b21]">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2a3942] text-lg font-semibold text-[#e9edef]">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-[#e9edef]">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-[#8696a0]">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#d1d7db] transition-colors hover:bg-[#202c33]"
            >
              <Phone className="h-4 w-4 text-[#8696a0]" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-[#00a884]" />
              ) : (
                <Copy className="h-3 w-3 text-[#667781]" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#d1d7db]">
                <Mail className="h-4 w-4 text-[#8696a0]" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-[#233138]" />

          {/* Salu CRM */}
          <div>
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#8696a0]">
                <Sparkles className="h-3 w-3" />
                Salu
              </div>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  humanMode
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                    : "border-[#00a884]/30 bg-[#00a884]/10 text-[#00a884]",
                )}
              >
                {humanMode ? "human mode" : "bot active"}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={takeoverSaving || saluLoading}
                onClick={() => handleTakeoverToggle(!humanMode)}
                className={cn(
                  "h-9 w-full border-[#2a3942] bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]",
                  humanMode && "border-[#00a884]/40 text-[#00a884]",
                )}
              >
                {takeoverSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : humanMode ? (
                  <PlayCircle className="mr-2 h-4 w-4" />
                ) : (
                  <PauseCircle className="mr-2 h-4 w-4" />
                )}
                {humanMode ? "Resume bot" : "Pause bot"}
              </Button>

              {saluLoading ? (
                <div className="flex items-center gap-2 rounded-lg bg-[#202c33] px-3 py-3 text-xs text-[#8696a0]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading Salu details
                </div>
              ) : (
                <>
                  <div className="rounded-lg bg-[#202c33] px-3 py-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#aebac1]">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Active Booking
                    </div>
                    {activeBooking ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <p className="font-medium text-[#e9edef]">
                          {bookingTitle(saluDetails)}
                        </p>
                        <p className="text-[#d1d7db]">
                          {activeBooking.appointment_date} at {activeBooking.appointment_time}
                        </p>
                        <p className="text-[#8696a0]">
                          {activeBooking.status} · {activeBooking.payment_status || "payment"}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[#8696a0]">
                        No active or upcoming booking.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg bg-[#202c33] px-3 py-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#aebac1]">
                      <CreditCard className="h-3.5 w-3.5" />
                      Pending Payment
                    </div>
                    {pendingPayment ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <p className="font-medium text-[#e9edef]">
                          {formatMoney(pendingPayment.amount_paise)}
                        </p>
                        <p className="truncate text-[#d1d7db]">
                          {pendingPayment.reference_id}
                        </p>
                        <p className="text-[#8696a0]">
                          {pendingPayment.expires_at
                            ? `Expires ${formatMaybeDate(pendingPayment.expires_at)}`
                            : pendingPayment.status}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[#8696a0]">
                        No pending payment.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg bg-[#202c33] px-3 py-3">
                    <p className="text-xs font-medium text-[#aebac1]">
                      Memory
                    </p>
                    <p className="mt-2 line-clamp-4 text-xs leading-5 text-[#d1d7db]">
                      {profile?.profile_summary ||
                        session?.summary ||
                        "No saved preference summary yet."}
                    </p>
                    <div className="mt-2 space-y-1 text-[11px] text-[#8696a0]">
                      {profile?.preferred_services_summary ? (
                        <p>Services: {profile.preferred_services_summary}</p>
                      ) : null}
                      {profile?.preferred_stylist_name ? (
                        <p>Stylist: {profile.preferred_stylist_name}</p>
                      ) : null}
                      {(profile?.last_intent || session?.last_intent) ? (
                        <p>Last intent: {profile?.last_intent || session?.last_intent}</p>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-[#233138]" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-[#8696a0]">
              <TagIcon className="h-3 w-3" />
              Tags
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-[#667781]">No tags</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-[#233138]" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-[#8696a0]">
              <DollarSign className="h-3 w-3" />
              Active Deals
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-[#667781]">No deals</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-[#202c33] px-3 py-2"
                  >
                    <p className="text-sm font-medium text-[#e9edef]">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-[#8696a0]">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-[#233138]" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-[#8696a0]">
              <StickyNote className="h-3 w-3" />
              Notes
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-[#2a3942] bg-[#202c33] px-3 py-2 text-xs text-[#e9edef] placeholder-[#8696a0] outline-none focus:border-[#00a884]/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-[#00a884] px-2 text-[#111b21] hover:bg-[#06cf9c]"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-[#202c33] px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-[#d1d7db]">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-[#667781]">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
