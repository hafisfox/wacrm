import { describe, expect, it } from 'vitest';

import { getDashboardPageTitle } from './navigation';

describe('dashboard route titles', () => {
  it('uses concise owner-facing labels', () => {
    expect(getDashboardPageTitle('/dashboard')).toBe('Today');
    expect(getDashboardPageTitle('/salon-control')).toBe('Salon');
    expect(getDashboardPageTitle('/inbox')).toBe('Messages');
  });

  it('keeps nested Settings routes associated with Settings', () => {
    expect(getDashboardPageTitle('/settings?tab=members')).toBe('Settings');
  });

  it('does not expose a system-health destination in the dashboard chrome', () => {
    expect(getDashboardPageTitle('/system-health')).toBe('Today');
  });
});
