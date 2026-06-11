import { saluQuery } from "./db";

const TZ = "Asia/Kolkata";

export interface SaluConfig {
  salon_name: string;
  timezone: string;
  owner_number: string;
  address: string;
  hours: string;
  updated_at: string;
}

export interface SaluMetrics {
  today_bookings: number;
  upcoming_confirmed: number;
  pending_payment_holds: number;
  needs_attention: number;
  paid_today_paise: number;
  customers_seen_7d: number;
  messages_today: number;
  human_mode_sessions: number;
}

export interface SaluBookingRow {
  booking_id: string;
  phone: string;
  customer_name: string;
  service_labels: string;
  service_label: string;
  service_assignments_summary: string;
  stylist_names: string;
  stylist_name: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  payment_status: string;
  total_paise: number;
  deposit_paise: number;
  hold_expires_at: string;
  created_at: string;
}

export interface SaluPaymentQueueRow extends SaluBookingRow {
  reference_id: string;
  payment_link: string;
  gateway_payment_link_id: string;
  payment_status_row: string;
  amount_paise: number;
  expires_at: string;
}

export interface SaluActivityRow {
  event_id: string;
  phone: string;
  event_type: string;
  route: string;
  status: string;
  intent: string;
  summary: string;
  raw_text: string;
  created_at: string;
}

export interface SaluCustomerRow {
  phone: string;
  customer_name: string;
  profile_summary: string;
  preferred_services_summary: string;
  preferred_stylist_name: string;
  active_booking_id: string;
  pending_booking_id: string;
  pending_payment_reference_id: string;
  last_intent: string;
  last_customer_message: string;
  last_seen_at: string;
  bookings_count: number;
  next_booking_at: string;
}

export interface SaluSetupHealth {
  active_services: number;
  active_stylists: number;
  stylists_missing_images: number;
  active_stylist_services: number;
  availability_rules: number;
  stylist_availability_rules: number;
  stale_pending_holds: number;
  failed_payments: number;
}

export interface SaluSyncState {
  sync_name: string;
  last_status: string;
  last_error: string;
  updated_at: string;
}

export interface SaluSyncRun {
  tab_name: string;
  source: string;
  row_count: number;
  error_count: number;
  status: string;
  created_at: string;
}

export interface SaluN8nWorkflow {
  name: string;
  active: boolean;
}

export interface SaluN8nHealth {
  configured: boolean;
  ok: boolean;
  error: string;
  activeCount: number;
  expectedCount: number;
  workflows: SaluN8nWorkflow[];
}

export interface SaluDashboardData {
  config: SaluConfig | null;
  metrics: SaluMetrics;
  todaySchedule: SaluBookingRow[];
  opsQueue: SaluPaymentQueueRow[];
  recentActivity: SaluActivityRow[];
  customers: SaluCustomerRow[];
  setupHealth: SaluSetupHealth;
  syncState: SaluSyncState[];
  syncRuns: SaluSyncRun[];
  n8n: SaluN8nHealth;
}

const expectedWorkflowNames = [
  "Salu WhatsApp - Inbound Concierge",
  "Salu WhatsApp - Payments",
  "Salu WhatsApp - Reminders + Owner Digest",
  "Salu WhatsApp - Flow Options Endpoint",
  "Salu WhatsApp - Flow Data Adapter",
  "Salu Admin - Sheets Supabase Sync",
  "Salu WhatsApp - Error Alerts",
];

export async function loadSaluDashboardData(): Promise<SaluDashboardData> {
  const [
    config,
    metrics,
    todaySchedule,
    opsQueue,
    recentActivity,
    customers,
    setupHealth,
    syncState,
    syncRuns,
    n8n,
  ] = await Promise.all([
    loadConfig(),
    loadMetrics(),
    loadTodaySchedule(),
    loadOpsQueue(),
    loadRecentActivity(14),
    loadCustomers(8),
    loadSetupHealth(),
    loadSyncState(),
    loadSyncRuns(),
    loadN8nHealth(),
  ]);

  return {
    config,
    metrics,
    todaySchedule,
    opsQueue,
    recentActivity,
    customers,
    setupHealth,
    syncState,
    syncRuns,
    n8n,
  };
}

export async function loadConfig() {
  const rows = await saluQuery<SaluConfig>(
    `
      select salon_name, timezone, owner_number, address, hours, updated_at::text
      from salu.config
      where not sheet_sync_deleted
      order by updated_at desc
      limit 1
    `,
  );
  return rows[0] || null;
}

async function loadMetrics() {
  const rows = await saluQuery<SaluMetrics>(
    `
      with bounds as (
        select
          (now() at time zone $1)::date as today,
          (((now() at time zone $1)::date)::timestamp at time zone $1) as today_start
      )
      select
        (
          select count(*)::int
          from salu.bookings b, bounds
          where b.appointment_date = bounds.today
            and b.status in ('pending', 'confirmed')
        ) as today_bookings,
        (
          select count(*)::int
          from salu.bookings
          where status = 'confirmed'
            and starts_at >= now()
        ) as upcoming_confirmed,
        (
          select count(*)::int
          from salu.bookings
          where status = 'pending'
            and payment_status = 'pending'
            and (hold_expires_at is null or hold_expires_at > now())
        ) as pending_payment_holds,
        (
          (
            select count(*)::int
            from salu.bookings
            where status in ('refund_required', 'verification_failed')
               or payment_status in ('refund_required', 'verification_failed')
          )
          +
          (
            select count(*)::int
            from salu.customer_sessions
            where human_mode
          )
        ) as needs_attention,
        (
          select coalesce(sum(amount_paise), 0)::int
          from salu.payments p, bounds
          where p.status = 'paid'
            and p.paid_at >= bounds.today_start
        ) as paid_today_paise,
        (
          select count(*)::int
          from salu.customer_profiles
          where last_seen_at >= now() - interval '7 days'
        ) as customers_seen_7d,
        (
          select count(*)::int
          from salu.message_events e, bounds
          where e.created_at >= bounds.today_start
        ) as messages_today,
        (
          select count(*)::int
          from salu.customer_sessions
          where human_mode
        ) as human_mode_sessions
    `,
    [TZ],
  );
  return rows[0];
}

async function loadTodaySchedule() {
  return saluQuery<SaluBookingRow>(
    `
      select
        booking_id,
        phone,
        customer_name,
        service_labels,
        service_label,
        service_assignments_summary,
        stylist_names,
        stylist_name,
        appointment_date::text,
        to_char(appointment_time, 'HH24:MI') as appointment_time,
        status,
        payment_status,
        total_paise,
        deposit_paise,
        coalesce(hold_expires_at::text, '') as hold_expires_at,
        created_at::text
      from salu.bookings
      where appointment_date = (now() at time zone $1)::date
        and status in ('pending', 'confirmed')
      order by appointment_time asc
      limit 24
    `,
    [TZ],
  );
}

async function loadOpsQueue() {
  return saluQuery<SaluPaymentQueueRow>(
    `
      select
        b.booking_id,
        b.phone,
        b.customer_name,
        b.service_labels,
        b.service_label,
        b.service_assignments_summary,
        b.stylist_names,
        b.stylist_name,
        b.appointment_date::text,
        to_char(b.appointment_time, 'HH24:MI') as appointment_time,
        b.status,
        b.payment_status,
        b.total_paise,
        b.deposit_paise,
        coalesce(b.hold_expires_at::text, '') as hold_expires_at,
        b.created_at::text,
        coalesce(p.reference_id, b.payment_reference_id, '') as reference_id,
        coalesce(p.payment_link, b.payment_link, '') as payment_link,
        coalesce(p.gateway_payment_link_id, '') as gateway_payment_link_id,
        coalesce(p.status, '') as payment_status_row,
        coalesce(p.amount_paise, b.deposit_paise, 0) as amount_paise,
        coalesce(p.expires_at::text, '') as expires_at
      from salu.bookings b
      left join salu.payments p
        on p.reference_id = b.payment_reference_id
        or p.booking_id = b.booking_id
      where b.status = 'pending'
         or b.status in ('refund_required', 'verification_failed')
         or b.payment_status in ('refund_required', 'verification_failed')
      order by
        case
          when b.status in ('refund_required', 'verification_failed') then 0
          when b.payment_status in ('refund_required', 'verification_failed') then 0
          when b.status = 'pending' and b.hold_expires_at <= now() then 1
          else 2
        end,
        coalesce(b.hold_expires_at, b.created_at) asc
      limit 12
    `,
  );
}

async function loadRecentActivity(limit: number) {
  return saluQuery<SaluActivityRow>(
    `
      select
        event_id,
        phone,
        event_type,
        route,
        status,
        intent,
        summary,
        raw_text,
        created_at::text
      from salu.message_events
      order by created_at desc
      limit $1
    `,
    [limit],
  );
}

export async function loadCustomers(limit = 50) {
  return saluQuery<SaluCustomerRow>(
    `
      select
        cp.phone,
        cp.customer_name,
        cp.profile_summary,
        cp.preferred_services_summary,
        cp.preferred_stylist_name,
        cp.active_booking_id,
        cp.pending_booking_id,
        cp.pending_payment_reference_id,
        cp.last_intent,
        cp.last_customer_message,
        coalesce(cp.last_seen_at::text, '') as last_seen_at,
        count(b.booking_id)::int as bookings_count,
        coalesce(min(b.starts_at) filter (
          where b.status in ('pending', 'confirmed') and b.starts_at >= now()
        )::text, '') as next_booking_at
      from salu.customer_profiles cp
      left join salu.bookings b on b.phone = cp.phone
      group by cp.phone
      order by cp.last_seen_at desc nulls last, cp.updated_at desc
      limit $1
    `,
    [limit],
  );
}

async function loadSetupHealth() {
  const rows = await saluQuery<SaluSetupHealth>(
    `
      select
        (select count(*)::int from salu.services where active and not sheet_sync_deleted) as active_services,
        (select count(*)::int from salu.stylists where active and not sheet_sync_deleted) as active_stylists,
        (
          select count(*)::int
          from salu.stylists
          where active
            and not sheet_sync_deleted
            and coalesce(image_url, '') = ''
        ) as stylists_missing_images,
        (select count(*)::int from salu.stylist_services where active and not sheet_sync_deleted) as active_stylist_services,
        (select count(*)::int from salu.availability where active and not sheet_sync_deleted) as availability_rules,
        (select count(*)::int from salu.stylist_availability where active and not sheet_sync_deleted) as stylist_availability_rules,
        (
          select count(*)::int
          from salu.bookings
          where status = 'pending'
            and hold_expires_at is not null
            and hold_expires_at <= now()
        ) as stale_pending_holds,
        (
          select count(*)::int
          from salu.payments
          where status in ('verification_failed', 'refund_required')
        ) as failed_payments
    `,
  );
  return rows[0];
}

async function loadSyncState() {
  return saluQuery<SaluSyncState>(
    `
      select sync_name, last_status, last_error, updated_at::text
      from salu.sheet_sync_state
      order by updated_at desc
      limit 8
    `,
  );
}

async function loadSyncRuns() {
  return saluQuery<SaluSyncRun>(
    `
      select tab_name, source, row_count, error_count, status, created_at::text
      from salu.sheet_sync_runs
      order by id desc
      limit 8
    `,
  );
}

export async function loadSaluInbox() {
  const [threads, messages] = await Promise.all([
    saluQuery<
      SaluActivityRow & {
        customer_name: string;
        profile_summary: string;
        human_mode: boolean;
        pending_action: string;
        pending_booking_id: string;
        pending_payment_reference_id: string;
      }
    >(
      `
        with latest as (
          select distinct on (phone)
            event_id,
            phone,
            event_type,
            route,
            status,
            intent,
            summary,
            raw_text,
            created_at
          from salu.message_events
          where coalesce(phone, '') <> ''
          order by phone, created_at desc
        )
        select
          latest.event_id,
          latest.phone,
          latest.event_type,
          latest.route,
          latest.status,
          latest.intent,
          latest.summary,
          latest.raw_text,
          latest.created_at::text,
          coalesce(cp.customer_name, 'Guest') as customer_name,
          coalesce(cp.profile_summary, '') as profile_summary,
          coalesce(cs.human_mode, false) as human_mode,
          coalesce(cs.pending_action, '') as pending_action,
          coalesce(cs.pending_booking_id, '') as pending_booking_id,
          coalesce(cs.pending_payment_reference_id, '') as pending_payment_reference_id
        from latest
        left join salu.customer_profiles cp on cp.phone = latest.phone
        left join salu.customer_sessions cs on cs.phone = latest.phone
        order by latest.created_at desc
        limit 40
      `,
    ),
    loadRecentActivity(80),
  ]);

  return { threads, messages };
}

export async function loadSaluCustomersPage() {
  const [customers, metrics] = await Promise.all([loadCustomers(100), loadMetrics()]);
  return { customers, metrics };
}

async function loadN8nHealth(): Promise<SaluN8nHealth> {
  const base = process.env.N8N_URL?.replace(/\/$/, "");
  const apiKey = process.env.N8N_API_KEY;
  if (!base || !apiKey) {
    return {
      configured: false,
      ok: false,
      error: "N8N_URL or N8N_API_KEY is not configured",
      activeCount: 0,
      expectedCount: expectedWorkflowNames.length,
      workflows: expectedWorkflowNames.map((name) => ({ name, active: false })),
    };
  }

  try {
    const response = await fetch(`${base}/api/v1/workflows?limit=100`, {
      headers: { "X-N8N-API-KEY": apiKey },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`n8n API returned ${response.status}`);
    }

    const body = (await response.json()) as {
      data?: Array<{ name: string; active: boolean }>;
    };
    const rows = Array.isArray(body.data) ? body.data : [];
    const byName = new Map(rows.map((workflow) => [workflow.name, workflow]));
    const workflows = expectedWorkflowNames.map((name) => ({
      name,
      active: byName.get(name)?.active === true,
    }));
    const activeCount = workflows.filter((workflow) => workflow.active).length;

    return {
      configured: true,
      ok: activeCount === expectedWorkflowNames.length,
      error: "",
      activeCount,
      expectedCount: expectedWorkflowNames.length,
      workflows,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : "Unable to reach n8n",
      activeCount: 0,
      expectedCount: expectedWorkflowNames.length,
      workflows: expectedWorkflowNames.map((name) => ({ name, active: false })),
    };
  }
}
