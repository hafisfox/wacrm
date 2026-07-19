import { describe, expect, it } from 'vitest';

import { getDashboardPageTitle } from './navigation';

describe('dashboard route titles', () => {
  it('labels Salon Control instead of falling back to Dashboard', () => {
    expect(getDashboardPageTitle('/salon-control')).toBe('Salon Control');
  });

  it('keeps nested Settings routes associated with Settings', () => {
    expect(getDashboardPageTitle('/settings?tab=members')).toBe('Settings');
  });
});
