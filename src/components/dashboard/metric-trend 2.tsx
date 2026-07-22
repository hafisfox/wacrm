// ============================================================
// MetricTrend + Sparkline
//
// Context for the metric tiles. Per the dataviz form heuristic a
// single headline number IS the right form here — the sparkline is
// context, not a chart, so it carries no axes, no grid, and no
// tooltip. Its job is shape ("climbing", "flat", "fell off a cliff"),
// which is exactly what a bare integer could never convey.
//
// Server-rendered inline SVG rather than recharts: no client bundle,
// no hydration, no ResponsiveContainer measuring pass for a 20px-tall
// decoration.
// ============================================================

import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SaluDelta } from '@/lib/salu/queries';

/**
 * Change against the same weekday last week.
 *
 * Direction is stated with an icon and a sign as well as colour —
 * colour alone is never the encoding.
 */
export function MetricTrend({
  delta,
  invert = false,
}: {
  delta: SaluDelta;
  /** For metrics where down is good (pending deposits, exceptions). */
  invert?: boolean;
}) {
  const { current, previous } = delta;

  // No baseline to compare against; claiming "+100%" from zero would
  // be noise dressed up as insight.
  if (!previous && !current) return null;

  const diff = current - previous;
  const pct = previous ? Math.round((diff / previous) * 100) : null;
  const flat = diff === 0;
  const good = invert ? diff < 0 : diff > 0;

  const Icon = flat ? ArrowRight : diff > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
        flat ? 'text-muted-foreground' : good ? 'text-success' : 'text-warning'
      )}
      title="Compared with the same weekday last week"
    >
      <Icon className="size-3" aria-hidden />
      {flat
        ? 'same as last week'
        : pct === null
          ? `+${current} vs none last week`
          : `${diff > 0 ? '+' : ''}${pct}% vs last week`}
    </span>
  );
}

/**
 * Bare trend line. `values` is oldest → newest.
 *
 * `preserveAspectRatio="none"` lets the 100×24 viewBox stretch to the
 * tile width; stroke width is unaffected by that scaling because
 * `vector-effect` keeps it in user units.
 */
export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series would divide by zero; draw it mid-height instead.
  const span = max - min || 1;
  const stepX = 100 / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      // SVG y grows downward, so invert. 2px padding top and bottom
      // keeps the stroke from clipping at the extremes.
      const y = 22 - ((v - min) / span) * 20;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={cn('h-6 w-full', className)}
      // Decorative: the number above it and the table in the trends
      // panel below both carry the actual data.
      aria-hidden
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
