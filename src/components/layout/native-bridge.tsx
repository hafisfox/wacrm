'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** Android-only navigation policy for the remote Next.js shell. */
export function NativeBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openConversation = searchParams.has('conversation');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let removeListener: (() => Promise<void>) | undefined;

    void App.addListener('backButton', () => {
      if (pathname === '/inbox' && openConversation) {
        router.replace('/inbox', { scroll: false });
        return;
      }
      if (pathname !== '/dashboard') {
        router.push('/dashboard');
        return;
      }
      void App.exitApp();
    }).then((handle) => {
      if (cancelled) void handle.remove();
      else removeListener = handle.remove;
    });

    return () => {
      cancelled = true;
      if (removeListener) void removeListener();
    };
  }, [openConversation, pathname, router]);

  return null;
}
