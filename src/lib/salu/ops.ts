export type OpsTone = 'good' | 'neutral' | 'warn' | 'danger';

export type CustomerOpsFilter =
  | 'all'
  | 'handoff'
  | 'payment'
  | 'booking'
  | 'idle'
  | 'recent';

interface DateLikeOptions {
  now?: Date;
}

export interface PaymentQueueLike {
  status?: string | null;
  payment_status?: string | null;
  payment_status_row?: string | null;
  expires_at?: string | null;
  hold_expires_at?: string | null;
}

export interface CustomerMemoryLike {
  customer_name?: string | null;
  phone?: string | null;
  preferred_services_summary?: string | null;
  preferred_stylist_name?: string | null;
  profile_summary?: string | null;
  last_customer_message?: string | null;
  last_intent?: string | null;
  last_seen_at?: string | null;
  human_mode?: boolean | null;
  pending_payment_reference_id?: string | null;
  pending_booking_id?: string | null;
  active_booking_id?: string | null;
  conversation_id?: string | null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function durationLabel(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  return `${months}mo`;
}

export function formatOpsAge(
  value: string | null | undefined,
  { now = new Date() }: DateLikeOptions = {}
) {
  const date = parseDate(value);
  if (!date) return 'not recorded';
  return `${durationLabel(now.getTime() - date.getTime())} ago`;
}

export function formatOpsCountdown(
  value: string | null | undefined,
  { now = new Date() }: DateLikeOptions = {}
) {
  const date = parseDate(value);
  if (!date) return '';
  const diff = date.getTime() - now.getTime();
  if (Math.abs(diff) < 60_000) return diff >= 0 ? 'due now' : 'just overdue';
  return diff >= 0
    ? `in ${durationLabel(diff)}`
    : `${durationLabel(Math.abs(diff))} overdue`;
}

export function isRecentOpsDate(
  value: string | null | undefined,
  days = 7,
  { now = new Date() }: DateLikeOptions = {}
) {
  const date = parseDate(value);
  if (!date) return false;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

export function paymentQueueTone(
  row: PaymentQueueLike,
  { now = new Date() }: DateLikeOptions = {}
): OpsTone {
  const combined = [row.status, row.payment_status, row.payment_status_row]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (combined.includes('refund') || combined.includes('verification')) {
    return 'danger';
  }

  const expiresAt = parseDate(row.expires_at || row.hold_expires_at);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return 'danger';
  if (combined.includes('pending') || combined.includes('expired')) {
    return 'warn';
  }
  return 'neutral';
}

export function paymentQueueLabel(
  row: PaymentQueueLike,
  options: DateLikeOptions = {}
) {
  const tone = paymentQueueTone(row, options);
  const combined = [row.status, row.payment_status, row.payment_status_row]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (combined.includes('refund')) return 'Refund review';
  if (combined.includes('verification')) return 'Verify payment';
  if (tone === 'danger') return 'Expired hold';
  if (combined.includes('pending')) return 'Collect deposit';
  return 'Payment check';
}

export function customerIsIdle(customer: CustomerMemoryLike) {
  return (
    !customer.human_mode &&
    !customer.pending_payment_reference_id &&
    !customer.pending_booking_id &&
    !customer.active_booking_id &&
    !customer.last_intent &&
    !customer.conversation_id
  );
}

export function matchesCustomerOpsFilter(
  customer: CustomerMemoryLike,
  filter: CustomerOpsFilter,
  options: DateLikeOptions = {}
) {
  switch (filter) {
    case 'handoff':
      return Boolean(customer.human_mode);
    case 'payment':
      return Boolean(customer.pending_payment_reference_id);
    case 'booking':
      return Boolean(customer.pending_booking_id || customer.active_booking_id);
    case 'idle':
      return customerIsIdle(customer);
    case 'recent':
      return isRecentOpsDate(customer.last_seen_at, 7, options);
    case 'all':
    default:
      return true;
  }
}

export function matchesCustomerSearch(
  customer: CustomerMemoryLike,
  rawQuery: string
) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  return [
    customer.customer_name,
    customer.phone,
    customer.preferred_services_summary,
    customer.preferred_stylist_name,
    customer.profile_summary,
    customer.last_customer_message,
    customer.last_intent,
  ].some((value) =>
    String(value || '')
      .toLowerCase()
      .includes(query)
  );
}
