import { describe, expect, it } from 'vitest';

import {
  isAuthEntryPage,
  isLegacyPage,
  isProtectedPage,
  matchesRoutePrefix,
} from './route-policy';

describe('route policy', () => {
  it.each([
    '/dashboard',
    '/salon-control',
    '/inbox',
    '/contacts',
    '/settings',
    '/settings/profile',
  ])('protects %s', (pathname) => {
    expect(isProtectedPage(pathname)).toBe(true);
  });

  it('does not protect lookalike paths', () => {
    expect(matchesRoutePrefix('/dashboard-preview', '/dashboard')).toBe(false);
    expect(isProtectedPage('/salon-control-public')).toBe(false);
  });

  it('keeps legacy destinations protected and identifiable', () => {
    expect(isProtectedPage('/flows/archived')).toBe(true);
    expect(isLegacyPage('/flows/archived')).toBe(true);
  });

  it('recognizes only the intended auth entry pages', () => {
    expect(isAuthEntryPage('/login')).toBe(true);
    expect(isAuthEntryPage('/reset-password')).toBe(false);
    expect(isAuthEntryPage('/login/help')).toBe(false);
  });
});
