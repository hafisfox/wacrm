import type { PoolClient } from 'pg';

import { WEEKDAYS, skillsFromSummary } from './control-room-shared';
import { saluQuery, saluTransaction } from './db';

// Route-contract guard: CONTROL_ROOM_MUTATION_ROLE = "admin"
export const CONTROL_ROOM_MUTATION_ROLE = 'admin' as const;
export {
  SKILL_LEVELS,
  WEEKDAYS,
  skillsFromSummary,
} from './control-room-shared';

type Weekday = (typeof WEEKDAYS)[number];

export interface SalonConfigRow {
  config_id: string;
  salon_name: string;
  timezone: string;
  owner_number: string;
  address: string;
  hours: string;
  default_language: string;
  bot_policy_text: string;
  updated_at: string;
}

export interface SalonServiceRow {
  service_id: string;
  service_name: string;
  duration_minutes: number;
  price_display: string;
  price_paise: number;
  deposit_paise: number;
  payment_required: boolean;
  payment_label: string;
  active: boolean;
  flow_order: number;
  notes: string;
  updated_at: string;
}

export interface SalonStylistRow {
  stylist_id: string;
  stylist_name: string;
  specialty: string;
  image_url: string;
  image_alt: string;
  bio: string;
  skills_summary: string;
  active: boolean;
  flow_order: number;
  notes: string;
  updated_at: string;
}

export interface StylistServiceRow {
  stylist_service_id: string;
  stylist_id: string;
  service_id: string;
  active: boolean;
  override_duration_minutes: number | null;
  override_price_paise: number | null;
  override_deposit_paise: number | null;
  skill_level: string;
  flow_order: number;
  notes: string;
  updated_at: string;
}

export interface AvailabilityRow {
  availability_id: string;
  day_name: string;
  open_time: string;
  close_time: string;
  slot_interval_minutes: number | null;
  blackout_date: string;
  service_id: string;
  active: boolean;
  notes: string;
  updated_at: string;
}

export interface StylistAvailabilityRow {
  stylist_availability_id: string;
  stylist_id: string;
  day_name: string;
  open_time: string;
  close_time: string;
  slot_interval_minutes: number | null;
  blackout_date: string;
  effective_from: string;
  effective_to: string;
  active: boolean;
  notes: string;
  updated_at: string;
}

export interface ControlRoomReadiness {
  active_services: number;
  active_stylists: number;
  active_mappings: number;
  availability_rules: number;
  stylist_availability_rules: number;
  missing_stylist_images: number;
  unmapped_active_stylists: number;
  unmapped_active_services: number;
  ready: boolean;
}

export interface ControlRoomData {
  config: SalonConfigRow;
  services: SalonServiceRow[];
  stylists: SalonStylistRow[];
  stylistServices: StylistServiceRow[];
  availability: AvailabilityRow[];
  stylistAvailability: StylistAvailabilityRow[];
  readiness: ControlRoomReadiness;
}

interface RawInput {
  [key: string]: unknown;
}

type ScheduleScope = 'salon' | 'stylist';

const defaultConfig: SalonConfigRow = {
  config_id: 'default',
  salon_name: 'Salu Salon',
  timezone: 'Asia/Kolkata',
  owner_number: '',
  address: '',
  hours: '',
  default_language: 'en',
  bot_policy_text: '',
  updated_at: '',
};

function text(value: unknown, fallback = '') {
  const cleaned = String(value ?? '').trim();
  return cleaned || fallback;
}

function optionalText(value: unknown) {
  return String(value ?? '').trim();
}

export function skillsToSummary(skills: unknown) {
  if (!Array.isArray(skills)) return optionalText(skills);
  return skillsFromSummary(
    skills.map((skill) => String(skill)).join(', ')
  ).join(', ');
}

export function stylistImageAlt(
  stylistName: string,
  imageUrl: string,
  value: unknown
) {
  return (
    optionalText(value) || (imageUrl ? `${stylistName} stylist photo` : '')
  );
}

function slug(value: unknown, fallback: string) {
  const base = text(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return base || fallback;
}

function integer(value: unknown, fallback: number, min = 0) {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.round(parsed));
}

function nullableInteger(value: unknown, min = 0) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  return integer(value, min, min);
}

function bool(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function weekday(value: unknown) {
  const cleaned = text(value);
  const found = WEEKDAYS.find(
    (day) => day.toLowerCase() === cleaned.toLowerCase()
  );
  if (!found) throw new Error('day_name must be a valid weekday');
  return found;
}

function timeValue(value: unknown, label: string) {
  const cleaned = text(value);
  if (!/^\d{2}:\d{2}$/.test(cleaned)) {
    throw new Error(`${label} must use HH:MM format`);
  }
  const [hour, minute] = cleaned.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error(`${label} is not a valid time`);
  return cleaned;
}

function dateOrNull(value: unknown) {
  const cleaned = optionalText(value);
  if (!cleaned) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new Error('Dates must use YYYY-MM-DD format');
  }
  return cleaned;
}

function compareTime(openTime: string, closeTime: string) {
  if (closeTime <= openTime) {
    throw new Error('close_time must be after open_time');
  }
}

function idFromAvailability(input: RawInput, dayName: Weekday) {
  return [
    'availability',
    slug(input.service_id, 'all'),
    dayName.toLowerCase(),
    optionalText(input.blackout_date) || 'weekly',
    optionalText(input.open_time).replace(':', ''),
    optionalText(input.close_time).replace(':', ''),
  ].join('_');
}

function idFromStylistAvailability(input: RawInput, dayName: Weekday) {
  return [
    'stylist_availability',
    slug(input.stylist_id, 'stylist'),
    dayName.toLowerCase(),
    optionalText(input.blackout_date) || 'weekly',
    optionalText(input.effective_from) || 'from_any',
    optionalText(input.effective_to) || 'to_any',
    optionalText(input.open_time).replace(':', ''),
    optionalText(input.close_time).replace(':', ''),
  ].join('_');
}

export function sanitizeConfig(input: RawInput) {
  return {
    salon_name: text(input.salon_name, 'Salu Salon'),
    timezone: text(input.timezone, 'Asia/Kolkata'),
    owner_number: optionalText(input.owner_number),
    address: optionalText(input.address),
    hours: optionalText(input.hours),
    default_language: text(input.default_language, 'en').slice(0, 12),
    bot_policy_text: optionalText(input.bot_policy_text),
  };
}

export function sanitizeService(input: RawInput) {
  const serviceName = text(input.service_name, 'Service');
  const serviceId = slug(input.service_id, slug(serviceName, 'service'));
  const pricePaise = integer(input.price_paise, 0, 0);
  const depositPaise = integer(input.deposit_paise, 0, 0);
  const priceDisplay =
    optionalText(input.price_display) ||
    (pricePaise ? `₹${(pricePaise / 100).toLocaleString('en-IN')}` : '');
  if (depositPaise > pricePaise && pricePaise > 0) {
    throw new Error('deposit_paise cannot exceed price_paise');
  }
  return {
    service_id: serviceId,
    service_name: serviceName,
    duration_minutes: integer(input.duration_minutes, 60, 5),
    price_display: priceDisplay,
    price_paise: pricePaise,
    deposit_paise: depositPaise,
    payment_required: bool(input.payment_required, true),
    payment_label: optionalText(input.payment_label),
    active: bool(input.active, true),
    flow_order: integer(input.flow_order, 999, 0),
    notes: optionalText(input.notes),
  };
}

export function sanitizeStylist(input: RawInput) {
  const stylistName = text(input.stylist_name, 'Stylist');
  const stylistId = slug(input.stylist_id, slug(stylistName, 'stylist'));
  const imageUrl = optionalText(input.image_url);
  return {
    stylist_id: stylistId,
    stylist_name: stylistName,
    specialty: optionalText(input.specialty),
    image_url: imageUrl,
    image_alt: stylistImageAlt(stylistName, imageUrl, input.image_alt),
    bio: optionalText(input.bio),
    skills_summary: skillsToSummary(input.skills ?? input.skills_summary),
    active: bool(input.active, true),
    flow_order: integer(input.flow_order, 999, 0),
    notes: optionalText(input.notes),
  };
}

/** A compact customer-facing description that mirrors the weekly booking grid. */
export function customerHoursFromAvailability(
  rows: Array<
    Pick<
      AvailabilityRow,
      | 'day_name'
      | 'open_time'
      | 'close_time'
      | 'active'
      | 'blackout_date'
      | 'service_id'
    >
  >
) {
  const labels: Record<Weekday, string> = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun',
  };
  const regular = rows.filter(
    (row) => row.active && !row.blackout_date && !row.service_id
  );
  return WEEKDAYS.map((day) => {
    const ranges = regular
      .filter((row) => row.day_name.toLowerCase() === day.toLowerCase())
      .map((row) => `${row.open_time}–${row.close_time}`)
      .join(', ');
    return `${labels[day]}: ${ranges || 'Closed'}`;
  }).join('; ');
}

export function sanitizeStylistService(input: RawInput) {
  const stylistId = slug(input.stylist_id, 'stylist');
  const serviceId = slug(input.service_id, 'service');
  return {
    stylist_service_id: text(
      input.stylist_service_id,
      `${stylistId}::${serviceId}`
    ),
    stylist_id: stylistId,
    service_id: serviceId,
    active: bool(input.active, true),
    override_duration_minutes: nullableInteger(
      input.override_duration_minutes,
      5
    ),
    override_price_paise: nullableInteger(input.override_price_paise, 0),
    override_deposit_paise: nullableInteger(input.override_deposit_paise, 0),
    skill_level: optionalText(input.skill_level),
    flow_order: integer(input.flow_order, 999, 0),
    notes: optionalText(input.notes),
  };
}

export function sanitizeAvailability(input: RawInput) {
  const dayName = weekday(input.day_name);
  const openTime = timeValue(input.open_time, 'open_time');
  const closeTime = timeValue(input.close_time, 'close_time');
  compareTime(openTime, closeTime);
  return {
    availability_id: text(
      input.availability_id,
      idFromAvailability(input, dayName)
    ),
    day_name: dayName,
    open_time: openTime,
    close_time: closeTime,
    slot_interval_minutes: nullableInteger(input.slot_interval_minutes, 5),
    blackout_date: dateOrNull(input.blackout_date),
    service_id: optionalText(input.service_id),
    active: bool(input.active, true),
    notes: optionalText(input.notes),
  };
}

export function sanitizeStylistAvailability(input: RawInput) {
  const dayName = weekday(input.day_name);
  const openTime = timeValue(input.open_time, 'open_time');
  const closeTime = timeValue(input.close_time, 'close_time');
  compareTime(openTime, closeTime);
  const effectiveFrom = dateOrNull(input.effective_from);
  const effectiveTo = dateOrNull(input.effective_to);
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error('effective_to must be on or after effective_from');
  }
  return {
    stylist_availability_id: text(
      input.stylist_availability_id,
      idFromStylistAvailability(input, dayName)
    ),
    stylist_id: slug(input.stylist_id, 'stylist'),
    day_name: dayName,
    open_time: openTime,
    close_time: closeTime,
    slot_interval_minutes: nullableInteger(input.slot_interval_minutes, 5),
    blackout_date: dateOrNull(input.blackout_date),
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    active: bool(input.active, true),
    notes: optionalText(input.notes),
  };
}

function readinessFor(data: Omit<ControlRoomData, 'readiness'>) {
  const activeServices = data.services.filter((row) => row.active);
  const activeStylists = data.stylists.filter((row) => row.active);
  const activeMappings = data.stylistServices.filter((row) => row.active);
  const mappedStylists = new Set(activeMappings.map((row) => row.stylist_id));
  const mappedServices = new Set(activeMappings.map((row) => row.service_id));
  const missingImages = activeStylists.filter((row) => !row.image_url).length;
  const readiness: ControlRoomReadiness = {
    active_services: activeServices.length,
    active_stylists: activeStylists.length,
    active_mappings: activeMappings.length,
    availability_rules: data.availability.filter((row) => row.active).length,
    stylist_availability_rules: data.stylistAvailability.filter(
      (row) => row.active
    ).length,
    missing_stylist_images: missingImages,
    unmapped_active_stylists: activeStylists.filter(
      (row) => !mappedStylists.has(row.stylist_id)
    ).length,
    unmapped_active_services: activeServices.filter(
      (row) => !mappedServices.has(row.service_id)
    ).length,
    ready: false,
  };
  readiness.ready =
    readiness.active_services > 0 &&
    readiness.active_stylists > 0 &&
    readiness.active_mappings > 0 &&
    readiness.availability_rules + readiness.stylist_availability_rules > 0 &&
    readiness.unmapped_active_stylists === 0 &&
    readiness.unmapped_active_services === 0;
  return readiness;
}

export async function loadControlRoomData(): Promise<ControlRoomData> {
  const [
    configRows,
    services,
    stylists,
    stylistServices,
    availability,
    stylistAvailability,
  ] = await Promise.all([
    saluQuery<SalonConfigRow>(
      `
        select config_id, salon_name, timezone, owner_number, address, hours,
               default_language, bot_policy_text, updated_at::text
        from salu.config
        order by updated_at desc
        limit 1
      `
    ),
    saluQuery<SalonServiceRow>(
      `
        select service_id, service_name, duration_minutes, price_display,
               price_paise, deposit_paise, payment_required, payment_label,
               active, flow_order, notes, updated_at::text
        from salu.services
        order by active desc, flow_order, service_name
      `
    ),
    saluQuery<SalonStylistRow>(
      `
        select stylist_id, stylist_name, specialty, image_url, image_alt, bio,
               skills_summary, active, flow_order, notes, updated_at::text
        from salu.stylists
        order by active desc, flow_order, stylist_name
      `
    ),
    saluQuery<StylistServiceRow>(
      `
        select stylist_service_id, stylist_id, service_id, active,
               override_duration_minutes, override_price_paise,
               override_deposit_paise, skill_level, flow_order, notes,
               updated_at::text
        from salu.stylist_services
        order by active desc, flow_order, stylist_id, service_id
      `
    ),
    saluQuery<AvailabilityRow>(
      `
        select availability_id, day_name, open_time, close_time,
               slot_interval_minutes, coalesce(blackout_date::text, '') as blackout_date,
               service_id, active, notes, updated_at::text
        from salu.availability
        order by active desc,
          case lower(day_name)
            when 'monday' then 1 when 'tuesday' then 2 when 'wednesday' then 3
            when 'thursday' then 4 when 'friday' then 5 when 'saturday' then 6
            when 'sunday' then 7 else 8
          end,
          open_time
      `
    ),
    saluQuery<StylistAvailabilityRow>(
      `
        select stylist_availability_id, stylist_id, day_name, open_time, close_time,
               slot_interval_minutes, coalesce(blackout_date::text, '') as blackout_date,
               coalesce(effective_from::text, '') as effective_from,
               coalesce(effective_to::text, '') as effective_to,
               active, notes, updated_at::text
        from salu.stylist_availability
        order by active desc, stylist_id,
          case lower(day_name)
            when 'monday' then 1 when 'tuesday' then 2 when 'wednesday' then 3
            when 'thursday' then 4 when 'friday' then 5 when 'saturday' then 6
            when 'sunday' then 7 else 8
          end,
          open_time
      `
    ),
  ]);

  const base = {
    config: configRows[0] ?? defaultConfig,
    services,
    stylists,
    stylistServices,
    availability,
    stylistAvailability,
  };

  return {
    ...base,
    readiness: readinessFor(base),
  };
}

export async function updateConfig(input: RawInput) {
  const row = sanitizeConfig(input);
  await saluQuery(
    `
      insert into salu.config (
        config_id, salon_name, timezone, owner_number, address, hours,
        default_language, bot_policy_text, updated_at
      )
      values ('default', $1, $2, $3, $4, $5, $6, $7, now())
      on conflict (config_id) do update set
        salon_name = excluded.salon_name,
        timezone = excluded.timezone,
        owner_number = excluded.owner_number,
        address = excluded.address,
        hours = excluded.hours,
        default_language = excluded.default_language,
        bot_policy_text = excluded.bot_policy_text,
        updated_at = now()
    `,
    [
      row.salon_name,
      row.timezone,
      row.owner_number,
      row.address,
      row.hours,
      row.default_language,
      row.bot_policy_text,
    ]
  );
}

export async function upsertService(input: RawInput) {
  const row = sanitizeService(input);
  await saluQuery(
    `
      insert into salu.services (
        service_id, service_name, duration_minutes, price_display, price_paise,
        deposit_paise, payment_required, payment_label, active, flow_order,
        notes, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      on conflict (service_id) do update set
        service_name = excluded.service_name,
        duration_minutes = excluded.duration_minutes,
        price_display = excluded.price_display,
        price_paise = excluded.price_paise,
        deposit_paise = excluded.deposit_paise,
        payment_required = excluded.payment_required,
        payment_label = excluded.payment_label,
        active = excluded.active,
        flow_order = excluded.flow_order,
        notes = excluded.notes,
        updated_at = now()
    `,
    Object.values(row)
  );
}

export async function upsertStylist(input: RawInput) {
  const row = sanitizeStylist(input);
  await saluQuery(
    `
      insert into salu.stylists (
        stylist_id, stylist_name, specialty, image_url, image_alt, bio,
        skills_summary, active, flow_order, notes, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      on conflict (stylist_id) do update set
        stylist_name = excluded.stylist_name,
        specialty = excluded.specialty,
        image_url = excluded.image_url,
        image_alt = excluded.image_alt,
        bio = excluded.bio,
        skills_summary = excluded.skills_summary,
        active = excluded.active,
        flow_order = excluded.flow_order,
        notes = excluded.notes,
        updated_at = now()
    `,
    Object.values(row)
  );
}

export async function upsertStylistService(input: RawInput) {
  const row = sanitizeStylistService(input);
  await saluQuery(
    `
      insert into salu.stylist_services (
        stylist_service_id, stylist_id, service_id, active,
        override_duration_minutes, override_price_paise, override_deposit_paise,
        skill_level, flow_order, notes, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      on conflict (stylist_service_id) do update set
        stylist_id = excluded.stylist_id,
        service_id = excluded.service_id,
        active = excluded.active,
        override_duration_minutes = excluded.override_duration_minutes,
        override_price_paise = excluded.override_price_paise,
        override_deposit_paise = excluded.override_deposit_paise,
        skill_level = excluded.skill_level,
        flow_order = excluded.flow_order,
        notes = excluded.notes,
        updated_at = now()
    `,
    Object.values(row)
  );
}

export async function upsertAvailability(input: RawInput) {
  const row = sanitizeAvailability(input);
  await saluQuery(
    `
      insert into salu.availability (
        availability_id, day_name, open_time, close_time, slot_interval_minutes,
        blackout_date, service_id, active, notes, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      on conflict (availability_id) do update set
        day_name = excluded.day_name,
        open_time = excluded.open_time,
        close_time = excluded.close_time,
        slot_interval_minutes = excluded.slot_interval_minutes,
        blackout_date = excluded.blackout_date,
        service_id = excluded.service_id,
        active = excluded.active,
        notes = excluded.notes,
        updated_at = now()
    `,
    Object.values(row)
  );
}

export async function upsertStylistAvailability(input: RawInput) {
  const row = sanitizeStylistAvailability(input);
  await saluQuery(
    `
      insert into salu.stylist_availability (
        stylist_availability_id, stylist_id, day_name, open_time, close_time,
        slot_interval_minutes, blackout_date, effective_from, effective_to,
        active, notes, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      on conflict (stylist_availability_id) do update set
        stylist_id = excluded.stylist_id,
        day_name = excluded.day_name,
        open_time = excluded.open_time,
        close_time = excluded.close_time,
        slot_interval_minutes = excluded.slot_interval_minutes,
        blackout_date = excluded.blackout_date,
        effective_from = excluded.effective_from,
        effective_to = excluded.effective_to,
        active = excluded.active,
        notes = excluded.notes,
        updated_at = now()
    `,
    Object.values(row)
  );
}

async function writeAvailability(
  client: PoolClient,
  row: ReturnType<typeof sanitizeAvailability>
) {
  await client.query(
    `
      insert into salu.availability (
        availability_id, day_name, open_time, close_time, slot_interval_minutes,
        blackout_date, service_id, active, notes, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      on conflict (availability_id) do update set
        day_name = excluded.day_name,
        open_time = excluded.open_time,
        close_time = excluded.close_time,
        slot_interval_minutes = excluded.slot_interval_minutes,
        blackout_date = excluded.blackout_date,
        service_id = excluded.service_id,
        active = excluded.active,
        notes = excluded.notes,
        updated_at = now()
    `,
    Object.values(row)
  );
}

async function writeStylistAvailability(
  client: PoolClient,
  row: ReturnType<typeof sanitizeStylistAvailability>
) {
  await client.query(
    `
      insert into salu.stylist_availability (
        stylist_availability_id, stylist_id, day_name, open_time, close_time,
        slot_interval_minutes, blackout_date, effective_from, effective_to,
        active, notes, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      on conflict (stylist_availability_id) do update set
        stylist_id = excluded.stylist_id,
        day_name = excluded.day_name,
        open_time = excluded.open_time,
        close_time = excluded.close_time,
        slot_interval_minutes = excluded.slot_interval_minutes,
        blackout_date = excluded.blackout_date,
        effective_from = excluded.effective_from,
        effective_to = excluded.effective_to,
        active = excluded.active,
        notes = excluded.notes,
        updated_at = now()
    `,
    Object.values(row)
  );
}

/**
 * Applies a complete scheduling edit in one transaction. The UI sends the
 * rows it changed plus the existing rules it intentionally removed, so the
 * booking workflow can never read a half-updated week.
 */
export async function updateSchedule(input: RawInput) {
  const scope = text(input.scope) as ScheduleScope;
  if (scope !== 'salon' && scope !== 'stylist') {
    throw new Error('scope must be salon or stylist');
  }
  const rawRules = input.rules;
  if (
    !Array.isArray(rawRules) ||
    rawRules.length > 100 ||
    (!rawRules.length && !Array.isArray(input.deactivate_ids))
  ) {
    throw new Error('Provide schedule rules or rules to deactivate');
  }
  const rules = rawRules.map((rule) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new Error('Each schedule rule must be an object');
    }
    return rule as RawInput;
  });
  const deactivateIds = Array.isArray(input.deactivate_ids)
    ? input.deactivate_ids.map((id) => text(id)).filter(Boolean)
    : [];
  if (new Set(deactivateIds).size !== deactivateIds.length) {
    throw new Error('Schedule rules cannot be deactivated twice');
  }

  if (scope === 'salon') {
    const sanitized = rules.map(sanitizeAvailability);
    await saluTransaction(async (client) => {
      for (const row of sanitized) await writeAvailability(client, row);
      if (deactivateIds.length) {
        await client.query(
          `update salu.availability set active = false, updated_at = now()
           where availability_id = any($1::text[])`,
          [deactivateIds]
        );
      }
      const { rows } = await client.query<AvailabilityRow>(
        `select availability_id, day_name, open_time, close_time,
                slot_interval_minutes, coalesce(blackout_date::text, '') as blackout_date,
                service_id, active, notes, updated_at::text
           from salu.availability
          where active and blackout_date is null and service_id = ''`
      );
      await client.query(
        `insert into salu.config (config_id, hours, updated_at)
         values ('default', $1, now())
         on conflict (config_id) do update set
           hours = excluded.hours,
           updated_at = now()`,
        [customerHoursFromAvailability(rows)]
      );
    });
    return;
  }

  const stylistId = slug(input.stylist_id, 'stylist');
  if (!optionalText(input.stylist_id)) {
    throw new Error('Choose a stylist before saving their schedule');
  }
  const sanitized = rules.map((rule) => {
    const row = sanitizeStylistAvailability({ ...rule, stylist_id: stylistId });
    return row;
  });
  await saluTransaction(async (client) => {
    for (const row of sanitized) await writeStylistAvailability(client, row);
    if (deactivateIds.length) {
      await client.query(
        `update salu.stylist_availability set active = false, updated_at = now()
          where stylist_availability_id = any($1::text[]) and stylist_id = $2`,
        [deactivateIds, stylistId]
      );
    }
  });
}

export async function updateFlowOrder(input: RawInput) {
  const entity = text(input.entity);
  const source = Array.isArray(input.ids) ? input.ids : [];
  const ids = source.map((id) => text(id)).filter(Boolean);
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) {
    throw new Error('Provide a unique ordered list of up to 100 items');
  }
  const target =
    entity === 'services'
      ? { table: 'services', id: 'service_id' }
      : entity === 'stylists'
        ? { table: 'stylists', id: 'stylist_id' }
        : null;
  if (!target)
    throw new Error('Only service and stylist ordering is supported');

  await saluTransaction(async (client) => {
    for (const [index, id] of ids.entries()) {
      await client.query(
        `update salu.${target.table} set flow_order = $1, updated_at = now()
         where ${target.id} = $2`,
        [index + 1, id]
      );
    }
  });
}

export async function deactivateAdminRow(
  table: string,
  idColumn: string,
  id: string
) {
  if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(idColumn)) {
    throw new Error('Invalid control-room table');
  }
  await saluQuery(
    `update salu.${table} set active = false, updated_at = now() where ${idColumn} = $1`,
    [id]
  );
}
