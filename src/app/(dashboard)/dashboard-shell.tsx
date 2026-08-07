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
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="bg-background flex h-screen items-center justify-center">
        <div
          className="flex flex-col items-center gap-3"
          role="status"
          aria-live="polite"
        >
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="bg-background flex h-dvh min-h-0 overflow-hidden">
      <NativeBridge />
      <Sidebar totalUnread={totalUnread} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main
          className={
            isInbox
              ? 'flex-1 overflow-hidden'
              : 'flex-1 overflow-y-auto overscroll-y-contain p-3 min-[390px]:p-4 sm:p-6'
          }
        >
          {children}
        </main>
        <MobileNav totalUnread={totalUnread} />
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
