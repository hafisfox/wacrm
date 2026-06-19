import { describe, expect, it } from 'vitest';

import {
  canonicalSaluPhone,
  mapSaluEventToCrmMessage,
  normalizeSaluPhoneKey,
} from './crm';

describe('Salu CRM bridge helpers', () => {
  it('normalizes phone numbers to a stable CRM key', () => {
    expect(normalizeSaluPhoneKey('+91 85475 56480')).toBe('918547556480');
    expect(canonicalSaluPhone('85475-56480')).toBe('+8547556480');
  });

  it('maps inbound Salu text events to customer chat messages', () => {
    expect(
      mapSaluEventToCrmMessage({
        event_type: 'text_message',
        route: 'ai_route',
        raw_text: 'Hi, I want a haircut',
      })
    ).toMatchObject({
      mirrored: true,
      senderType: 'customer',
      contentType: 'text',
      status: 'delivered',
      contentText: 'Hi, I want a haircut',
    });
  });

  it('preserves flow replies as interactive customer messages', () => {
    expect(
      mapSaluEventToCrmMessage({
        event_type: 'flow_reply',
        intent: 'booking_stylist_selection',
        raw_text: 'Book Asha',
        payload: { interactive_reply_id: 'booking_stylist:asha' },
      })
    ).toMatchObject({
      mirrored: true,
      senderType: 'customer',
      contentType: 'interactive',
      interactiveReplyId: 'booking_stylist:asha',
    });
  });

  it('replaces internal Flow references with a customer-readable label', () => {
    expect(
      mapSaluEventToCrmMessage({
        event_type: 'flow_reply',
        intent: 'payment_pending',
        summary: 'salu_1781892084629_lzk1k5',
      })
    ).toMatchObject({
      mirrored: true,
      contentType: 'interactive',
      contentText: 'Booking details submitted',
      interactiveReplyId: 'payment_pending',
    });
  });

  it('skips internal non-chat Salu events', () => {
    expect(
      mapSaluEventToCrmMessage({
        event_type: 'payment_webhook',
        summary: 'expired',
      })
    ).toMatchObject({
      mirrored: false,
      reason: 'internal_event',
    });
  });

  it.each(['payment_link', 'payment_claim'])(
    'does not mirror %s bookkeeping rows into the transcript',
    (eventType) => {
      expect(
        mapSaluEventToCrmMessage({
          event_type: eventType,
          summary: 'salu_1781892084629_lzk1k5',
        })
      ).toMatchObject({
        mirrored: false,
        reason: 'internal_event',
      });
    }
  );

  it('maps logged outbound bot events to sent bot messages', () => {
    expect(
      mapSaluEventToCrmMessage({
        event_type: 'bot_message',
        route: 'outbound',
        summary: 'Your payment link is ready',
        payload: { direction: 'outbound' },
      })
    ).toMatchObject({
      mirrored: true,
      senderType: 'bot',
      status: 'sent',
      contentText: 'Your payment link is ready',
    });
  });
});
