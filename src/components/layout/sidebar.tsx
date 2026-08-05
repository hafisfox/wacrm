'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useTotalUnread } from '@/hooks/use-total-unread';
import {
  CalendarCheck,
  Crown,
  LayoutDashboard,
  MessageSquare,
  Scissors,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
} from 'lucide-react';
import type { AccountRole } from '@/lib/auth/roles';

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; label: string; className: string }
> = {
  owner: {
    icon: Crown,
    label: 'Owner',
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  admin: {
    icon: Shield,
    label: 'Admin',
    // Primary-tinted: significant but not as scarce as owner.
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  agent: {
    icon: UserCog,
    label: 'Agent',
    // Neutral slate: the operational default.
    className: 'border-border bg-muted text-foreground/80',
  },
  viewer: {
    icon: User,
    label: 'Viewer',
    // Muted slate: read-only role; visually quieter than agent.
    className: 'border-border bg-card text-muted-foreground',
  },
};
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AccountMenuItems,
  ACCOUNT_MENU_CONTENT_CLASS,
} from '@/components/layout/account-menu';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { href: '/salon-control', label: 'Salon', icon: Scissors },
  { href: '/inbox', label: 'Messages', icon: MessageSquare },
  { href: '/contacts', label: 'Customers', icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole } = useAuth();
  const totalUnread = useTotalUnread();
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading && !!account?.name && account.name !== profile?.full_name;

  return (
    <aside
      className="border-sidebar-border bg-sidebar hidden h-full w-60 shrink-0 flex-col border-r lg:flex"
      aria-label="Primary"
    >
      {/* Desktop brand row. Phone navigation is intentionally handled by
            the bottom bar, where every destination is thumb-reachable. */}
      <div className="border-sidebar-border flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
        <Link
          href="/dashboard"
          className="ops-focus-ring flex items-center gap-2 rounded-md"
        >
          <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
            <CalendarCheck className="h-4 w-4" />
          </div>
          <span className="text-foreground text-sm font-semibold">
            Salu Salon
          </span>
        </Link>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    // Taller on mobile so fingers can hit the row reliably (≥44px).
                    'ops-focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:min-h-0 lg:py-2',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {item.href === '/inbox' && totalUnread > 0 ? (
                    <span
                      className="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                      // The bare number is meaningless to a screen
                      // reader, so name what it counts.
                      aria-label={`${totalUnread} conversation${totalUnread === 1 ? '' : 's'} with unread messages`}
                    >
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  ) : null}
                  {item.beta && (
                    <span
                      aria-label="Beta feature"
                      className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-amber-300 uppercase"
                    >
                      Beta
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-sidebar-border shrink-0 border-t p-3">
        {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
        {showAccountStrip && account?.name ? (
          <div className="text-muted-foreground mb-2 flex items-center gap-2 px-3 text-xs">
            <UsersRound className="size-3.5 shrink-0" />
            {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
            <span className="truncate" title={account.name}>
              {account.name}
            </span>
            {accountRole
              ? // Always render the chip — owners used to be
                // invisible here, which made them indistinguishable
                // from admins at a glance. Now everyone sees their
                // role (with a colour cue) regardless of tier.
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${meta.className}`}
                    >
                      <Icon className="size-3" />
                      {meta.label}
                    </span>
                  );
                })()
              : null}
          </div>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger className="ops-focus-ring hover:bg-sidebar-accent/60 data-popup-open:bg-sidebar-accent/60 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors">
            <Avatar className="size-8 shrink-0">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? 'Avatar'}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {profile?.full_name?.charAt(0)?.toUpperCase() ??
                  profile?.email?.charAt(0)?.toUpperCase() ??
                  'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-medium">
                {profile?.full_name ?? 'User'}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {profile?.email ?? ''}
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="top"
            sideOffset={6}
            className={ACCOUNT_MENU_CONTENT_CLASS}
          >
            <AccountMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
