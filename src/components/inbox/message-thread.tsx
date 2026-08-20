'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type {
  Conversation,
  Message,
  MessageReaction,
  Contact,
  ConversationStatus,
  MessageTemplate,
  Profile,
} from '@/types';
import {
  MessageSquare,
  ChevronDown,
  UserPlus,
  Check,
  Clock,
  ArrowLeft,
  RefreshCw,
  PanelRightOpen,
  MoreHorizontal,
  PlayCircle,
  PauseCircle,
  Loader2,
} from 'lucide-react';
import { format, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageBubble } from './message-bubble';
import { MessageActions } from './message-actions';
import { MessageComposer } from './message-composer';
import { TemplatePicker } from './template-picker';
import { buildReplyPreview } from './reply-quote';
import { toast } from 'sonner';
import { fetchWithTimeout, safeJson } from '@/lib/http';

/**
 * Client-side id for an optimistic bubble, retired once the real row
 * arrives over realtime. Previously derived from `Date.now()`, which
 * collided whenever two sends landed in the same millisecond —
 * duplicate React keys on sibling rows.
 */
function tempMessageId() {
  return `temp-${crypto.randomUUID()}`;
}

/**
 * How much history the thread opens with. Deep enough that scrolling
 * back is rare, shallow enough that a two-year-old conversation does
 * not ship thousands of rows on every click.
 */
const MESSAGE_PAGE_SIZE = 100;

interface ReplyDraft {
  id: string;
  authorLabel: string;
  preview: string;
}

function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    return params[idx] ?? `{{${raw}}}`;
  });
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onAssignChange: (
    conversationId: string,
    assignedAgentId: string | null
  ) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
  /**
   * Increment to force the messages + reactions fetch effects to refire.
   * Parent bumps this on realtime reconnect / tab visibility → visible
   * so the open thread catches up on any events sent while the WS was
   * disconnected or the tab was throttled. Optional so existing callers
   * keep working.
   */
  resyncToken?: number;
  /**
   * Fired by the manual-refresh button in the thread header. The parent
   * typically bumps the same `resyncToken` it controls — this gives the
   * user a way to force a refetch when they suspect realtime missed an
   * event (or they're impatient). Optional so existing callers keep
   * working; the button is only rendered when this is provided.
   */
  onRefresh?: () => void;
  /** Called after a manual message/template send succeeds. */
  onMessageSent?: () => void;
  /** Opens Salu customer details when the persistent sidebar is hidden. */
  onOpenDetails?: () => void;
  /** Whether approved templates are available for sending. */
  templatesAvailable?: boolean;
  /** Whether this deployment can send normal replies. */
  sendingAvailable?: boolean;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const day = format(new Date(msg.created_at), 'yyyy-MM-dd');
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: {
  label: string;
  value: ConversationStatus;
  color: string;
}[] = [
  { label: 'Open', value: 'open', color: 'text-primary' },
  { label: 'Pending', value: 'pending', color: 'text-amber-400' },
  { label: 'Closed', value: 'closed', color: 'text-chat-ink-3' },
];

/**
 * WhatsApp-style doodle background applied to the chat area (both the
 * active thread and the empty state). The SVG tile lives at
 * `/public/inbox-doodle.svg`; the slate-950 colour sits underneath so
 * the doodles read as a subtle pattern rather than a stark grid.
 *
 * Defined once at module scope so the two render paths can't drift —
 * if we ever switch the asset, both spots update together.
 */
const DOODLE_BG_CLASSES =
  "bg-chat-canvas bg-[url('/inbox-doodle.svg')] bg-repeat";

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onAssignChange,
  onBack,
  resyncToken = 0,
  onRefresh,
  onMessageSent,
  onOpenDetails,
  templatesAvailable = true,
  sendingAvailable = true,
}: MessageThreadProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Starts true: a freshly-opened thread renders scrolled to the end.
  const atBottomRef = useRef(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  // Purely visual spin state for the manual-refresh button. The actual
  // refetch is fire-and-forget through `onRefresh` (which bumps the
  // parent's resyncToken); the 700ms spin is just feedback so the click
  // doesn't feel like a no-op. Cleared via the timer ref on unmount.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const handleRefreshClick = useCallback(() => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  }, [isRefreshing, onRefresh]);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  const [sessionClock, setSessionClock] = useState(() => new Date());
  const [togglingBot, setTogglingBot] = useState(false);

  // Per-contact bot switch, mirrored from the contact sidebar (which is
  // hidden below 2xl) so it's reachable at any width and in either
  // direction. `bot_paused` on the conversation is kept in sync with
  // salu.customer_sessions.human_mode by the handoff trigger, so it's
  // the authoritative state for this one contact — never a global flag.
  const botPaused =
    conversation?.bot_paused === true ||
    conversation?.handoff_state === 'requested' ||
    conversation?.handoff_state === 'active';

  const handleToggleBot = useCallback(async () => {
    const phone = contact?.phone;
    if (!phone || togglingBot) return;
    const nextHumanMode = !botPaused;
    setTogglingBot(true);
    try {
      const res = await fetchWithTimeout('/api/salu/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          human_mode: nextHumanMode,
          reason: nextHumanMode
            ? 'dashboard_pause_bot'
            : 'dashboard_resume_bot',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      toast.success(
        nextHumanMode
          ? 'You are now handling this conversation'
          : 'Automatic replies are back on'
      );
      onRefresh?.();
    } catch (err) {
      console.error('[message-thread] reply handling update failed:', err);
      toast.error('Could not update reply handling. Please try again.');
    } finally {
      setTogglingBot(false);
    }
  }, [contact?.phone, botPaused, togglingBot, onRefresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setSessionClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Profiles are bounded by RLS to rows the current user is allowed to
  // see — today that's just the current user, but the dropdown keeps the
  // shape ready for shared-team workspaces without a refactor.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to fetch profiles:', error);
          return;
        }
        setProfiles((data as Profile[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 24-hour session timer
  const sessionInfo = useMemo(() => {
    if (!messages.length) return { expired: false, remaining: '' };

    // Find last customer message
    const lastCustomerMsg = [...messages]
      .reverse()
      .find((m) => m.sender_type === 'customer');

    if (!lastCustomerMsg)
      return { expired: true, remaining: 'No customer messages' };

    const minutesSince = Math.max(
      0,
      differenceInMinutes(sessionClock, new Date(lastCustomerMsg.created_at))
    );
    const expired = minutesSince >= 24 * 60;

    if (expired) {
      return { expired: true, remaining: 'Expired' };
    }

    const minutesLeft = 24 * 60 - minutesSince;
    const hoursLeft = Math.floor(minutesLeft / 60);
    const remainingMinutes = minutesLeft % 60;
    const remaining = hoursLeft
      ? `${hoursLeft}h ${remainingMinutes}m remaining`
      : `${remainingMinutes}m remaining`;

    return { expired, remaining };
  }, [messages, sessionClock]);

  // Store latest callback in a ref so fetchMessages doesn't need to
  // depend on `onMessagesLoaded` — otherwise parent re-renders cause
  // fetchMessages to change → useEffect re-fires → refetch → realtime
  // UPDATE on conversations.unread_count → parent re-renders → LOOP.
  // The ref is written inside an effect so the mutation doesn't happen
  // during render (React 19 refs rule); consumers only read `.current`
  // inside the async fetch completion, which runs after the render.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;

  // Fetch messages whenever the selected conversation changes. Kept
  // separate from the unread-reset effect so that incoming messages
  // arriving while the thread is open don't trigger a full refetch —
  // they only flip hasUnread, which only the reset effect listens to.
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Newest-first + limit, then flipped back to chronological for
      // rendering. Ordering ascending with a limit would have taken the
      // *oldest* N — the opposite of what the thread should open on.
      // This was previously unbounded: a long-running customer thread
      // pulled its entire history on every selection.
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (cancelled) return;

      if (error) {
        console.error('Failed to fetch messages:', error);
      } else {
        onMessagesLoadedRef.current((data ?? []).slice().reverse());
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus —
    // realtime is best-effort and any message events sent while the WS
    // was disconnected or throttled are otherwise lost.
  }, [conversationId, resyncToken]);

  // Reactions fetch — pulls the current state from the DB. Kept separate
  // from the channel subscription below so a `resyncToken` bump just
  // refetches the rows without also tearing down and rebuilding the
  // realtime channel.
  useEffect(() => {
    if (!conversationId) {
      setReactions([]);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      // Bounded like the message fetch above. Reactions only render
      // against loaded messages, so pulling every reaction a long
      // thread ever collected was wasted work.
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE * 4);
      if (cancelled) return;
      if (error) {
        console.error('Failed to fetch reactions:', error);
        return;
      }
      setReactions((data as MessageReaction[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, resyncToken]);

  // Reactions realtime subscription per conversation. Subscribing here
  // (not at the page level) keeps the channel scoped to the visible
  // conversation and avoids cross-conversation chatter on a busy inbox.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            // Swap any matching optimistic temp row for the real one so
            // the pill doesn't double up after a successful POST.
            const tempIdx = prev.findIndex(
              (r) =>
                r.id.startsWith('temp-') &&
                r.message_id === row.message_id &&
                r.actor_type === row.actor_type &&
                r.actor_id === row.actor_id
            );
            if (tempIdx >= 0) {
              const copy = prev.slice();
              copy[tempIdx] = row;
              return copy;
            }
            return [...prev, row];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as Partial<MessageReaction>;
          if (!old?.id) return;
          setReactions((prev) => prev.filter((r) => r.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Clear any in-progress reply draft when the active conversation changes —
  // a quote pulled from conversation A shouldn't bleed into conversation B.
  useEffect(() => {
    setReplyTo(null);
  }, [conversationId]);

  // Reset the server-side unread_count to 0 whenever an unread count
  // surfaces on the active conversation — covers both (a) opening a
  // conversation that had unread messages and (b) new messages arriving
  // while the user is already viewing the thread (webhook server-bumps
  // unread_count to N+1; the realtime UPDATE propagates it into the
  // client, which re-runs this effect and flips it back to 0).
  //
  // Guarding on hasUnread prevents the eq-update loop: once unread_count
  // is 0 the condition is false, so no further UPDATE is issued.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    const supabase = createClient();
    supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .then(({ error }) => {
        if (error) console.error('Failed to reset unread_count:', error);
      });
  }, [conversationId, hasUnread]);

  // Auto-scroll to the newest message — but only when the user is
  // already at the bottom.
  //
  // This used to jump unconditionally on every `messages` change, so
  // scrolling up to read earlier history got yanked back down the
  // instant anything arrived. Reading a thread during a busy period
  // was close to impossible. Now a user who has scrolled away keeps
  // their position and gets the "new messages" pill below instead.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setHasNewBelow(true);
    }
  }, [messages]);

  // Track whether the viewport is pinned to the bottom. Lives in a ref
  // because the scroll handler fires constantly and the auto-scroll
  // effect above only ever reads it — re-rendering per scroll event
  // would be pure waste.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A slack of a few pixels: sub-pixel rounding and the sticky date
    // separators mean an exact equality check reads as "not at bottom"
    // even when it visually is.
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 80;
    atBottomRef.current = atBottom;
    if (atBottom) setHasNewBelow(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    atBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  /**
   * POSTs the text and drives the given bubble's status.
   *
   * Shared by the first attempt and by retry, so a retried message
   * reuses its existing bubble instead of stacking a second one under
   * the failed original.
   */
  const deliverText = useCallback(
    async (bubbleId: string, text: string, replyToId?: string) => {
      if (!conversation) return;

      try {
        const res = await fetchWithTimeout('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'text',
            content_text: text,
            reply_to_message_id: replyToId,
          }),
        });

        const payload = await safeJson<{ error?: string }>(res);

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error('Failed to send message:', reason);
          toast.error('Message could not be sent. Please try again.');
          // Leave the bubble visible and marked failed so the text
          // isn't lost and the retry affordance has something to act on.
          onUpdateMessage(bubbleId, { status: 'failed' });
          return;
        }

        // Success — the realtime INSERT event will replace the temp bubble
        // with the real DB row. If realtime hasn't arrived yet, at least
        // flip status to 'sent' so the UI stops showing "sending".
        onUpdateMessage(bubbleId, { status: 'sent' });
        onMessageSent?.();
      } catch (err) {
        console.error('Failed to send message:', err);
        toast.error('Message could not be sent. Please try again.');
        onUpdateMessage(bubbleId, { status: 'failed' });
      }
    },
    [conversation, onMessageSent, onUpdateMessage]
  );

  const handleSend = useCallback(
    async (text: string, replyToId?: string) => {
      if (!conversation) return;

      const tempId = tempMessageId();

      // Optimistic update — shows the message immediately with "sending" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      await deliverText(tempId, text, replyToId);
    },
    [conversation, deliverText, onNewMessage]
  );

  /**
   * Re-send a failed message in place.
   *
   * Previously a failed bubble was a dead end: a red X, and the only
   * way to recover was retyping the message from scratch.
   */
  const handleRetry = useCallback(
    (failed: Message) => {
      const text = failed.content_text?.trim();
      if (!text) return;
      onUpdateMessage(failed.id, { status: 'sending' });
      void deliverText(
        failed.id,
        text,
        failed.reply_to_message_id ?? undefined
      );
    },
    [deliverText, onUpdateMessage]
  );

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (!conversation) return;

      const supabase = createClient();
      // Check the result before applying it locally — this used to
      // ignore the response entirely, so a rejected write (RLS, network)
      // still flipped the badge and the operator believed a
      // conversation was closed when the row never changed. Mirrors
      // `handleAssignChange` below.
      const { error } = await supabase
        .from('conversations')
        .update({ status })
        .eq('id', conversation.id);

      if (error) {
        console.error('Failed to update status:', error);
        toast.error('Failed to update status');
        return;
      }

      onStatusChange(conversation.id, status);
    },
    [conversation, onStatusChange]
  );

  const handleOpenTemplates = useCallback(() => {
    setTemplateModalOpen(true);
  }, []);

  const handleSendTemplate = useCallback(
    async (
      template: MessageTemplate,
      values: {
        body: string[];
        headerText?: string;
        buttonParams?: Record<number, string>;
      }
    ) => {
      if (!conversation) return;

      const renderedBody = renderTemplateBody(template.body_text, values.body);
      const tempId = tempMessageId();

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'template',
        content_text: renderedBody,
        template_name: template.name,
        status: 'sending',
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetchWithTimeout('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'template',
            template_name: template.name,
            template_language: template.language,
            // Structured params drive the new send-builder path
            // (header media + URL button substitution). Body values
            // are mirrored under both shapes so the route can fall
            // back if the template row isn't found locally.
            template_message_params: {
              body: values.body,
              headerText: values.headerText,
              buttonParams: values.buttonParams,
            },
            template_params: values.body,
            content_text: renderedBody,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error('Failed to send template:', reason);
          toast.error('Template could not be sent. Please try again.');
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
        onMessageSent?.();
      } catch (err) {
        console.error('Failed to send template:', err);
        toast.error('Template could not be sent. Please try again.');
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onMessageSent, onNewMessage, onUpdateMessage]
  );

  // Build a quick id → Message map so reply quotes can be rendered without
  // an extra fetch — the thread already holds the full conversation.
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Bucket reactions by their target message_id for O(1) per-bubble lookup.
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const r of reactions) {
      const bucket = map.get(r.message_id);
      if (bucket) bucket.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const contactDisplayName = contact?.name || contact?.phone || 'Customer';

  // Author label for a quoted message: "You" when we sent the parent,
  // contact name when the customer sent it.
  const authorLabelFor = useCallback(
    (m: Message): string => {
      const isAgentMsg = m.sender_type === 'agent' || m.sender_type === 'bot';
      return isAgentMsg ? 'You' : contactDisplayName;
    },
    [contactDisplayName]
  );

  const handleStartReply = useCallback(
    (msg: Message) => {
      setReplyTo({
        id: msg.id,
        authorLabel: authorLabelFor(msg),
        preview: buildReplyPreview(msg),
      });
    },
    [authorLabelFor]
  );

  // Single reaction-set primitive. emoji === "" removes; otherwise adds/swaps.
  // The "toggle" semantic (pill click) is computed at the call site where the
  // current reactions for the bubble are already in scope — keeps this
  // function dependency-free w.r.t. the reaction list.
  const postReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id || !conversation) {
        console.warn('[reactions] missing user or conversation');
        return;
      }
      if (messageId.startsWith('temp-')) {
        toast.error('Wait for the message to finish sending');
        return;
      }

      const convId = conversation.id;
      const userId = user.id;
      let snapshot: MessageReaction[] = [];

      // Functional updater — captures the freshest reactions list, never a
      // stale closure. Snapshot stored for rollback on POST failure.
      setReactions((prev) => {
        snapshot = prev;
        const own = prev.find(
          (r) =>
            r.message_id === messageId &&
            r.actor_type === 'agent' &&
            r.actor_id === userId
        );
        if (emoji === '') return own ? prev.filter((r) => r !== own) : prev;
        if (own) return prev.map((r) => (r === own ? { ...own, emoji } : r));
        return [
          ...prev,
          {
            id: tempMessageId(),
            message_id: messageId,
            conversation_id: convId,
            actor_type: 'agent',
            actor_id: userId,
            emoji,
            created_at: new Date().toISOString(),
          },
        ];
      });

      try {
        const res = await fetchWithTimeout('/api/whatsapp/react', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId, emoji }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Reaction failed:', err);
        toast.error('Reaction could not be saved. Please try again.');
        setReactions(snapshot);
      }
    },
    [conversation, user?.id]
  );

  const handleAssignChange = useCallback(
    async (agentId: string | null) => {
      if (!conversation) return;

      const supabase = createClient();
      const { error } = await supabase
        .from('conversations')
        .update({ assigned_agent_id: agentId })
        .eq('id', conversation.id);

      if (error) {
        console.error('Failed to update assignment:', error);
        toast.error('Failed to update assignment');
        return;
      }

      onAssignChange(conversation.id, agentId);
    },
    [conversation, onAssignChange]
  );

  // Empty state — same WhatsApp-style doodle background as the active
  // thread below, so swapping between empty/selected doesn't change the
  // pattern under the user's eye.
  if (!conversation || !contact) {
    return (
      <div
        className={cn(
          'flex h-full min-h-0 flex-1 flex-col items-center justify-center',
          DOODLE_BG_CLASSES
        )}
      >
        <div className="bg-chat-surface flex h-16 w-16 items-center justify-center rounded-full">
          <MessageSquare className="text-chat-dim h-8 w-8" />
        </div>
        <h3 className="text-chat-ink-3 mt-4 text-sm font-medium">
          Select a conversation
        </h3>
        <p className="text-chat-dim mt-1 text-xs">
          Choose a conversation from the left to start messaging
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const messageGroups = groupMessagesByDate(messages);
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === conversation.status
  );
  const assignedAgentId = conversation.assigned_agent_id ?? null;
  const currentAssignee = profiles.find((p) => p.user_id === assignedAgentId);
  const assignLabel = assignedAgentId
    ? (currentAssignee?.full_name ?? 'Assigned')
    : 'Assign';

  return (
    <div
      className={cn('flex h-full min-h-0 flex-1 flex-col', DOODLE_BG_CLASSES)}
    >
      {/* Header — solid bg-chat-panel sits on top of the doodle so the
          name/avatar/dropdowns stay legible. */}
      <div className="border-chat-line bg-chat-panel flex shrink-0 items-center justify-between gap-2 border-b px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Back-to-list button — mobile only. Hidden on lg+ where the
              conversation list is always visible next to the thread. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className="text-chat-ink-3 hover:bg-chat-surface hover:text-chat-ink focus-visible:outline-chat-accent flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="bg-chat-surface-strong text-chat-ink flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-chat-ink truncate text-sm font-semibold">
              {displayName}
            </h2>
            <p className="text-chat-muted truncate text-xs">{contact.phone}</p>
          </div>
          {(conversation.bot_paused ||
            conversation.handoff_state === 'requested' ||
            conversation.handoff_state === 'active') && (
            <Badge className="ml-1 shrink-0 border border-red-400/40 bg-red-500/20 text-[10px] font-semibold text-red-200 hover:bg-red-500/20">
              Needs your reply
            </Badge>
          )}
          {/* Session timer badge — hidden on the narrowest phones so
              the name + back arrow keep their room. */}
          <Badge
            variant="outline"
            className={cn(
              'border-chat-surface-strong bg-chat-surface ml-1 hidden gap-1 text-[10px] sm:ml-2 sm:inline-flex',
              sessionInfo.expired ? 'text-red-300' : 'text-chat-accent'
            )}
          >
            <Clock className="h-3 w-3" />
            {sessionInfo.remaining}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleBot}
            disabled={togglingBot}
            role="switch"
            aria-checked={!botPaused}
            aria-label={
              botPaused
                ? `Turn on automatic replies for ${displayName}`
                : `Take over replies for ${displayName}`
            }
            title={
              botPaused
                ? `Automatic replies are off for ${displayName}`
                : `Take over replies for ${displayName}`
            }
            className={cn(
              'focus-visible:outline-chat-accent inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 sm:h-9',
              botPaused
                ? 'border-chat-accent/40 bg-chat-accent/10 text-chat-accent hover:bg-chat-accent/20'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
            )}
          >
            {togglingBot ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : botPaused ? (
              <PlayCircle className="h-3.5 w-3.5" />
            ) : (
              <PauseCircle className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {botPaused ? 'Turn on replies' : 'Take over'}
            </span>
          </button>

          {onOpenDetails && (
            <button
              type="button"
              onClick={onOpenDetails}
              aria-label="Open customer details"
              title="Customer details"
              className="text-chat-ink-3 hover:bg-chat-surface hover:text-chat-ink focus-visible:outline-chat-accent inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:h-9 sm:w-9 2xl:hidden"
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Manual refresh — forces a refetch of the messages + the
              conversation list (the parent bumps its resyncToken). Useful
              when realtime missed an event or the agent just wants to be
              sure nothing's stale. Only rendered when the parent wires
              up `onRefresh`. */}
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              aria-label="Refresh conversation"
              title="Refresh"
              className={cn(
                'text-chat-ink-3 hover:bg-chat-surface hover:text-chat-ink focus-visible:outline-chat-accent hidden h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 md:inline-flex'
              )}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
              />
            </button>
          )}

          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'hover:bg-chat-surface focus-visible:outline-chat-accent hidden h-9 items-center justify-center gap-1 rounded-md px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:inline-flex',
                currentStatus?.color ?? 'text-chat-ink-3'
              )}
            >
              {currentStatus?.label ?? 'Status'}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-chat-line bg-chat-surface"
            >
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn('text-sm', opt.color)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'hover:bg-chat-surface hidden h-9 items-center justify-center gap-1 rounded-md px-2 text-xs md:inline-flex',
                assignedAgentId ? 'text-primary' : 'text-chat-ink-3'
              )}
            >
              <UserPlus className="h-3 w-3" />
              <span className="hidden sm:inline">{assignLabel}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-chat-line bg-chat-surface"
            >
              {profiles.length === 0 ? (
                <DropdownMenuItem disabled className="text-chat-muted text-sm">
                  No teammates available
                </DropdownMenuItem>
              ) : (
                profiles.map((p) => {
                  const isSelected = p.user_id === assignedAgentId;
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleAssignChange(p.user_id)}
                      className={cn(
                        'text-sm',
                        isSelected ? 'text-primary' : 'text-chat-ink-2'
                      )}
                    >
                      <span className="flex-1">
                        {p.full_name}
                        {p.user_id === user?.id ? ' (me)' : ''}
                      </span>
                      {isSelected && <Check className="ml-2 h-3 w-3" />}
                    </DropdownMenuItem>
                  );
                })
              )}
              {assignedAgentId && (
                <>
                  <DropdownMenuSeparator className="bg-chat-surface-strong" />
                  <DropdownMenuItem
                    onClick={() => handleAssignChange(null)}
                    className="text-chat-ink-3 text-sm"
                  >
                    Unassign
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More conversation options"
              className="text-chat-ink-3 hover:bg-chat-surface hover:text-chat-ink focus-visible:outline-chat-accent inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
            >
              <MoreHorizontal className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-chat-line bg-chat-surface min-w-52"
            >
              {onOpenDetails ? (
                <DropdownMenuItem
                  onClick={onOpenDetails}
                  className="text-chat-ink-2 min-h-11 text-sm"
                >
                  Customer details
                </DropdownMenuItem>
              ) : null}
              {onRefresh ? (
                <DropdownMenuItem
                  onClick={handleRefreshClick}
                  disabled={isRefreshing}
                  className="text-chat-ink-2 min-h-11 text-sm"
                >
                  {isRefreshing ? 'Refreshing…' : 'Refresh conversation'}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator className="bg-chat-surface-strong" />
              <DropdownMenuItem disabled className="text-chat-muted text-xs">
                Status: {currentStatus?.label ?? 'Open'}
              </DropdownMenuItem>
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn('min-h-11 text-sm', opt.color)}
                >
                  Mark as {opt.label.toLowerCase()}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-chat-surface-strong" />
              <DropdownMenuItem disabled className="text-chat-muted text-xs">
                {assignedAgentId ? `Assigned to ${assignLabel}` : 'Assign to'}
              </DropdownMenuItem>
              {profiles.map((profile) => (
                <DropdownMenuItem
                  key={profile.id}
                  onClick={() => handleAssignChange(profile.user_id)}
                  className="text-chat-ink-2 min-h-11 text-sm"
                >
                  {profile.full_name}
                  {profile.user_id === user?.id ? ' (me)' : ''}
                  {profile.user_id === assignedAgentId ? (
                    <Check className="ml-auto h-3.5 w-3.5" />
                  ) : null}
                </DropdownMenuItem>
              ))}
              {assignedAgentId ? (
                <DropdownMenuItem
                  onClick={() => handleAssignChange(null)}
                  className="text-chat-ink-2 min-h-11 text-sm"
                >
                  Unassign
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // `log` + polite live region: incoming messages were previously
        // silent to screen readers, so an agent using one had no way to
        // know a customer had replied.
        role="log"
        aria-live="polite"
        aria-label="Conversation messages"
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-chat-muted text-sm">No messages yet</p>
            <p className="text-chat-dim text-xs">
              New messages will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="bg-chat-panel-raised text-chat-muted rounded-md px-3 py-1 text-[11px] font-medium">
                    {formatDateSeparator(group.date)}
                  </span>
                </div>
                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => {
                    const parent = msg.reply_to_message_id
                      ? messagesById.get(msg.reply_to_message_id)
                      : null;
                    const reply = parent
                      ? {
                          authorLabel: authorLabelFor(parent),
                          preview: buildReplyPreview(parent),
                        }
                      : null;
                    const msgReactions = reactionsByMessageId.get(msg.id);
                    // Toggle is computed at the call site — `msgReactions`
                    // and `user?.id` are already in scope, no extra hook.
                    const handlePillToggle = (emoji: string) => {
                      const own = msgReactions?.find(
                        (r) =>
                          r.actor_type === 'agent' && r.actor_id === user?.id
                      );
                      const next = own?.emoji === emoji ? '' : emoji;
                      void postReaction(msg.id, next);
                    };
                    return (
                      <MessageActions
                        key={msg.id}
                        message={msg}
                        onReply={() => handleStartReply(msg)}
                        onReact={(emoji) => {
                          if (emoji) void postReaction(msg.id, emoji);
                        }}
                      >
                        <MessageBubble
                          message={msg}
                          reply={reply}
                          reactions={msgReactions}
                          currentUserId={user?.id}
                          onToggleReaction={handlePillToggle}
                          onRetry={() => handleRetry(msg)}
                        />
                      </MessageActions>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Jump-to-latest. Only appears when a message arrived while the
          user was reading further up — the case that used to yank the
          viewport out from under them. */}
      {hasNewBelow ? (
        <div className="pointer-events-none relative">
          <button
            type="button"
            onClick={scrollToBottom}
            className="ops-focus-ring bg-chat-accent text-chat-panel pointer-events-auto absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            New messages
          </button>
        </div>
      ) : null}

      {/* Composer */}
      <MessageComposer
        sessionExpired={sessionInfo.expired}
        sendingAvailable={sendingAvailable}
        onSend={handleSend}
        onOpenTemplates={handleOpenTemplates}
        templatesAvailable={templatesAvailable}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
      />

      {templatesAvailable && (
        <TemplatePicker
          open={templateModalOpen}
          onOpenChange={setTemplateModalOpen}
          onSelect={handleSendTemplate}
        />
      )}
    </div>
  );
}
