import { describe, expect, it } from 'vitest';

import { getShiftAttention, shiftAttentionLabel } from './attention';

describe('shift attention priority', () => {
  const ready = {
    handoffOk: true,
    handoffCount: 0,
    depositOk: true,
    depositCount: 0,
    scheduleOk: true,
    hasNextAppointment: true,
  };

  it('puts a human reply ahead of every other daybook task', () => {
    expect(
      getShiftAttention({ ...ready, handoffCount: 1, depositCount: 2 })
    ).toBe('reply');
  });

  it('moves a deposit follow-up ahead of the next appointment when no reply waits', () => {
    expect(getShiftAttention({ ...ready, depositCount: 1 })).toBe('deposit');
  });

  it('never turns unavailable data into an all-clear message', () => {
    const attention = getShiftAttention({ ...ready, scheduleOk: false });
    expect(attention).toBe('unavailable');
    expect(shiftAttentionLabel(attention)).toBe('Attention status unavailable');
  });
});
