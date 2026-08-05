'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Conversation, ConversationStatus } from '@/types';
import { Search, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Input } from '@/components/ui/input';
import { humanizeSaluTranscriptText } from '@/lib/salu/transcript';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

/**
 * How many conversations the inbox loads. Ordered newest-activity
 * first, so the cut falls on threads nobody has touched in a long
 * while — and search still reaches them via the customers page.
 */
const CONVERSATION_PAGE_SIZE = 200;

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: 'bg-chat-accent',
  pending: 'bg-amber-500',
  closed: 'bg-chat-muted',
};

const FILTER_OPTIONS: {
  label: string;
  value: ConversationStatus | 'all' | 'unread' | 'needs_human';
}[] = [
  { label: 'All', value: 'all' },
  { label: 'Needs your reply', value: 'needs_human' },
  { label: 'Unread', value: 'unread' },
  { label: 'Open', value: 'open' },
  { label: 'Pending', value: 'pending' },
  { label: 'Closed', value: 'closed' },
];

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<
    ConversationStatus | 'all' | 'unread' | 'needs_human'
  >('all');
  const [loading, setLoading] = useState(true);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      // Bounded. This used to fetch every conversation the account had
      // ever had, capped only by PostgREST's own default — so the
      // inbox got slower forever as the salon accumulated customers.
      const { data, error } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*)')
        .order('last_message_at', { ascending: false })
        .limit(CONVERSATION_PAGE_SIZE);

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error('Failed to fetch conversations:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter === 'needs_human') {
      result = result.filter(
        (c) =>
          c.bot_paused ||
          c.handoff_state === 'requested' ||
          c.handoff_state === 'active'
      );
    } else if (filter === 'unread') {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter !== 'all') {
      result = result.filter((c) => c.status === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? '';
        const phone = c.contact?.phone?.toLowerCase() ?? '';
        const lastMsg =
          humanizeSaluTranscriptText(c.last_message_text)?.toLowerCase() ?? '';
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, filter, search]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    <div className="border-chat-line bg-chat-panel flex h-full w-full flex-col border-r lg:w-[360px]">
      <div className="border-chat-line flex h-[61px] shrink-0 items-center border-b px-4">
        <div>
          <p className="text-chat-muted text-[10px] font-semibold tracking-[0.14em] uppercase">
            Customer conversations
          </p>
          <h2 className="text-chat-ink text-lg font-semibold">Messages</h2>
        </div>
      </div>
      {/* Search + Filter */}
      <div className="border-chat-line shrink-0 space-y-3 border-b p-3">
        <div className="relative">
          <Search className="text-chat-muted absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={handleSearchChange}
            aria-label="Search conversations"
            placeholder="Search conversations"
            className="bg-chat-surface text-chat-ink placeholder-chat-muted h-11 rounded-full border-transparent pl-11 text-sm focus:border-transparent focus:ring-0"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="border-chat-surface-strong text-chat-ink-3 hover:bg-chat-surface hover:text-chat-ink focus-visible:outline-chat-accent inline-flex h-11 items-center justify-center gap-1 rounded-full border px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            {activeFilter?.label ?? 'All'}
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="border-chat-line bg-chat-surface"
          >
            {FILTER_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={cn(
                  'min-h-11 text-sm',
                  filter === opt.value ? 'text-chat-accent' : 'text-chat-ink-2'
                )}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-chat-muted text-sm">No conversations found</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || 'Unknown';
  const initials = displayName.charAt(0).toUpperCase();

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : '';
  const preview = humanizeSaluTranscriptText(conversation.last_message_text);

  return (
    <button
      onClick={handleClick}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'hover:bg-chat-surface focus-visible:outline-chat-accent flex w-full items-start gap-3 px-3 py-3 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        isActive && 'bg-chat-surface-strong'
      )}
    >
      {/* Avatar */}
      <div className="bg-chat-surface-strong text-chat-ink flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-medium">
        {contact?.avatar_url ? (
          <Image
            src={contact.avatar_url}
            alt={displayName}
            width={48}
            height={48}
            unoptimized
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-chat-ink truncate text-[15px] font-medium">
              {displayName}
            </span>
            {(conversation.bot_paused ||
              conversation.handoff_state === 'requested' ||
              conversation.handoff_state === 'active') && (
              <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-red-300 uppercase">
                Needs your reply
              </span>
            )}
          </div>
          <span className="text-chat-muted shrink-0 text-[11px]">
            {timeAgo}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-chat-muted truncate text-sm">
            {preview || 'No messages yet'}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.unread_count > 0 && (
              <span className="bg-chat-accent text-chat-panel flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
                {conversation.unread_count}
              </span>
            )}
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                STATUS_COLORS[conversation.status]
              )}
              title={conversation.status}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
