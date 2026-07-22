'use client';

// ============================================================
// TrendsPanel
//
// The dashboard had no sense of time: every number was a bare integer
// for right now, with nothing to say whether 8 bookings was a good day
// or a collapse. These are the three questions the operational panels
// could never answer.
//
// Form choices follow the dataviz method:
//   - Bookings and revenue are two measures on different scales, so
//     they are TWO charts sharing an x-axis — never a dual-axis chart.
//   - The funnel and stylist load use horizontal bars because their
//     labels are words, not dates.
//   - Single-series charts get no legend; the title names the series.
//   - Every figure ships a table view.
// ============================================================

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CHART_COLORS,
  CHART_GRID,
  ChartFigure,
  ChartTable,
  ChartTooltipBody,
  axisProps,
} from '@/components/ui/chart';
import { formatPaise } from '@/lib/salu/format';
import type { SaluDashboardTrends } from '@/lib/salu/queries';

/** "12 Jul" — compact enough for a 14-tick axis. */
function shortDay(iso: string) {
  const parsed = new Date(`${iso}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
  }).format(parsed);
}

function count(value: number) {
  return value.toLocaleString('en-IN');
}

export function TrendsPanel({ trends }: { trends: SaluDashboardTrends }) {
  const daily = trends.daily.map((point) => ({
    ...point,
    label: shortDay(point.day),
    revenue: point.revenue_paise / 100,
  }));

  const hasDaily = daily.some(
    (d) => d.bookings_created > 0 || d.revenue_paise > 0
  );
  const funnel = trends.depositFunnel.filter((row) => row.label);
  const stylists = trends.stylistLoad;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartFigure
          title="Bookings created"
          description="Last 14 days"
          tableView={
            <ChartTable
              columns={['Day', 'Created', 'Confirmed']}
              rows={daily.map((d) => [
                d.label,
                count(d.bookings_created),
                count(d.bookings_confirmed),
              ])}
            />
          }
        >
          {hasDaily ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={daily}
                margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
              >
                <CartesianGrid
                  stroke={CHART_GRID}
                  vertical={false}
                  strokeDasharray="2 4"
                />
                <XAxis dataKey="label" {...axisProps} interval="preserveEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={40} />
                <Tooltip
                  cursor={{ fill: CHART_GRID }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <ChartTooltipBody
                        title={String(label)}
                        rows={[
                          {
                            label: 'Created',
                            value: count(Number(payload[0].value ?? 0)),
                            color: CHART_COLORS[1],
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar
                  dataKey="bookings_created"
                  fill={CHART_COLORS[1]}
                  // Rounded data-end anchored to the baseline.
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty text="No bookings recorded in the last 14 days." />
          )}
        </ChartFigure>

        <ChartFigure
          title="Deposits collected"
          description="Last 14 days"
          tableView={
            <ChartTable
              columns={['Day', 'Collected']}
              rows={daily.map((d) => [d.label, formatPaise(d.revenue_paise)])}
            />
          }
        >
          {hasDaily ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={daily}
                margin={{ top: 4, right: 4, bottom: 0, left: -6 }}
              >
                <CartesianGrid
                  stroke={CHART_GRID}
                  vertical={false}
                  strokeDasharray="2 4"
                />
                <XAxis dataKey="label" {...axisProps} interval="preserveEnd" />
                <YAxis
                  {...axisProps}
                  width={52}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                  }
                />
                <Tooltip
                  cursor={{ stroke: CHART_GRID }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <ChartTooltipBody
                        title={String(label)}
                        rows={[
                          {
                            label: 'Collected',
                            value: formatPaise(
                              Number(payload[0].value ?? 0) * 100
                            ),
                            color: CHART_COLORS[3],
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS[3]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty text="No deposits collected in the last 14 days." />
          )}
        </ChartFigure>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartFigure
          title="Deposit outcomes"
          description="Last 30 days — where holds ended up"
          tableView={
            <ChartTable
              columns={['Outcome', 'Count']}
              rows={funnel.map((row) => [row.label, count(row.value)])}
            />
          }
        >
          {funnel.some((row) => row.value > 0) ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={funnel}
                layout="vertical"
                margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  stroke={CHART_GRID}
                  horizontal={false}
                  strokeDasharray="2 4"
                />
                <XAxis type="number" {...axisProps} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  {...axisProps}
                  width={92}
                />
                <Tooltip
                  cursor={{ fill: CHART_GRID }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <ChartTooltipBody
                        title={String(label)}
                        rows={[
                          {
                            label: 'Holds',
                            value: count(Number(payload[0].value ?? 0)),
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {/* Outcome, not rank — "Needs review" stays red
                      however many there are. Status hues are reserved
                      and always paired with their label. */}
                  {funnel.map((row) => (
                    <Cell
                      key={row.label}
                      fill={
                        row.label === 'Paid'
                          ? 'var(--success)'
                          : row.label === 'Needs review'
                            ? 'var(--destructive)'
                            : row.label === 'Expired'
                              ? 'var(--warning)'
                              : CHART_COLORS[1]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty text="No deposit activity in the last 30 days." />
          )}
        </ChartFigure>

        <ChartFigure
          title="Stylist load"
          description="Booked hours over the next 14 days"
          tableView={
            <ChartTable
              columns={['Stylist', 'Hours']}
              rows={stylists.map((row) => [
                row.label,
                (row.value / 60).toFixed(1),
              ])}
            />
          }
        >
          {stylists.length ? (
            <ResponsiveContainer
              width="100%"
              height={Math.max(140, stylists.length * 28)}
            >
              <BarChart
                data={stylists.map((row) => ({
                  ...row,
                  hours: Number((row.value / 60).toFixed(2)),
                }))}
                layout="vertical"
                margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  stroke={CHART_GRID}
                  horizontal={false}
                  strokeDasharray="2 4"
                />
                <XAxis type="number" {...axisProps} />
                <YAxis
                  type="category"
                  dataKey="label"
                  {...axisProps}
                  width={92}
                />
                <Tooltip
                  cursor={{ fill: CHART_GRID }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <ChartTooltipBody
                        title={String(label)}
                        rows={[
                          {
                            label: 'Booked',
                            value: `${Number(payload[0].value ?? 0).toFixed(1)} h`,
                            color: CHART_COLORS[5],
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar
                  dataKey="hours"
                  fill={CHART_COLORS[5]}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty text="No active stylists to chart." />
          )}
        </ChartFigure>
      </div>
    </div>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="border-border text-muted-foreground flex h-[140px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-xs">
      {text}
    </div>
  );
}
