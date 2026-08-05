'use client';

// ============================================================
// AccountMenuItems
//
// The Profile / Settings / Sign out block, shared by the header
// dropdown and the sidebar dropdown. Those two used to carry
// byte-identical copies, so a change to one silently drifted from the
// other.
//
// Only the *items* are shared. The triggers stay local on purpose:
// the header shows an inline avatar + name, the sidebar a full-width
// stacked avatar + name + email, and collapsing those into one
// component behind a variant flag would cost more than the
// duplication saves.
// ============================================================

import Link from 'next/link';
import { LogOut, Settings as SettingsIcon, User } from 'lucide-react';

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';

const ITEM_CLASS = 'text-foreground focus:bg-muted focus:text-foreground';

export function AccountMenuItems({
  onNavigate,
}: {
  /** Called when a link is followed — the sidebar uses it to close its
   *  mobile drawer. */
  onNavigate?: () => void;
}) {
  const { signOut } = useAuth();

  return (
    <>
      <DropdownMenuItem
        render={
          <Link
            href="/settings?tab=profile"
            onClick={onNavigate}
            className={ITEM_CLASS}
          />
        }
      >
        <User className="size-4" />
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem
        render={
          <Link href="/settings" onClick={onNavigate} className={ITEM_CLASS} />
        }
      >
        <SettingsIcon className="size-4" />
        Settings
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-muted" />
      <DropdownMenuItem onClick={signOut} className={ITEM_CLASS}>
        <LogOut className="size-4" />
        Sign out
      </DropdownMenuItem>
    </>
  );
}

/** Shared popover surface styling for both account dropdowns. */
export const ACCOUNT_MENU_CONTENT_CLASS =
  'bg-card text-foreground ring-border min-w-56';
