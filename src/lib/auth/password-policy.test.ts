import { describe, expect, it } from 'vitest';

import { MIN_PASSWORD_LENGTH, passwordLengthError } from './password-policy';

describe('password policy', () => {
  it('requires eight characters everywhere', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordLengthError('1234567')).toContain('8 characters');
    expect(passwordLengthError('12345678')).toBeNull();
  });
});
