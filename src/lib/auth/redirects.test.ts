import { describe, expect, it } from 'vitest';

import { safeNextPath } from './redirects';

describe('safeNextPath', () => {
  it('preserves local paths, queries, and hashes', () => {
    expect(safeNextPath('/inbox?conversation=abc#latest')).toBe(
      '/inbox?conversation=abc#latest'
    );
  });

  it.each([
    'https://example.com',
    '//example.com/path',
    '/%5C%5Cexample.com',
    '/safe%0ASet-Cookie:bad',
    '%E0%A4%A',
  ])('rejects unsafe destination %s', (value) => {
    expect(safeNextPath(value)).toBe('/dashboard');
  });

  it('uses the requested fallback for empty values', () => {
    expect(safeNextPath(null, '/login')).toBe('/login');
  });
});
