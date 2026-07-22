import { describe, expect, it } from 'vitest';

import { redactCustomerText } from './redact';

describe('redactCustomerText', () => {
  it('returns an empty string for missing input', () => {
    expect(redactCustomerText(null)).toBe('');
    expect(redactCustomerText(undefined)).toBe('');
    expect(redactCustomerText('')).toBe('');
  });

  it('leaves ordinary booking chatter intact', () => {
    expect(redactCustomerText('Hi, can I get a haircut tomorrow at 4pm?')).toBe(
      'Hi, can I get a haircut tomorrow at 4pm?'
    );
  });

  it('redacts email addresses and UPI handles', () => {
    expect(redactCustomerText('mail me at asha.k+salon@gmail.com')).toBe(
      'mail me at [redacted]'
    );
    expect(redactCustomerText('paid from asha@okhdfcbank')).toBe(
      'paid from [redacted]'
    );
  });

  it('redacts phone numbers in the shapes customers actually send', () => {
    expect(redactCustomerText('call me on +91 98765 43210')).toBe(
      'call me on [redacted]'
    );
    expect(redactCustomerText('my number is 9876543210')).toBe(
      'my number is [redacted]'
    );
  });

  it('redacts card-shaped digit runs', () => {
    expect(redactCustomerText('card 4111 1111 1111 1111')).toBe(
      'card [redacted]'
    );
  });

  it('redacts six-digit OTPs', () => {
    expect(redactCustomerText('the otp is 483920')).toBe('the otp is [redacted]');
  });

  it('keeps prices and years, which are not identifiers', () => {
    expect(redactCustomerText('is it still 1500 rupees?')).toBe(
      'is it still 1500 rupees?'
    );
    expect(redactCustomerText('since 2019 I come here')).toBe(
      'since 2019 I come here'
    );
  });

  it('collapses whitespace and truncates long messages', () => {
    const long = 'a'.repeat(400);
    const out = redactCustomerText(long);
    expect(out).toHaveLength(160);
    expect(out.endsWith('…')).toBe(true);

    expect(redactCustomerText('  spaced   out \n text ')).toBe(
      'spaced out text'
    );
  });
});
