import { fetchWithTimeout, TIMEOUT_EXTERNAL_MS } from '@/lib/http';
import { saluQuery } from './db';

const TZ = 'Asia/Kolkata';

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
  conversation_id: string;
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
  conversation_id: string;
  human_mode: boolean;
}

export interface SaluHandoffRow {
  conversation_id: string;
  phone: string;
  customer_name: string;
  last_message_text: string;
  last_message_at: string;
  unread_count: number;
  handoff_state: string;
  handoff_reason: string;
  handoff_category: string;
  handoff_requested_at: string;
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

export interface SaluN8nWorkflow {
  name: string;
  active: boolean;
  role: 'core' | 'bridge';
}

export interface SaluEnvCheck {
  key: string;
  configured: boolean;
  label: string;
}

export interface SaluN8nHealth {
  configured: boolean;
  ok: boolean;
  error: string;
  activeCount: number;
  expectedCount: number;
  manualSendReady: boolean;
  env: SaluEnvCheck[];
  workflows: SaluN8nWorkflow[];
}

export interface SaluDatabaseHealth {
  ok: boolean;
  error: string;
  checkedAt: string;
}

export interface SaluSystemHealth {
  n8n: SaluN8nHealth;
  setupHealth: SaluSetupHealth | null;
  database: SaluDatabaseHealth;
}

/**
 * One panel's worth of data, plus whether loading it worked.
 *
 * The dashboard is nine independent queries rendered as nine
 * independent panels. Previously they were fetched with `Promise.all`,
 * so a single failing query rejected the whole batch and the page
 * replaced *everything* with a setup-error screen — losing eight
 * healthy panels to one bad one. During an incident that is exactly
 * backwards: the operator most needs today's schedule when something
 * else is broken.
 *
 * `data` is always present so callers can render without narrowing;
 * on failure it holds the empty value for that section and `error`
 * explains why the panel is blank.
 */
export interface SaluSection<T> {
  data: T;
  ok: boolean;
  error: string;
}

export interface SaluDashboardData {
  config: SaluSection<SaluConfig | null>;
  metrics: SaluSection<SaluMetrics>;
  todaySchedule: SaluSection<SaluBookingRow[]>;
  nextSchedule: SaluSection<SaluBookingRow[]>;
  opsQueue: SaluSection<SaluPaymentQueueRow[]>;
  handoffQueue: SaluSection<SaluHandoffRow[]>;
  recentActivity: SaluSection<SaluActivityRow[]>;
  setupHealth: SaluSection<SaluSetupHealth>;
  n8n: SaluSection<SaluN8nHealth>;
  /** True when every section loaded. Drives the page-level banner. */
  ok: boolean;
  /**
   * True when *nothing* loaded — almost always a bad connection string
   * or an unreachable database rather than nine coincidental failures.
   * The page shows setup guidance for this case.
   */
  down: boolean;
}

const EMPTY_METRICS: SaluMetrics = {
  today_bookings: 0,
  upcoming_confirmed: 0,
  pending_payment_holds: 0,
  needs_attention: 0,
  paid_today_paise: 0,
  customers_seen_7d: 0,
  messages_today: 0,
  human_mode_sessions: 0,
};

const EMPTY_SETUP_HEALTH: SaluSetupHealth = {
  active_services: 0,
  active_stylists: 0,
  stylists_missing_images: 0,
  active_stylist_services: 0,
  availability_rules: 0,
  stylist_availability_rules: 0,
  stale_pending_holds: 0,
  failed_payments: 0,
};

/** Resolve a section, downgrading a rejection to a rendered error. */
async function section<T>(
  work: Promise<T>,
  fallback: T
): Promise<SaluSection<T>> {
  try {
    return { data: await work, ok: true, error: '' };
  } catch (error) {
    return { data: fallback, ok: false, error: errorMessage(error) };
  }
}

const expectedWorkflows: Array<{
  name: string;
  role: SaluN8nWorkflow['role'];
}> = [
  { name: 'Salu WhatsApp - Inbound Concierge', role: 'core' },
  { name: 'Salu WhatsApp - Payments', role: 'core' },
  { name: 'Salu WhatsApp - Reminders + Owner Digest', role: 'core' },
  { name: 'Salu WhatsApp - Flow Options Endpoint', role: 'core' },
  { name: 'Salu WhatsApp - Flow Data Adapter', role: 'core' },
  { name: 'Salu WhatsApp - Error Alerts', role: 'core' },
  { name: 'Salu WhatsApp - Dashboard Manual Send', role: 'bridge' },
];

export async function loadSaluDashboardData(): Promise<SaluDashboardData> {
  // Each section settles independently — see `SaluSection`. Still one
  // round of concurrency, so this is no slower than the Promise.all it
  // replaced; it just stops one bad query from taking the page down.
  const [
    config,
    metrics,
    todaySchedule,
    nextSchedule,
    opsQueue,
    handoffQueue,
    recentActivity,
    setupHealth,
    n8n,
  ] = await Promise.all([
    section(loadConfig(), null as SaluConfig | null),
    section(loadMetrics(), EMPTY_METRICS),
    section(loadTodaySchedule(), [] as SaluBookingRow[]),
    section(loadNextSchedule(), [] as SaluBookingRow[]),
    section(loadOpsQueue(), [] as SaluPaymentQueueRow[]),
    section(loadHandoffQueue(), [] as SaluHandoffRow[]),
    section(loadRecentActivity(14), [] as SaluActivityRow[]),
    section(loadSetupHealth(), EMPTY_SETUP_HEALTH),
    // loadN8nHealth already returns its own error state rather than
    // throwing, so this wrapper is belt-and-braces.
    section(loadN8nHealth(), unreachableN8nHealth('n8n health unavailable')),
  ]);

  const all = [
    config,
    metrics,
    todaySchedule,
    nextSchedule,
    opsQueue,
    handoffQueue,
    recentActivity,
    setupHealth,
    n8n,
  ];

  return {
    config,
    metrics,
    todaySchedule,
    nextSchedule,
    opsQueue,
    handoffQueue,
    recentActivity,
    setupHealth,
    n8n,
    ok: all.every((s) => s.ok),
    down: all.every((s) => !s.ok),
  };
}

export async function loadConfig() {
  const rows = await saluQuery<SaluConfig>(
    `
      select salon_name, timezone, owner_number, address, hours, updated_at::text
      from salu.config
      order by updated_at desc
      limit 1
    `
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
    [TZ]
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
    [TZ]
  );
}

async function loadNextSchedule() {
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
      where starts_at >= now()
        and appointment_date > (now() at time zone $1)::date
        and status in ('pending', 'confirmed')
      order by starts_at asc
      limit 8
    `,
    [TZ]
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
        coalesce(p.expires_at::text, '') as expires_at,
        coalesce((
          select conv.id::text
          from public.contacts c
          join public.conversations conv on conv.contact_id = c.id
          where c.phone_normalized = regexp_replace(b.phone, '\\D', '', 'g')
          order by conv.updated_at desc nulls last, conv.created_at desc
          limit 1
        ), '') as conversation_id
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
    `
  );
}

async function loadHandoffQueue() {
  return saluQuery<SaluHandoffRow>(
    `
      select
        conv.id::text as conversation_id,
        coalesce(c.phone, '') as phone,
        coalesce(c.name, '') as customer_name,
        coalesce(conv.last_message_text, '') as last_message_text,
        coalesce(conv.last_message_at::text, '') as last_message_at,
        coalesce(conv.unread_count, 0)::int as unread_count,
        coalesce(conv.handoff_state, 'none') as handoff_state,
        coalesce(conv.handoff_reason, '') as handoff_reason,
        coalesce(conv.handoff_category, '') as handoff_category,
        coalesce(conv.handoff_requested_at::text, '') as handoff_requested_at
      from public.conversations conv
      join public.contacts c on c.id = conv.contact_id
      where conv.bot_paused
         or conv.handoff_state in ('requested', 'active')
      order by
        case when conv.handoff_priority = 'urgent' then 0 else 1 end,
        coalesce(conv.handoff_requested_at, conv.last_message_at, conv.updated_at) desc
      limit 10
    `
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
    [limit]
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
        count(distinct b.booking_id)::int as bookings_count,
        coalesce(min(b.starts_at) filter (
          where b.status in ('pending', 'confirmed') and b.starts_at >= now()
        )::text, '') as next_booking_at,
        coalesce((
          array_agg(conv.id::text order by conv.updated_at desc)
          filter (where conv.id is not null)
        )[1], '') as conversation_id,
        coalesce(bool_or(coalesce(cs.human_mode, false)), false) as human_mode
      from salu.customer_profiles cp
      left join salu.bookings b on b.phone = cp.phone
      left join salu.customer_sessions cs
        on regexp_replace(cs.phone, '\\D', '', 'g') = regexp_replace(cp.phone, '\\D', '', 'g')
      left join public.contacts c
        on c.phone_normalized = regexp_replace(cp.phone, '\\D', '', 'g')
      left join public.conversations conv
        on conv.contact_id = c.id
      group by
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
        cp.last_seen_at,
        cp.updated_at
      order by cp.last_seen_at desc nulls last, cp.updated_at desc
      limit $1
    `,
    [limit]
  );
}

export async function loadSetupHealth() {
  const rows = await saluQuery<SaluSetupHealth>(
    `
      select
        (select count(*)::int from salu.services where active) as active_services,
        (select count(*)::int from salu.stylists where active) as active_stylists,
        (
          select count(*)::int
          from salu.stylists
          where active
            and coalesce(image_url, '') = ''
        ) as stylists_missing_images,
        (select count(*)::int from salu.stylist_services where active) as active_stylist_services,
        (select count(*)::int from salu.availability where active) as availability_rules,
        (select count(*)::int from salu.stylist_availability where active) as stylist_availability_rules,
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
    `
  );
  return rows[0];
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
      `
    ),
    loadRecentActivity(80),
  ]);

  return { threads, messages };
}

export async function loadSaluCustomersPage() {
  const [customers, metrics] = await Promise.all([
    loadCustomers(100),
    loadMetrics(),
  ]);
  return { customers, metrics };
}

function loadN8nEnvChecks(): SaluEnvCheck[] {
  return [
    {
      key: 'N8N_URL',
      label: 'n8n API URL',
      configured: Boolean(process.env.N8N_URL),
    },
    {
      key: 'N8N_API_KEY',
      label: 'n8n API key',
      configured: Boolean(process.env.N8N_API_KEY),
    },
    {
      key: 'SALU_DASHBOARD_MODE',
      label: 'n8n-owned send mode',
      configured: process.env.SALU_DASHBOARD_MODE === 'n8n-owned-whatsapp',
    },
    {
      key: 'SALU_N8N_MANUAL_SEND_TOKEN',
      label: 'manual-send webhook secret',
      configured: (process.env.SALU_N8N_MANUAL_SEND_TOKEN || '').length >= 32,
    },
  ];
}

function inactiveExpectedWorkflows() {
  return expectedWorkflows.map((workflow) => ({
    ...workflow,
    active: false,
  }));
}

function manualSendReadyFrom(env: SaluEnvCheck[]) {
  return env
    .filter((check) =>
      ['SALU_DASHBOARD_MODE', 'SALU_N8N_MANUAL_SEND_TOKEN'].includes(check.key)
    )
    .every((check) => check.configured);
}

/**
 * The "we could not read n8n" shape. Env checks are local so they stay
 * accurate even when the API is unreachable — the operator still needs
 * to know whether the bridge secret is set.
 */
function unreachableN8nHealth(error: string): SaluN8nHealth {
  const env = loadN8nEnvChecks();
  return {
    configured: Boolean(process.env.N8N_URL && process.env.N8N_API_KEY),
    ok: false,
    error,
    activeCount: 0,
    expectedCount: expectedWorkflows.length,
    manualSendReady: manualSendReadyFrom(env),
    env,
    workflows: inactiveExpectedWorkflows(),
  };
}

export async function loadN8nHealth(): Promise<SaluN8nHealth> {
  const base = process.env.N8N_URL?.replace(/\/$/, '');
  const apiKey = process.env.N8N_API_KEY;
  const env = loadN8nEnvChecks();
  const manualSendReady = manualSendReadyFrom(env);

  if (!base || !apiKey) {
    return {
      configured: false,
      ok: false,
      error: 'N8N_URL or N8N_API_KEY is not configured',
      activeCount: 0,
      expectedCount: expectedWorkflows.length,
      manualSendReady,
      env,
      workflows: inactiveExpectedWorkflows(),
    };
  }

  try {
    // Bounded: this runs during the /dashboard server render, and an
    // unreachable n8n host does not error — it hangs. Without a
    // deadline the whole page blocks on a self-hosted box being down.
    const response = await fetchWithTimeout(
      `${base}/api/v1/workflows?limit=100`,
      {
        headers: { 'X-N8N-API-KEY': apiKey },
        cache: 'no-store',
      },
      TIMEOUT_EXTERNAL_MS
    );

    if (!response.ok) {
      throw new Error(`n8n API returned ${response.status}`);
    }

    const body = (await response.json()) as {
      data?: Array<{ name: string; active: boolean }>;
    };
    const rows = Array.isArray(body.data) ? body.data : [];
    const byName = new Map(rows.map((workflow) => [workflow.name, workflow]));
    const workflows = expectedWorkflows.map((workflow) => ({
      ...workflow,
      active: byName.get(workflow.name)?.active === true,
    }));
    const activeCount = workflows.filter((workflow) => workflow.active).length;
    const ok =
      activeCount === expectedWorkflows.length &&
      env.every((check) => check.configured);

    return {
      configured: true,
      ok,
      error: '',
      activeCount,
      expectedCount: expectedWorkflows.length,
      manualSendReady,
      env,
      workflows,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to reach n8n',
      activeCount: 0,
      expectedCount: expectedWorkflows.length,
      manualSendReady,
      env,
      workflows: inactiveExpectedWorkflows(),
    };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function loadSaluSystemHealth(): Promise<SaluSystemHealth> {
  const checkedAt = new Date().toISOString();
  const [n8nResult, setupResult] = await Promise.allSettled([
    loadN8nHealth(),
    loadSetupHealth(),
  ]);

  const n8n =
    n8nResult.status === 'fulfilled'
      ? n8nResult.value
      : unreachableN8nHealth(errorMessage(n8nResult.reason));

  const setupHealth =
    setupResult.status === 'fulfilled' ? setupResult.value : null;
  const database: SaluDatabaseHealth =
    setupResult.status === 'fulfilled'
      ? { ok: true, error: '', checkedAt }
      : { ok: false, error: errorMessage(setupResult.reason), checkedAt };

  return {
    n8n,
    setupHealth,
    database,
  };
}
