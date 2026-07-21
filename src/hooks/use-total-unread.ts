'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Conversation } from '@/types';

/**
 * Number of conversations carrying unread inbound messages. Drives the
 * badge on the sidebar's Inbox entry so an agent working elsewhere in
 * the console can see when something needs them.
 *
 * Scoped to the current account both on the initial read and on the
 * realtime subscription. RLS already prevents cross-account leakage,
 * but without an explicit filter the server pushes every conversation
 * row the policy allows and we discard most of them on the client.
 *
 * Runs on its own channel, distinct from the inbox page's, so the two
 * can coexist without sharing state.
 */
export function useTotalUnread(): number {
  const { accountId } = useAuth();
  const [total, setTotal] = useState(0);

  // Live mirror of {conversationId: unread_count}, so an event can
  // adjust the total without refetching.
  const countsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!accountId) return;

    const supabase = createClient();
    let cancelled = false;

    const recount = () => {
      let sum = 0;
      for (const n of countsRef.current.values()) if (n > 0) sum += 1;
      setTotal(sum);
    };

    (async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, unread_count')
        .eq('account_id', accountId)
        // Only unread rows matter here, so let the database do the
        // filtering rather than pulling the whole table to count a
        // handful. The bound is a backstop.
        .gt('unread_count', 0)
        .limit(500);
      if (cancelled || error || !data) return;

      const map = new Map<string, number>();
      for (const row of data as { id: string; unread_count: number }[]) {
        map.set(row.id, row.unread_count ?? 0);
      }
      countsRef.current = map;
      recount();
    })();

    const channel = supabase
      .channel(`total-unread:${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          const map = countsRef.current;
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<Conversation>;
            if (oldRow.id) map.delete(oldRow.id);
          } else {
            const row = payload.new as Conversation;
            const n = row.unread_count ?? 0;
            // Drop read conversations from the map rather than storing
            // zeroes — the initial read only loads unread rows, so
            // keeping them would grow it without bound over a session.
            if (n > 0) map.set(row.id, n);
            else map.delete(row.id);
          }
          recount();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      // Reset here rather than in the next run's effect body — a
      // synchronous setState during an effect is a cascading render
      // under React 19's rules. Cleanup runs on account change and on
      // unmount, which is exactly when the count stops applying.
      countsRef.current = new Map();
      setTotal(0);
      supabase.removeChannel(channel);
    };
  }, [accountId]);

  // Signed-out / pre-profile renders have nothing to report.
  return accountId ? total : 0;
}
