'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { Contact, ContactNote } from '@/types';
import type { SaluCustomerDetails } from '@/lib/salu/crm';
import {
  Phone,
  Mail,
  Copy,
  Check,
  StickyNote,
  Plus,
  CalendarClock,
  CreditCard,
  ExternalLink,
  History,
  Loader2,
  PauseCircle,
  ReceiptText,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatOpsAge, formatOpsCountdown } from '@/lib/salu/ops';
import { format } from 'date-fns';
import { fetchWithTimeout } from '@/lib/http';

interface ContactSidebarProps {
  contact: Contact | null;
  refreshToken?: number;
}

function formatMaybeDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'MMM d, HH:mm');
}

function formatMoney(paise?: number | null) {
  const value = Number(paise || 0) / 100;
  return value.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  });
}

function bookingTitle(details: SaluCustomerDetails | null) {
  const booking = details?.active_booking;
  if (!booking) return '';
  return (
    booking.service_assignments_summary ||
    booking.service_labels ||
    booking.service_label ||
    'Booking'
  );
}

export function ContactSidebar({
  contact,
  refreshToken = 0,
}: ContactSidebarProps) {
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [copiedPayment, setCopiedPayment] = useState(false);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [saluDetails, setSaluDetails] = useState<SaluCustomerDetails | null>(
    null
  );
  const [detailsPhone, setDetailsPhone] = useState<string | null>(null);
  // Only expose the details that belong to the currently selected contact.
  // This prevents the prior customer's booking or payment state flashing
  // while the next request is in flight.
  const customerDetails = detailsPhone === contact?.phone ? saluDetails : null;
  const saluLoading = Boolean(contact?.phone && detailsPhone !== contact.phone);

  // Load notes when the selected customer changes. The update happens from
  // Supabase's async completion, which also lets us ignore a late response
  // for the conversation the operator has already left.
  useEffect(() => {
    if (!contact?.id) return;
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled && data) setNotes(data);
      });

    return () => {
      cancelled = true;
    };
  }, [contact?.id]);

  useEffect(() => {
    if (!contact?.phone) {
      return;
    }

    const phone = contact.phone;
    let cancelled = false;

    fetchWithTimeout(`/api/salu/customer?phone=${encodeURIComponent(phone)}`)
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        return payload.details as SaluCustomerDetails;
      })
      .then((details) => {
        if (cancelled) return;
        setSaluDetails(details);
        setDetailsPhone(phone);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[contact-sidebar] Salu details failed:', err);
        setSaluDetails(null);
        setDetailsPhone(phone);
      });

    return () => {
      cancelled = true;
    };
  }, [contact?.phone, refreshToken]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleCopyPaymentLink = useCallback(async () => {
    const link = customerDetails?.pending_payment?.payment_link;
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiedPayment(true);
    setTimeout(() => setCopiedPayment(false), 2000);
  }, [customerDetails?.pending_payment?.payment_link]);

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
      .from('contact_notes')
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    // A swallowed failure here looked like success: the textarea kept
    // the text but the note never appeared and nothing said why.
    if (error || !data) {
      console.error('[contact-sidebar] add note failed:', error);
      toast.error('Could not save note. Please try again.');
      setAddingNote(false);
      return;
    }

    setNotes((prev) => [data, ...prev]);
    setNewNote('');
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="border-chat-line bg-chat-panel flex h-full w-80 items-center justify-center border-l">
        <p className="text-chat-muted text-sm">Select a conversation</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();
  const humanMode = customerDetails?.session?.human_mode ?? false;
  const activeBooking = customerDetails?.active_booking ?? null;
  const pendingPayment = customerDetails?.pending_payment ?? null;
  const profile = customerDetails?.profile ?? null;
  const session = customerDetails?.session ?? null;
  const recentBookings =
    customerDetails?.bookings
      ?.filter((booking) => booking.booking_id !== activeBooking?.booking_id)
      .slice(0, 3) ?? [];
  const recentPayments =
    customerDetails?.payments
      ?.filter(
        (payment) => payment.reference_id !== pendingPayment?.reference_id
      )
      .slice(0, 3) ?? [];
  const whatsappHref = `https://wa.me/${contact.phone.replace(/\D/g, '')}`;

  return (
    <div className="border-chat-line bg-chat-panel flex h-full w-80 flex-col border-l">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="bg-chat-surface-strong text-chat-ink flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold">
              {contact.avatar_url ? (
                <Image
                  src={contact.avatar_url}
                  alt={displayName}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="text-chat-ink mt-3 text-sm font-semibold">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-chat-muted text-xs">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="text-chat-ink-2 hover:bg-chat-surface flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
            >
              <Phone className="text-chat-muted h-4 w-4" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="text-chat-accent h-3 w-3" />
              ) : (
                <Copy className="text-chat-dim h-3 w-3" />
              )}
            </button>

            {contact.email && (
              <div className="text-chat-ink-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                <Mail className="text-chat-muted h-4 w-4" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-chat-line my-4 border-t" />

          {/* Customer details */}
          <div>
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="text-chat-muted flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
                <Sparkles className="h-3 w-3" />
                Customer details
              </div>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  humanMode
                    ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                    : 'border-chat-accent/30 bg-chat-accent/10 text-chat-accent'
                )}
              >
                {humanMode ? 'you’re handling this' : 'automatic replies on'}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  render={
                    <a href={whatsappHref} target="_blank" rel="noreferrer" />
                  }
                  className="border-chat-surface-strong bg-chat-surface text-chat-ink hover:bg-chat-surface-strong min-h-11"
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  WhatsApp
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!pendingPayment?.payment_link}
                  onClick={handleCopyPaymentLink}
                  className="border-chat-surface-strong bg-chat-surface text-chat-ink hover:bg-chat-surface-strong min-h-11"
                >
                  {copiedPayment ? (
                    <Check className="text-chat-accent mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Copy className="mr-1 h-3.5 w-3.5" />
                  )}
                  Pay link
                </Button>
              </div>

              {saluLoading ? (
                <div className="bg-chat-surface text-chat-muted flex items-center gap-2 rounded-lg px-3 py-3 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading Salu details
                </div>
              ) : (
                <>
                  {humanMode ? (
                    <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-amber-100">
                        <PauseCircle className="h-3.5 w-3.5" />
                        Needs your reply
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-amber-100/90">
                        <p>You are handling this conversation.</p>
                        {session?.handoff_started_at ? (
                          <p className="text-amber-100/70">
                            Started {formatOpsAge(session.handoff_started_at)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="bg-chat-surface rounded-lg px-3 py-3">
                    <div className="text-chat-ink-3 flex items-center gap-2 text-xs font-medium">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Active Booking
                    </div>
                    {activeBooking ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <p className="text-chat-ink font-medium">
                          {bookingTitle(customerDetails)}
                        </p>
                        <p className="text-chat-ink-2">
                          {activeBooking.appointment_date} at{' '}
                          {activeBooking.appointment_time}
                        </p>
                        {activeBooking.stylist_names ||
                        activeBooking.stylist_name ? (
                          <p className="text-chat-muted">
                            With{' '}
                            {activeBooking.stylist_names ||
                              activeBooking.stylist_name}
                          </p>
                        ) : null}
                        <p className="text-chat-muted">
                          {activeBooking.status} ·{' '}
                          {activeBooking.payment_status || 'payment'} ·{' '}
                          {formatMoney(activeBooking.total_paise)}
                        </p>
                        {activeBooking.hold_expires_at ? (
                          <p className="text-amber-200">
                            Hold{' '}
                            {formatOpsCountdown(activeBooking.hold_expires_at)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-chat-muted mt-2 text-xs">
                        No active or upcoming booking.
                      </p>
                    )}
                  </div>

                  <div className="bg-chat-surface rounded-lg px-3 py-3">
                    <div className="text-chat-ink-3 flex items-center gap-2 text-xs font-medium">
                      <CreditCard className="h-3.5 w-3.5" />
                      Pending Payment
                    </div>
                    {pendingPayment ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <p className="text-chat-ink font-medium">
                          {formatMoney(pendingPayment.amount_paise)}
                        </p>
                        <p className="text-chat-ink-2 truncate">
                          {pendingPayment.reference_id}
                        </p>
                        <p className="text-chat-muted">
                          {pendingPayment.expires_at
                            ? `${formatOpsCountdown(pendingPayment.expires_at)} · ${formatMaybeDate(pendingPayment.expires_at)}`
                            : pendingPayment.status}
                        </p>
                        {pendingPayment.payment_link ? (
                          <a
                            href={pendingPayment.payment_link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-chat-accent hover:text-chat-accent-hover inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open payment link
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-chat-muted mt-2 text-xs">
                        No pending payment.
                      </p>
                    )}
                  </div>

                  <div className="bg-chat-surface rounded-lg px-3 py-3">
                    <p className="text-chat-ink-3 text-xs font-medium">
                      Memory
                    </p>
                    <p className="text-chat-ink-2 mt-2 line-clamp-4 text-xs leading-5">
                      {profile?.profile_summary ||
                        session?.summary ||
                        'No saved preference summary yet.'}
                    </p>
                    <div className="text-chat-muted mt-2 space-y-1 text-[11px]">
                      {profile?.preferred_services_summary ? (
                        <p>Services: {profile.preferred_services_summary}</p>
                      ) : null}
                      {profile?.preferred_stylist_name ? (
                        <p>Stylist: {profile.preferred_stylist_name}</p>
                      ) : null}
                      {profile?.last_intent || session?.last_intent ? (
                        <p>
                          Last intent:{' '}
                          {profile?.last_intent || session?.last_intent}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {recentBookings.length || recentPayments.length ? (
                    <div className="bg-chat-surface rounded-lg px-3 py-3">
                      <div className="text-chat-ink-3 flex items-center gap-2 text-xs font-medium">
                        <History className="h-3.5 w-3.5" />
                        Recent History
                      </div>
                      <div className="mt-2 space-y-2 text-xs">
                        {recentBookings.map((booking) => (
                          <div
                            key={booking.booking_id}
                            className="bg-chat-panel rounded-md px-2 py-2"
                          >
                            <p className="text-chat-ink truncate font-medium">
                              {booking.service_assignments_summary ||
                                booking.service_labels ||
                                booking.service_label ||
                                'Booking'}
                            </p>
                            <p className="text-chat-muted mt-0.5">
                              {booking.appointment_date} at{' '}
                              {booking.appointment_time} · {booking.status}
                            </p>
                          </div>
                        ))}
                        {recentPayments.map((payment) => (
                          <div
                            key={payment.reference_id}
                            className="bg-chat-panel rounded-md px-2 py-2"
                          >
                            <div className="text-chat-ink flex items-center gap-2 font-medium">
                              <ReceiptText className="text-chat-muted h-3.5 w-3.5" />
                              {formatMoney(payment.amount_paise)}
                            </div>
                            <p className="text-chat-muted mt-0.5 truncate">
                              {payment.status} · {payment.reference_id}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-chat-line my-4 border-t" />

          {/* Notes */}
          <div>
            <div className="text-chat-muted flex items-center gap-2 px-1 text-xs font-medium tracking-wider uppercase">
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
                  className="border-chat-surface-strong bg-chat-surface text-chat-ink placeholder-chat-muted focus:border-chat-accent/50 flex-1 resize-none rounded-lg border px-3 py-2 text-xs outline-none"
                />
                <Button
                  size="sm"
                  className="bg-chat-accent text-chat-panel hover:bg-chat-accent-hover min-h-11 min-w-11 px-2"
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
                    className="bg-chat-surface rounded-lg px-3 py-2"
                  >
                    <p className="text-chat-ink-2 text-xs whitespace-pre-wrap">
                      {note.note_text}
                    </p>
                    <p className="text-chat-dim mt-1 text-[10px]">
                      {format(new Date(note.created_at), 'MMM d, yyyy HH:mm')}
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
