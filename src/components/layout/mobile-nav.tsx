'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, Scissors, Users } from 'lucide-react';

import { useTotalUnread } from '@/hooks/use-total-unread';
import { cn } from '@/lib/utils';

const mobileNavItems = [
  { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { href: '/inbox', label: 'Messages', icon: MessageSquare },
  { href: '/salon-control', label: 'Salon', icon: Scissors },
  { href: '/contacts', label: 'Customers', icon: Users },
] as const;

/**
 * Primary navigation for the owner while they are moving around the salon.
 * It stays in the shell's flex layout instead of floating over content, so
 * chat composers and forms never end up behind it on short screens.
 */
export function MobileNav() {
  const pathname = usePathname();
  const totalUnread = useTotalUnread();

  return (
    <nav
      aria-label="Main navigation"
      className="border-border bg-background/95 shrink-0 border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {mobileNavItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const isMessages = item.href === '/inbox';

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'ops-focus-ring relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground active:bg-muted'
              )}
            >
              <span className="relative">
                <item.icon className="size-5" aria-hidden />
                {isMessages && totalUnread > 0 ? (
                  <span
                    className="bg-primary text-primary-foreground absolute -top-2 -right-3 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums"
                    aria-label={`${totalUnread} unread conversation${totalUnread === 1 ? '' : 's'}`}
                  >
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
