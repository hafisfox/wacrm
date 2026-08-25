import { saluQuery } from './db';
import {
  SALON_TIME_ZONE,
  earningsLabel,
  earningsWindow,
  normalizeEarningsAnchor,
  normalizeEarningsPeriod,
  type StylistEarningsReport,
  type StylistEarningsRow,
} from './stylist-earnings-shared';

export {
  EARNINGS_PERIODS,
  EMPTY_EARNINGS_TOTALS,
  SALON_TIME_ZONE,
  earningsLabel,
  earningsWindow,
  normalizeEarningsAnchor,
  normalizeEarningsPeriod,
  salonToday,
  shiftEarningsAnchor,
  type EarningsPeriod,
  type StylistEarningsReport,
  type StylistEarningsRow,
  type StylistEarningsTotals,
} from './stylist-earnings-shared';

/**
 * What each stylist actually produced in a day or a month.
 *
 * Work is counted from `booking_segments`, which is the only place a
 * multi-stylist booking is split per person — the booking row alone would
 * credit the whole ticket to one stylist. Bookings written before segments
 * existed have no rows there, so they are unioned back in from the booking
 * itself; otherwise older months would read as an empty salon.
 *
 * Money is reported two ways on purpose. `earned_paise` is the menu value
 * of the work performed, which is what an owner means by "what did they
 * bring in". `collected_paise` is the deposit money that genuinely arrived
 * through the payment gateway — usually much smaller, and never presented
 * as if it were the same number.
 */
export async function loadStylistEarnings(
  options: { period?: unknown; anchor?: unknown; timezone?: string } = {}
): Promise<StylistEarningsReport> {
  const timezone = options.timezone || SALON_TIME_ZONE;
  const period = normalizeEarningsPeriod(options.period);
  const anchor = normalizeEarningsAnchor(options.anchor, timezone);
  const { start, end } = earningsWindow(period, anchor);

  const rows = await saluQuery<StylistEarningsRow>(
    `
      with bounds as (
        select
          $1::date as start_day,
          case when $2::text = 'month'
            then (date_trunc('month', $1::date) + interval '1 month')::date
            else ($1::date + 1)
          end as end_day
      ),
      work as (
        select
          bs.segment_id,
          bs.booking_id,
          lower(bs.stylist_id) as stylist_id,
          lower(bs.service_id) as service_id,
          bs.duration_minutes,
          bs.status,
          bs.ends_at,
          b.total_paise,
          (
            select count(*)
            from salu.booking_segments x
            where x.booking_id = bs.booking_id
          ) as booking_segment_count
        from salu.booking_segments bs
        join salu.bookings b on b.booking_id = bs.booking_id
        cross join bounds
        where bs.appointment_date >= bounds.start_day
          and bs.appointment_date < bounds.end_day
        union all
        select
          b.booking_id as segment_id,
          b.booking_id,
          lower(b.stylist_id) as stylist_id,
          lower(b.service_id) as service_id,
          b.duration_minutes,
          b.status,
          b.ends_at,
          b.total_paise,
          1 as booking_segment_count
        from salu.bookings b
        cross join bounds
        where b.appointment_date >= bounds.start_day
          and b.appointment_date < bounds.end_day
          and not exists (
            select 1 from salu.booking_segments s
            where s.booking_id = b.booking_id
          )
      ),
      priced as (
        select
          w.*,
          coalesce(
            nullif(ss.override_price_paise, 0),
            nullif(sv.price_paise, 0),
            case when w.booking_segment_count > 0
              then w.total_paise / w.booking_segment_count
              else 0
            end
          )::bigint as value_paise
        from work w
        left join salu.services sv on lower(sv.service_id) = w.service_id
        left join salu.stylist_services ss
          on lower(ss.stylist_id) = w.stylist_id
         and lower(ss.service_id) = w.service_id
         and ss.active
      ),
      shared as (
        select
          p.*,
          sum(p.value_paise) over (partition by p.booking_id) as booking_value_paise
        from priced p
      ),
      paid as (
        select booking_id, sum(amount_paise)::bigint as paid_paise
        from salu.payments
        where status = 'paid'
        group by booking_id
      )
      select
        s.stylist_id,
        s.stylist_name,
        s.active,
        count(w.segment_id) filter (
          where w.status in ('pending', 'confirmed')
        )::int as jobs_booked,
        count(w.segment_id) filter (
          where w.status = 'confirmed' and w.ends_at <= now()
        )::int as jobs_done,
        coalesce(sum(w.duration_minutes) filter (
          where w.status = 'confirmed' and w.ends_at <= now()
        ), 0)::int as minutes_done,
        coalesce(sum(w.value_paise) filter (
          where w.status = 'confirmed' and w.ends_at <= now()
        ), 0)::bigint as earned_paise,
        coalesce(sum(w.value_paise) filter (
          where w.status in ('pending', 'confirmed')
        ), 0)::bigint as booked_paise,
        coalesce(round(sum(
          (coalesce(pay.paid_paise, 0)::numeric * w.value_paise)
            / nullif(w.booking_value_paise, 0)
        ) filter (where w.status in ('pending', 'confirmed'))), 0)::bigint
          as collected_paise
      from salu.stylists s
      left join shared w on w.stylist_id = lower(s.stylist_id)
      left join paid pay on pay.booking_id = w.booking_id
      group by s.stylist_id, s.stylist_name, s.active, s.flow_order
      order by s.active desc, s.flow_order, s.stylist_name
    `,
    [start, period]
  );

  // pg hands back bigint as a string so precision survives the wire; the
  // panel needs real numbers to add up and sort.
  const normalized = rows.map((row) => ({
    ...row,
    jobs_booked: Number(row.jobs_booked),
    jobs_done: Number(row.jobs_done),
    minutes_done: Number(row.minutes_done),
    earned_paise: Number(row.earned_paise),
    booked_paise: Number(row.booked_paise),
    collected_paise: Number(row.collected_paise),
  }));

  return {
    period,
    anchor,
    start_date: start,
    end_date: end,
    label: earningsLabel(period, anchor),
    rows: normalized,
    totals: normalized.reduce(
      (sum, row) => ({
        jobs_booked: sum.jobs_booked + row.jobs_booked,
        jobs_done: sum.jobs_done + row.jobs_done,
        minutes_done: sum.minutes_done + row.minutes_done,
        earned_paise: sum.earned_paise + row.earned_paise,
        booked_paise: sum.booked_paise + row.booked_paise,
        collected_paise: sum.collected_paise + row.collected_paise,
      }),
      {
        jobs_booked: 0,
        jobs_done: 0,
        minutes_done: 0,
        earned_paise: 0,
        booked_paise: 0,
        collected_paise: 0,
      }
    ),
  };
}
