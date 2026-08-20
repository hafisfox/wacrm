'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Conversation, ConversationStatus } from '@/types';
import {
  AlertTriangle,
  CheckCheck,
  ChevronDown,
  CircleDot,
  Clock3,
  RefreshCw,
  Search,
  SearchX,
} from 'lucide-react';
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

const STATUS_META: Record<
  ConversationStatus,
  { label: string; icon: typeof CircleDot; className: string }
> = {
  open: { label: 'Open', icon: CircleDot, className: 'text-chat-accent' },
  pending: { label: 'Pending', icon: Clock3, className: 'text-amber-300' },
  closed: { label: 'Closed', icon: CheckCheck, className: 'text-chat-muted' },
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
  const [loadError, setLoadError] = useState('');
  const [retryToken, setRetryToken] = useState(0);

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
        setLoadError(
          'Conversations could not be refreshed. Check your connection and try again.'
        );
        setLoading(false);
        return;
      }

      setLoadError('');
      onConversationsLoadedRef.current(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken, retryToken]);

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
  const hasActiveQuery = filter !== 'all' || Boolean(search.trim());
  const needsReplyCount = conversations.filter(
    (conversation) =>
      conversation.bot_paused ||
      conversation.handoff_state === 'requested' ||
      conversation.handoff_state === 'active'
  ).length;

  const clearQuery = useCallback(() => {
    setSearch('');
    setFilter('all');
  }, []);

  const retry = useCallback(() => {
    setLoading(conversations.length === 0);
    setLoadError('');
    setRetryToken((token) => token + 1);
  }, [conversations.length]);

  return (
    <div className="border-chat-line bg-chat-panel flex h-full w-full flex-col border-r lg:w-[360px]">
      <div className="border-chat-line flex h-[61px] shrink-0 items-center border-b px-4">
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <h1 className="text-chat-ink text-lg font-semibold">Messages</h1>
          {conversations.length ? (
            <p className="text-chat-muted shrink-0 text-[11px] tabular-nums">
              {conversations.length.toLocaleString('en-IN')}{' '}
              {conversations.length === CONVERSATION_PAGE_SIZE
                ? 'most recent'
                : conversations.length === 1
                  ? 'conversation'
                  : 'conversations'}
            </p>
          ) : null}
        </div>
      </div>
      {/* Search + Filter */}
      <div className="border-chat-line shrink-0 space-y-3 border-b p-3">
        <div className="relative">
          <Search
            className="text-chat-muted absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={handleSearchChange}
            aria-label="Search conversations"
            placeholder="Search conversations"
            className="bg-chat-surface text-chat-ink placeholder-chat-muted h-11 rounded-full border-transparent pl-11 text-sm focus:border-transparent focus:ring-0"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setFilter((current) =>
                current === 'needs_human' ? 'all' : 'needs_human'
              )
            }
            aria-pressed={filter === 'needs_human'}
            className={cn(
              'focus-visible:outline-chat-accent inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              filter === 'needs_human'
                ? 'border-chat-accent/40 bg-chat-accent/10 text-chat-accent'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20'
            )}
          >
            Needs your reply
            <span className="rounded-full bg-current/15 px-1.5 py-0.5 tabular-nums">
              {needsReplyCount}
            </span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="border-chat-surface-strong text-chat-ink-3 hover:bg-chat-surface hover:text-chat-ink focus-visible:outline-chat-accent inline-flex min-h-11 items-center justify-center gap-1 rounded-full border px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              {activeFilter?.label ?? 'All'}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-chat-line bg-chat-surface"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'min-h-11 text-sm',
                    filter === opt.value
                      ? 'text-chat-accent'
                      : 'text-chat-ink-2'
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-chat-muted text-[11px]" aria-live="polite">
          {filtered.length.toLocaleString('en-IN')} shown
          {hasActiveQuery ? ' for the current search and filter' : ''}
        </p>

        {loadError && conversations.length ? (
          <div
            className="border-chat-line bg-chat-canvas/40 text-chat-ink-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
            role="status"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1">{loadError}</span>
            <button
              type="button"
              onClick={retry}
              className="text-chat-accent focus-visible:outline-chat-accent shrink-0 rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div
            className="text-chat-muted flex items-center justify-center gap-3 py-12 text-sm"
            role="status"
          >
            <div
              className="border-chat-accent h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
              aria-hidden
            />
            Loading conversations…
          </div>
        ) : loadError && conversations.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <AlertTriangle className="size-6 text-amber-300" aria-hidden />
            <p className="text-chat-ink mt-3 text-sm font-medium">
              Conversations could not load
            </p>
            <p className="text-chat-muted mt-1 max-w-xs text-sm leading-6">
              Check your connection, then try again. No conversation data has
              been changed.
            </p>
            <button
              type="button"
              onClick={retry}
              className="border-chat-line-strong text-chat-ink hover:bg-chat-surface focus-visible:outline-chat-accent mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <RefreshCw className="size-4" aria-hidden />
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <SearchX className="text-chat-muted size-6" aria-hidden />
            <p className="text-chat-ink mt-3 text-sm font-medium">
              {hasActiveQuery
                ? 'No conversations match'
                : 'No conversations yet'}
            </p>
            <p className="text-chat-muted mt-1 max-w-xs text-sm leading-6">
              {hasActiveQuery
                ? 'Clear the search and filter to return to every conversation.'
                : 'New customer conversations will appear here automatically.'}
            </p>
            {hasActiveQuery ? (
              <button
                type="button"
                onClick={clearQuery}
                className="border-chat-line-strong text-chat-ink hover:bg-chat-surface focus-visible:outline-chat-accent mt-4 min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Clear search and filter
              </button>
            ) : null}
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
  const status = STATUS_META[conversation.status];
  const StatusIcon = status.icon;

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
              <span
                className="bg-chat-accent text-chat-panel flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold"
                aria-label={`${conversation.unread_count} unread ${conversation.unread_count === 1 ? 'message' : 'messages'}`}
              >
                {conversation.unread_count}
              </span>
            )}
            <span title={status.label} className="inline-flex">
              <StatusIcon className={cn('size-3.5', status.className)} />
              <span className="sr-only">{status.label}</span>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
