import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The "nothing here" surface, standardised.
 *
 * Every list in the console previously hand-rolled its own version, so
 * an empty inbox and an empty customer list looked like different
 * products. More importantly: several of them could not distinguish
 * *genuinely empty* from *filtered down to nothing*, which reads as a
 * bug to the user. `action` exists for exactly that — pass a "Clear
 * filters" button when the emptiness is the filter's fault.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center px-6 py-10 text-center',
        className
      )}
    >
      {Icon ? (
        <div className="bg-muted text-muted-foreground mb-3 flex size-10 items-center justify-center rounded-xl">
          <Icon className="size-5" aria-hidden />
        </div>
      ) : null}
      <p className="text-foreground text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm leading-6">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
