import { describe, expect, it } from 'vitest';

import type { Message } from '@/types';

import {
  humanizeSaluTranscriptText,
  normalizeSaluTranscriptMessages,
} from './transcript';

function message(overrides: Partial<Message>): Message {
  return {
    id: crypto.randomUUID(),
    conversation_id: 'conversation-1',
    sender_type: 'customer',
    content_type: 'text',
    content_text: 'Hello',
    status: 'delivered',
    created_at: '2026-06-19T18:00:00.000Z',
    ...overrides,
  };
}

describe('Salu transcript presentation', () => {
  it('humanizes opaque booking and cancellation references', () => {
    expect(humanizeSaluTranscriptText('salu_1781892084629_lzk1k5')).toBe(
      'Booking details submitted'
    );
    expect(humanizeSaluTranscriptText('bk_1780284729330_3vk4xb')).toBe(
      'Cancellation request submitted'
    );
  });

  it('removes mirrored bookkeeping rows and keeps the real Flow response', () => {
    const result = normalizeSaluTranscriptMessages([
      message({
        id: 'flow-response',
        content_type: 'interactive',
        content_text: 'salu_1781892084629_lzk1k5',
        interactive_reply_id: 'payment_pending',
      }),
      message({
        id: 'payment-bookkeeping',
        content_text: 'salu_1781892084629_lzk1k5',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'flow-response',
      content_text: 'Booking details submitted',
    });
  });

  it('does not change ordinary customer text', () => {
    const original = message({ content_text: 'is there a slot today?' });
    expect(normalizeSaluTranscriptMessages([original])).toEqual([original]);
  });
});
