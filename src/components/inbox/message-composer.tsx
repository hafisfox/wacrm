'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Send, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GatedButton } from '@/components/ui/gated-button';
import { useCan } from '@/hooks/use-can';
import { cn } from '@/lib/utils';
import { ReplyQuote } from './reply-quote';

interface ReplyDraft {
  /** Internal UUID of the message being replied to — sent back through onSend. */
  id: string;
  authorLabel: string;
  preview: string;
}

interface MessageComposerProps {
  sessionExpired: boolean;
  /** May be async — `handleSend` below awaits it so the in-flight
   *  guard actually covers the send. */
  onSend: (text: string, replyToId?: string) => void | Promise<void>;
  onOpenTemplates: () => void;
  replyTo?: ReplyDraft | null;
  onClearReply?: () => void;
  templatesAvailable?: boolean;
  sendingAvailable?: boolean;
}

export function MessageComposer({
  sessionExpired,
  onSend,
  onOpenTemplates,
  replyTo,
  onClearReply,
  templatesAvailable = true,
  sendingAvailable = true,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Viewers (read-only role) can browse the inbox but never send.
  // For solo users this is always true — single-owner accounts pass
  // every capability — so the disabled branch is a no-op there.
  const canSend = useCan('send-messages');
  const readOnly = !canSend;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Max 4 lines (~96px)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || sessionExpired || !sendingAvailable) return;

    setSending(true);
    // Clear the box up front. The send is optimistic — the bubble is
    // already in the thread — so holding the text here would just make
    // it look like nothing happened.
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    try {
      // Must be awaited. Without it `setSending(false)` ran on the very
      // next line, so the in-flight guard was a no-op and a fast
      // double-Enter sent twice.
      await onSend(trimmed, replyTo?.id);
    } finally {
      setSending(false);
    }
  }, [text, sending, sessionExpired, sendingAvailable, onSend, replyTo?.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      adjustHeight();
    },
    [adjustHeight]
  );

  return (
    <div className="border-chat-line bg-chat-surface shrink-0 border-t px-3 py-3">
      {replyTo && (
        <div className="mb-2">
          <ReplyQuote
            authorLabel={replyTo.authorLabel}
            preview={replyTo.preview}
            onDismiss={onClearReply}
          />
        </div>
      )}
      {sessionExpired && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="min-w-0 text-xs text-amber-300">
            {templatesAvailable
              ? '24-hour session expired. Use a template to re-engage.'
              : '24-hour session expired. Approved templates are unavailable right now.'}
          </p>
          {templatesAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-xs text-amber-300 hover:text-amber-200"
              onClick={onOpenTemplates}
            >
              <LayoutTemplate className="mr-1 h-3 w-3" />
              Templates
            </Button>
          ) : null}
        </div>
      )}

      <div className="flex items-end gap-2">
        <GatedButton
          variant="ghost"
          size="sm"
          canAct={!readOnly}
          gateReason="send messages"
          title={
            readOnly
              ? undefined
              : templatesAvailable
                ? 'Send template'
                : 'Approved templates are unavailable right now'
          }
          disabled={!templatesAvailable}
          className="text-chat-ink-3 hover:bg-chat-surface-strong hover:text-chat-ink h-11 w-11 shrink-0 rounded-full p-0 sm:h-10 sm:w-10"
          onClick={onOpenTemplates}
        >
          <LayoutTemplate className="h-4 w-4" />
        </GatedButton>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            readOnly
              ? 'Read-only — viewers can browse but not reply'
              : !sendingAvailable
                ? 'Replies are unavailable right now'
                : sessionExpired
                  ? templatesAvailable
                    ? 'Session expired - use a template'
                    : 'Session expired - template unavailable'
                  : 'Type a message'
          }
          disabled={sessionExpired || readOnly || !sendingAvailable}
          rows={1}
          // Textarea keeps its own inline title — the GatedButton
          // wrapping pattern doesn't apply to non-button inputs.
          // The placeholder text also surfaces the read-only state.
          title={
            readOnly ? "Read-only — your role can't send messages" : undefined
          }
          className={cn(
            'bg-chat-surface-strong text-chat-ink placeholder-chat-muted min-h-11 flex-1 resize-none rounded-full border border-transparent px-4 py-2.5 text-[15px] transition-colors outline-none focus:border-transparent',
            (sessionExpired || readOnly || !sendingAvailable) &&
              'cursor-not-allowed opacity-50'
          )}
        />

        <GatedButton
          size="sm"
          canAct={!readOnly}
          gateReason="send messages"
          disabled={
            !text.trim() || sessionExpired || sending || !sendingAvailable
          }
          onClick={handleSend}
          className="bg-chat-accent text-chat-panel hover:bg-chat-accent-hover h-11 w-11 shrink-0 rounded-full p-0 disabled:opacity-40 sm:h-10 sm:w-10"
        >
          <Send className="h-4 w-4" />
        </GatedButton>
      </div>

      {/* Hint sits outside the flex row so its height doesn't push
          `items-end` buttons below the textarea. Indented to line up
          under the textarea left edge (w-9 button + gap-2 = 44px). */}
      <p className="text-chat-dim mt-1 pl-12 text-[10px]">
        Enter to send. Shift+Enter for a new line
      </p>
    </div>
  );
}
