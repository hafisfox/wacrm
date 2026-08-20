/**
 * The small piece of priority logic shared by the visual shift brief and its
 * accessible summary. Keeping it pure makes the rule explicit: an operator
 * resolves an active handoff before a deposit follow-up, and either takes
 * precedence over the next scheduled appointment. Missing data is never
 * presented as an all-clear state.
 */
export type ShiftAttention =
  | 'reply'
  | 'deposit'
  | 'appointment'
  | 'clear'
  | 'unavailable';

export function getShiftAttention({
  handoffOk,
  handoffCount,
  depositOk,
  depositCount,
  scheduleOk,
  hasNextAppointment,
}: {
  handoffOk: boolean;
  handoffCount: number;
  depositOk: boolean;
  depositCount: number;
  scheduleOk: boolean;
  hasNextAppointment: boolean;
}): ShiftAttention {
  if (!handoffOk || !depositOk || !scheduleOk) return 'unavailable';
  if (handoffCount > 0) return 'reply';
  if (depositCount > 0) return 'deposit';
  if (hasNextAppointment) return 'appointment';
  return 'clear';
}

export function shiftAttentionLabel(attention: ShiftAttention) {
  switch (attention) {
    case 'reply':
      return 'First: reply needed';
    case 'deposit':
      return 'First: deposit follow-up';
    case 'appointment':
      return 'Next: appointment on the board';
    case 'clear':
      return 'No action waiting';
    case 'unavailable':
      return 'Attention status unavailable';
  }
}
