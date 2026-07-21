import { cn } from '@/lib/utils';

/**
 * Loading placeholder that mirrors the shape of the content it stands
 * in for. Prefer this over a centred spinner: a spinner tells the user
 * "something is happening", a skeleton tells them *what* is coming and
 * keeps the layout from jumping when it arrives.
 *
 * Respects `prefers-reduced-motion` via the global rule in globals.css,
 * which flattens the pulse to a static tint.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-muted animate-pulse rounded-md', className)}
      {...props}
    />
  );
}

/**
 * A block of stacked text lines. `lines` controls the count; the last
 * line is short so the block reads as prose rather than a solid bar.
 */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText };
