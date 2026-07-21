'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getDashboardPageTitle } from '@/lib/navigation';
import { LogOut, Menu, Settings as SettingsIcon, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const title = getDashboardPageTitle(pathname);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  return (
    <header className="border-border bg-background/95 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger — mobile only. 44×44 hit target per Apple HIG. */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="ops-focus-ring text-foreground/80 hover:bg-muted hover:text-foreground flex h-11 w-11 items-center justify-center rounded-md transition-colors lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-muted-foreground hidden text-[10px] font-semibold tracking-[0.14em] uppercase sm:block">
            Salu Operations
          </p>
          <h1 className="text-foreground truncate text-base font-semibold sm:text-lg">
            {title}
          </h1>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="ops-focus-ring hover:bg-muted/70 data-popup-open:bg-muted/70 flex items-center gap-2 rounded-md px-1 py-1 transition-colors sm:gap-3 sm:pr-3 sm:pl-1"
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
          className="bg-card text-foreground ring-border min-w-56"
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
          <DropdownMenuItem
            render={
              <Link
                href="/settings?tab=profile"
                className="text-foreground focus:bg-muted focus:text-foreground"
              />
            }
          >
            <User className="size-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link
                href="/settings?tab=whatsapp"
                className="text-foreground focus:bg-muted focus:text-foreground"
              />
            }
          >
            <SettingsIcon className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-muted" />
          <DropdownMenuItem
            onClick={signOut}
            className="text-foreground focus:bg-muted focus:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
