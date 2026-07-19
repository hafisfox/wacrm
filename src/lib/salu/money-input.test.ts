import { describe, expect, it } from 'vitest';

import { paiseToRupeesInput, rupeesToPaiseInput } from './money-input';

describe('salon money inputs', () => {
  it('shows stored paise as operator-friendly rupees', () => {
    expect(paiseToRupeesInput(180000)).toBe('1800');
    expect(paiseToRupeesInput(99950)).toBe('999.5');
    expect(paiseToRupeesInput(null)).toBe('');
  });

  it('converts rupee input to integer paise without losing minor units', () => {
    expect(rupeesToPaiseInput('1800')).toBe('180000');
    expect(rupeesToPaiseInput('₹1,249.50')).toBe('124950');
    expect(rupeesToPaiseInput('')).toBe('');
  });

  it('leaves invalid input intact so the server can return its normal validation error', () => {
    expect(rupeesToPaiseInput('not a number')).toBe('not a number');
    expect(rupeesToPaiseInput('-1')).toBe('-1');
  });
});
