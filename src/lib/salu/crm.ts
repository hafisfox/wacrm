import type { QueryResultRow } from 'pg';

import { saluQuery } from './db';

export type SaluCrmSenderType = 'customer' | 'agent' | 'bot';
export type SaluCrmContentType = 'text' | 'interactive';
export type SaluCrmMessageStatus = 'sent' | 'delivered';

export interface SaluMessageEventLike {
  event_type?: string | null;
  route?: string | null;
  status?: string | null;
  intent?: string | null;
  summary?: string | null;
  raw_text?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface SaluCrmMessageMapping {
  mirrored: boolean;
  reason?: string;
  senderType: SaluCrmSenderType;
  contentType: SaluCrmContentType;
  status: SaluCrmMessageStatus;
  contentText: string;
  interactiveReplyId?: string;
}

export interface SaluCustomerSession {
  phone: string;
  wa_to: string;
  language: string;
  human_mode: boolean;
  active_flow: string;
  flow_token: string;
  current_booking_id: string;
  current_service_id: string;
  current_booking_date: string;
  current_booking_time: string;
  customer_name: string;
  last_intent: string;
  summary: string;
  pending_action: string;
  pending_booking_id: string;
  pending_payment_reference_id: string;
  pending_payment_link: string;
  memory_json: Record<string, unknown>;
  last_customer_message: string;
  last_inbound_at: string;
  handoff_started_at: string;
  unclear_turn_count: number;
  handoff_reason: string;
  handoff_category: string;
  handoff_event_id: string;
  updated_at: string;
}

export interface SaluCustomerProfile {
  phone: string;
  wa_to: string;
  customer_name: string;
  language: string;
  profile_summary: string;
  preferred_service_label: string;
  preferred_services_summary: string;
  preferred_stylist_name: string;
  active_booking_id: string;
  pending_booking_id: string;
  pending_payment_reference_id: string;
  pending_payment_link: string;
  last_booking_id: string;
  last_intent: string;
  last_customer_message: string;
  last_seen_at: string;
  updated_at: string;
}

export interface SaluCustomerBooking {
  booking_id: string;
  phone: string;
  customer_name: string;
  service_label: string;
  service_labels: string;
  service_assignments_summary: string;
  stylist_name: string;
  stylist_names: string;
  appointment_date: string;
  appointment_time: string;
  starts_at: string;
  status: string;
  payment_status: string;
  payment_reference_id: string;
  payment_link: string;
  total_paise: number;
  deposit_paise: number;
  balance_paise: number;
  hold_expires_at: string;
  updated_at: string;
}

export interface SaluCustomerPayment {
  reference_id: string;
  booking_id: string;
  phone: string;
  amount_paise: number;
  currency: string;
  status: string;
  gateway_payment_link_id: string;
  gateway_payment_id: string;
  gateway_method: string;
  payment_link: string;
  expires_at: string;
  paid_at: string;
  updated_at: string;
}

export interface SaluCustomerDetails {
  phone: string;
  phone_key: string;
  session: SaluCustomerSession | null;
  profile: SaluCustomerProfile | null;
  active_booking: SaluCustomerBooking | null;
  bookings: SaluCustomerBooking[];
  pending_payment: SaluCustomerPayment | null;
  payments: SaluCustomerPayment[];
}

const INTERNAL_EVENT_TYPES = new Set([
  'payment_claim',
  'payment_link',
  'payment_webhook',
  'payment_sweeper',
  'schema_setup',
  'setup',
]);

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return '';
}

export function normalizeSaluPhoneKey(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function canonicalSaluPhone(phone: string): string {
  const key = normalizeSaluPhoneKey(phone);
  return key ? `+${key}` : '';
}

export function mapSaluEventToCrmMessage(
  event: SaluMessageEventLike
): SaluCrmMessageMapping {
  const payload = event.payload ?? {};
  const eventType = textValue(event.event_type).toLowerCase();
  const route = textValue(event.route).toLowerCase();
  const direction = textValue(payload.direction).toLowerCase();

  if (INTERNAL_EVENT_TYPES.has(eventType) && direction !== 'outbound') {
    return {
      mirrored: false,
      reason: 'internal_event',
      senderType: 'bot',
      contentType: 'text',
      status: 'sent',
      contentText: '',
    };
  }

  let senderType = textValue(
    payload.sender_type
  ).toLowerCase() as SaluCrmSenderType;
  if (!['customer', 'agent', 'bot'].includes(senderType)) {
    senderType =
      direction === 'outbound' ||
      route === 'outbound' ||
      [
        'bot_message',
        'outbound_message',
        'outbound_bot',
        'template_message',
      ].includes(eventType)
        ? 'bot'
        : 'customer';
  }

  const contentType: SaluCrmContentType =
    eventType === 'flow_reply' ? 'interactive' : 'text';
  let contentText =
    firstText(
      event.raw_text,
      payload.text,
      payload.body,
      event.summary,
      event.intent,
      event.event_type
    ) || '[WhatsApp event]';

  if (eventType === 'flow_reply' && !textValue(event.raw_text)) {
    contentText =
      firstText(payload.text, payload.body) ||
      {
        payment_pending: 'Booking details submitted',
        cancel: 'Cancellation request submitted',
        weekend_not_bookable: 'Selected date is unavailable',
      }[textValue(event.intent).toLowerCase()] ||
      'WhatsApp Flow submitted';
  }

  return {
    mirrored: true,
    senderType,
    contentType,
    status: senderType === 'customer' ? 'delivered' : 'sent',
    contentText,
    interactiveReplyId:
      contentType === 'interactive'
        ? firstText(
            payload.interactive_reply_id,
            payload.button_id,
            event.intent
          )
        : undefined,
  };
}

interface SessionRow extends QueryResultRow, SaluCustomerSession {}
interface ProfileRow extends QueryResultRow, SaluCustomerProfile {}
interface BookingRow extends QueryResultRow, SaluCustomerBooking {}
interface PaymentRow extends QueryResultRow, SaluCustomerPayment {}

export async function loadSaluCustomerDetails(
  phone: string
): Promise<SaluCustomerDetails> {
  const phoneKey = normalizeSaluPhoneKey(phone);
  if (!phoneKey) {
    throw new Error('A valid phone number is required.');
  }

  const [sessions, profiles, bookings, payments] = await Promise.all([
    saluQuery<SessionRow>(
      `
        select
          phone,
          wa_to,
          language,
          human_mode,
          active_flow,
          flow_token,
          current_booking_id,
          current_service_id,
          coalesce(current_booking_date::text, '') as current_booking_date,
          coalesce(to_char(current_booking_time, 'HH24:MI'), '') as current_booking_time,
          customer_name,
          last_intent,
          summary,
          pending_action,
          pending_booking_id,
          pending_payment_reference_id,
          pending_payment_link,
          memory_json,
          last_customer_message,
          coalesce(last_inbound_at::text, '') as last_inbound_at,
          coalesce(handoff_started_at::text, '') as handoff_started_at,
          updated_at::text
        from salu.customer_sessions
        where regexp_replace(phone, '\\D', '', 'g') = $1
        limit 1
      `,
      [phoneKey]
    ),
    saluQuery<ProfileRow>(
      `
        select
          phone,
          wa_to,
          customer_name,
          language,
          profile_summary,
          preferred_service_label,
          preferred_services_summary,
          preferred_stylist_name,
          active_booking_id,
          pending_booking_id,
          pending_payment_reference_id,
          pending_payment_link,
          last_booking_id,
          last_intent,
          last_customer_message,
          coalesce(last_seen_at::text, '') as last_seen_at,
          updated_at::text
        from salu.customer_profiles
        where regexp_replace(phone, '\\D', '', 'g') = $1
        limit 1
      `,
      [phoneKey]
    ),
    saluQuery<BookingRow>(
      `
        select
          booking_id,
          phone,
          customer_name,
          service_label,
          service_labels,
          service_assignments_summary,
          stylist_name,
          stylist_names,
          appointment_date::text,
          to_char(appointment_time, 'HH24:MI') as appointment_time,
          starts_at::text,
          status,
          payment_status,
          payment_reference_id,
          payment_link,
          total_paise,
          deposit_paise,
          balance_paise,
          coalesce(hold_expires_at::text, '') as hold_expires_at,
          updated_at::text
        from salu.bookings
        where regexp_replace(phone, '\\D', '', 'g') = $1
        order by
          case when status in ('pending', 'confirmed') and starts_at >= now() then 0 else 1 end,
          starts_at asc,
          updated_at desc
        limit 8
      `,
      [phoneKey]
    ),
    saluQuery<PaymentRow>(
      `
        select
          reference_id,
          booking_id,
          phone,
          amount_paise,
          currency,
          status,
          gateway_payment_link_id,
          gateway_payment_id,
          gateway_method,
          payment_link,
          coalesce(expires_at::text, '') as expires_at,
          coalesce(paid_at::text, '') as paid_at,
          updated_at::text
        from salu.payments
        where regexp_replace(phone, '\\D', '', 'g') = $1
        order by
          case when status = 'pending' then 0 else 1 end,
          updated_at desc
        limit 8
      `,
      [phoneKey]
    ),
  ]);

  return {
    phone: canonicalSaluPhone(phone) || phone,
    phone_key: phoneKey,
    session: sessions[0] ?? null,
    profile: profiles[0] ?? null,
    active_booking:
      bookings.find(
        (booking) =>
          ['pending', 'confirmed'].includes(booking.status) &&
          Boolean(booking.starts_at)
      ) ?? null,
    bookings,
    pending_payment:
      payments.find((payment) => payment.status === 'pending') ?? null,
    payments,
  };
}

export async function setSaluHumanMode(
  phone: string,
  humanMode: boolean,
  reason = 'dashboard_takeover'
): Promise<SaluCustomerSession> {
  const canonicalPhone = canonicalSaluPhone(phone);
  const phoneKey = normalizeSaluPhoneKey(phone);
  if (!canonicalPhone || !phoneKey) {
    throw new Error('A valid phone number is required.');
  }

  const rows = await saluQuery<SessionRow>(
    `
      insert into salu.customer_sessions (
        phone,
        wa_to,
        human_mode,
        last_intent,
        summary,
        handoff_started_at,
        unclear_turn_count,
        handoff_reason,
        handoff_category,
        handoff_event_id,
        updated_at
      )
      values (
        $1,
        $2,
        $3,
        case when $3 then 'manual_takeover' else 'bot_resumed' end,
        $4,
        case when $3 then now() else null end,
        0,
        case when $3 then $4 else '' end,
        case when $3 then 'dashboard_manual' else '' end,
        '',
        now()
      )
      on conflict (phone) do update
      set
        human_mode = excluded.human_mode,
        active_flow = case when excluded.human_mode then '' else salu.customer_sessions.active_flow end,
        flow_token = case when excluded.human_mode then '' else salu.customer_sessions.flow_token end,
        last_intent = excluded.last_intent,
        summary = excluded.summary,
        handoff_started_at = case
          when excluded.human_mode then coalesce(salu.customer_sessions.handoff_started_at, now())
          else null
        end,
        unclear_turn_count = 0,
        handoff_reason = case when excluded.human_mode then excluded.handoff_reason else '' end,
        handoff_category = case when excluded.human_mode then excluded.handoff_category else '' end,
        handoff_event_id = case when excluded.human_mode then salu.customer_sessions.handoff_event_id else '' end,
        sheet_sync_source = 'database',
        sheet_synced_at = null,
        updated_at = now()
      returning
        phone,
        wa_to,
        language,
        human_mode,
        active_flow,
        flow_token,
        current_booking_id,
        current_service_id,
        coalesce(current_booking_date::text, '') as current_booking_date,
        coalesce(to_char(current_booking_time, 'HH24:MI'), '') as current_booking_time,
        customer_name,
        last_intent,
        summary,
        pending_action,
        pending_booking_id,
        pending_payment_reference_id,
        pending_payment_link,
        memory_json,
        last_customer_message,
        coalesce(last_inbound_at::text, '') as last_inbound_at,
        coalesce(handoff_started_at::text, '') as handoff_started_at,
        unclear_turn_count,
        handoff_reason,
        handoff_category,
        handoff_event_id,
        updated_at::text
    `,
    [canonicalPhone, phoneKey, humanMode, reason]
  );

  return rows[0];
}

export async function logSaluAgentMessage({
  phone,
  messageId,
  text,
  senderId,
  contentType = 'text',
}: {
  phone: string;
  messageId: string;
  text: string;
  senderId: string;
  contentType?: string;
}): Promise<void> {
  const canonicalPhone = canonicalSaluPhone(phone);
  if (!canonicalPhone || !messageId) return;

  await saluQuery(
    `select salu.upsert_message_event($1::jsonb) as result`,
    [{
      event_id: messageId,
      message_id: messageId,
      phone: canonicalPhone,
      wa_to: normalizeSaluPhoneKey(canonicalPhone),
      event_type: 'agent_message',
      route: 'dashboard_manual_send',
      status: 'processed',
      intent: 'agent_reply',
      summary: text.slice(0, 500),
      raw_text: text,
      message_type: contentType,
      direction: 'outbound',
      sender_type: 'agent',
      sender_id: senderId,
    }],
  );
}
