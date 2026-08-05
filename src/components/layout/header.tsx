'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getDashboardPageTitle } from '@/lib/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AccountMenuItems,
  ACCOUNT_MENU_CONTENT_CLASS,
} from '@/components/layout/account-menu';

export function Header() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const title = getDashboardPageTitle(pathname);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  return (
    <header className="border-border bg-background/95 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-3 border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:h-14 lg:px-6 lg:pt-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground hidden text-[10px] font-semibold tracking-[0.14em] uppercase sm:block">
            Salu Salon
          </p>
          <h1 className="text-foreground truncate text-base font-semibold sm:text-lg">
            {title}
          </h1>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="ops-focus-ring hover:bg-muted/70 data-popup-open:bg-muted/70 flex min-h-11 min-w-11 items-center gap-2 rounded-md px-1 py-1 transition-colors sm:gap-3 sm:pr-3 sm:pl-1"
          aria-label="Open account menu"
        >
          <Avatar className="size-8">
            {profile?.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt={profile.full_name ?? 'Avatar'}
              />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="text-foreground hidden text-sm font-medium sm:inline">
            {profile?.full_name ?? 'User'}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className={ACCOUNT_MENU_CONTENT_CLASS}
        >
          <div className="px-2 py-1.5">
            <p className="text-foreground truncate text-sm font-medium">
              {profile?.full_name ?? 'User'}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {profile?.email ?? ''}
            </p>
          </div>
          <DropdownMenuSeparator className="bg-muted" />
          <AccountMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
