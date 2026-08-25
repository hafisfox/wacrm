import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(relative: string) {
  return readFileSync(
    fileURLToPath(new URL(relative, import.meta.url)),
    'utf8'
  );
}

describe('authenticated surface security contract', () => {
  it('authorizes Salon before loading any of its data', () => {
    const page = source('../../app/(dashboard)/salon-control/page.tsx');
    const authorization = page.search(/await requireRole\(['"]viewer['"]\)/);
    expect(authorization).toBeGreaterThan(-1);

    // Every loader on the page, not just the first one — the setup data
    // and the team earnings are both operational and must sit behind the
    // same gate.
    for (const loader of ['loadControlRoomData(', 'loadStylistEarnings(']) {
      const call = page.indexOf(loader);
      expect(call).toBeGreaterThan(-1);
      expect(authorization).toBeLessThan(call);
    }
  });

  it('does not install a blanket public HTML cache policy', () => {
    const config = source('../../../next.config.ts');
    expect(config).not.toContain('s-maxage=300');
    expect(config).toContain('/salon-control/:path*');
    expect(config).toContain('private, no-cache, no-store');
  });

  it('ships both halves of password recovery', () => {
    const callback = source('../../app/auth/callback/route.ts');
    const reset = source('../../app/(auth)/reset-password/page.tsx');
    expect(callback).toContain('exchangeCodeForSession');
    expect(reset).toContain('updateUser');
  });
});
