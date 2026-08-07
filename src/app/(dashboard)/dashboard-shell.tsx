'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { NativeBridge } from '@/components/layout/native-bridge';

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isInbox = pathname.startsWith('/inbox');
  // Sidebar and MobileNav are both mounted at every viewport size; CSS only
  // controls which one is visible. Keep the realtime subscription here so
  // those two views share one channel instead of subscribing twice to the
  // same Supabase topic (the second subscription throws at runtime).
  const totalUnread = useTotalUnread();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <ShellStatus label="Opening your salon daybook…" />;
  }

  if (!user) return <ShellStatus label="Taking you to sign in…" />;

  return (
    <div className="bg-background flex h-dvh min-h-0 overflow-hidden">
      <NativeBridge />
      <a
        href="#main-content"
        className="ops-focus-ring bg-primary text-primary-foreground fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg px-3 py-2 text-sm font-semibold transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <Sidebar totalUnread={totalUnread} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main
          id="main-content"
          tabIndex={-1}
          className={
            isInbox
              ? 'flex-1 overflow-hidden focus:outline-none'
              : 'flex-1 overflow-y-auto overscroll-y-contain p-3 focus:outline-none min-[390px]:p-4 sm:p-6'
          }
        >
          {children}
        </main>
        <MobileNav totalUnread={totalUnread} />
      </div>
    </div>
  );
}

function ShellStatus({ label }: { label: string }) {
  return (
    <div className="bg-background flex h-dvh items-center justify-center px-6">
      <div
        className="flex flex-col items-center gap-3 text-center"
        role="status"
        aria-live="polite"
      >
        <div
          className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          aria-hidden
        />
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
