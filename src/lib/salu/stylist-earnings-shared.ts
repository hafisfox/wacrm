/**
 * Types and pure helpers for team earnings.
 *
 * Split from `stylist-earnings.ts` for the same reason as
 * `control-room-shared.ts`: the Salon Control client needs the shapes and
 * the date maths, and importing the loader would drag `pg` into the
 * browser bundle.
 */

export const SALON_TIME_ZONE = 'Asia/Kolkata';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const EARNINGS_PERIODS = ['day', 'month'] as const;
export type EarningsPeriod = (typeof EARNINGS_PERIODS)[number];

export interface StylistEarningsRow {
  stylist_id: string;
  stylist_name: string;
  active: boolean;
  /** Appointments on the board for the window, booked or already served. */
  jobs_booked: number;
  /** Appointments actually finished — confirmed and past their end time. */
  jobs_done: number;
  minutes_done: number;
  /** Menu value of the finished work. */
  earned_paise: number;
  /** Menu value of everything on the board, finished or not. */
  booked_paise: number;
  /** Deposits genuinely received through the payment links, apportioned to
   *  this stylist by their share of the booking's value. */
  collected_paise: number;
}

export interface StylistEarningsTotals {
  jobs_booked: number;
  jobs_done: number;
  minutes_done: number;
  earned_paise: number;
  booked_paise: number;
  collected_paise: number;
}

export interface StylistEarningsReport {
  period: EarningsPeriod;
  /** A date inside the requested window, in salon time. */
  anchor: string;
  start_date: string;
  /** Inclusive — the last day the window covers. */
  end_date: string;
  label: string;
  rows: StylistEarningsRow[];
  totals: StylistEarningsTotals;
}

/** Today's date as the salon reckons it, not as the server's clock does. */
export function salonToday(timezone = SALON_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function normalizeEarningsPeriod(value: unknown): EarningsPeriod {
  return value === 'month' ? 'month' : 'day';
}

/** A malformed anchor falls back to today rather than failing the panel. */
export function normalizeEarningsAnchor(
  value: unknown,
  timezone = SALON_TIME_ZONE
) {
  const raw = String(value || '').trim();
  if (!ISO_DATE.test(raw)) return salonToday(timezone);
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? salonToday(timezone) : raw;
}

/** Inclusive calendar bounds for a period anchored on `anchor`. */
export function earningsWindow(period: EarningsPeriod, anchor: string) {
  if (period === 'day') return { start: anchor, end: anchor };
  const [year, month] = anchor.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${anchor.slice(0, 7)}-01`,
    end: `${anchor.slice(0, 7)}-${String(last).padStart(2, '0')}`,
  };
}

/* The anchor is already a salon-local calendar date, so it is formatted in
 * UTC — re-applying the salon zone would shift it by a day. */
export function earningsLabel(period: EarningsPeriod, anchor: string) {
  if (!anchor) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    ...(period === 'day'
      ? ({ weekday: 'short', day: '2-digit', month: 'short' } as const)
      : ({ month: 'long', year: 'numeric' } as const)),
  }).format(new Date(`${anchor}T00:00:00Z`));
}

/** Step the window one period backwards or forwards. */
export function shiftEarningsAnchor(
  period: EarningsPeriod,
  anchor: string,
  direction: -1 | 1
) {
  const [year, month, day] = anchor.split('-').map(Number);
  const moved =
    period === 'day'
      ? new Date(Date.UTC(year, month - 1, day + direction))
      : new Date(Date.UTC(year, month - 1 + direction, 1));
  return moved.toISOString().slice(0, 10);
}

export const EMPTY_EARNINGS_TOTALS: StylistEarningsTotals = {
  jobs_booked: 0,
  jobs_done: 0,
  minutes_done: 0,
  earned_paise: 0,
  booked_paise: 0,
  collected_paise: 0,
};
