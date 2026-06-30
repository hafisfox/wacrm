import type { Message } from '@/types';

const INTERNAL_BOOKING_REFERENCE = /^(?:salu|bk)_\d+_[a-z0-9]+$/i;

export function humanizeSaluTranscriptText(
  value: string | null | undefined,
  interactiveReplyId?: string | null
): string | undefined {
  if (!value || !INTERNAL_BOOKING_REFERENCE.test(value.trim())) {
    return value ?? undefined;
  }

  if (interactiveReplyId === 'cancel' || value.startsWith('bk_')) {
    return 'Cancellation request submitted';
  }

  return 'Booking details submitted';
}

export function normalizeSaluTranscriptMessage(
  message: Message
): Message | null {
  const contentText = message.content_text?.trim();

  // The Salu event bridge used to mirror payment-link bookkeeping as a
  // customer text message immediately after the real Flow response.
  if (
    message.sender_type === 'customer' &&
    message.content_type === 'text' &&
    contentText &&
    INTERNAL_BOOKING_REFERENCE.test(contentText)
  ) {
    return null;
  }

  const humanized = humanizeSaluTranscriptText(
    message.content_text,
    message.interactive_reply_id
  );

  return humanized === message.content_text
    ? message
    : { ...message, content_text: humanized };
}

export function normalizeSaluTranscriptMessages(
  messages: Message[]
): Message[] {
  return messages.flatMap((message) => {
    const normalized = normalizeSaluTranscriptMessage(message);
    return normalized ? [normalized] : [];
  });
}
