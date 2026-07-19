/** Browser-safe control-room presentation helpers. */
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const SKILL_LEVELS = ['trained', 'skilled', 'senior', 'expert'] as const;

export function skillsFromSummary(value: unknown) {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}
