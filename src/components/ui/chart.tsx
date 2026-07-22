'use client';

// ============================================================
// Chart primitives
//
// A thin, token-aware layer over recharts. Everything here exists so
// individual charts don't re-declare colours, grid weights, or tooltip
// chrome — see the CHART PALETTE block in globals.css for the ramp and
// the validator command that proves it.
//
// House rules encoded here (from the dataviz method):
//   - Recessive grid and axes; the data is the loudest thing.
//   - Thin marks, 4px rounded data-ends anchored to the baseline.
//   - Colour follows the entity, never its rank — callers pass an
//     explicit slot rather than an index into a rotating list.
//   - Never a dual-axis chart. Two measures of different scale are two
//     charts, which is why nothing here accepts a second YAxis.
// ============================================================

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Validated categorical slots. See globals.css for provenance. */
export const CHART_COLORS = {
  1: 'var(--chart-1)',
  2: 'var(--chart-2)',
  3: 'var(--chart-3)',
  4: 'var(--chart-4)',
  5: 'var(--chart-5)',
} as const;

export type ChartSlot = keyof typeof CHART_COLORS;

export const CHART_GRID = 'var(--chart-grid)';
export const CHART_AXIS_INK = 'var(--muted-foreground)';

/** Shared axis styling — small, quiet, tabular. */
export const axisProps = {
  stroke: CHART_AXIS_INK,
  tick: { fill: CHART_AXIS_INK, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Tooltip body. Values wear text tokens, never the series colour — a
 * small swatch beside the label carries identity instead, so the
 * numbers stay legible at any contrast.
 */
export function ChartTooltipBody({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; color?: string }>;
}) {
  return (
    <div className="border-border bg-popover text-popover-foreground rounded-lg border px-2.5 py-2 text-xs shadow-lg">
      <p className="text-foreground font-medium">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            {row.color ? (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: row.color }}
              />
            ) : null}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="text-foreground ml-auto font-medium tabular-nums">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Figure wrapper: title, optional description, and the plot.
 *
 * `tableView` is not optional decoration — every chart ships an
 * equivalent table so the data is reachable without colour or a
 * pointer. It renders inside a <details>, collapsed by default.
 */
export function ChartFigure({
  title,
  description,
  children,
  tableView,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  tableView?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn('min-w-0', className)}>
      <figcaption className="mb-3">
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        ) : null}
      </figcaption>
      {children}
      {tableView ? (
        <details className="mt-3">
          <summary className="text-muted-foreground hover:text-foreground ops-focus-ring cursor-pointer rounded text-xs">
            View as table
          </summary>
          <div className="mt-2 overflow-x-auto">{tableView}</div>
        </details>
      ) : null}
    </figure>
  );
}

/** Minimal table used by the `tableView` slot above. */
export function ChartTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-muted-foreground border-border border-b">
          {columns.map((c, i) => (
            <th
              key={c}
              scope="col"
              className={cn('py-1.5 pr-3 font-medium', i > 0 && 'text-right')}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-border divide-y">
        {rows.map((row) => (
          <tr key={String(row[0])}>
            {row.map((cell, i) => (
              <td
                key={i}
                className={cn(
                  'py-1.5 pr-3',
                  i === 0
                    ? 'text-foreground/80'
                    : 'text-foreground text-right tabular-nums'
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
