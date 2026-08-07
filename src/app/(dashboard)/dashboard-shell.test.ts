import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const shellSource = readFileSync(
  fileURLToPath(new URL('./dashboard-shell.tsx', import.meta.url)),
  'utf8'
);
const sidebarSource = readFileSync(
  fileURLToPath(
    new URL('../../components/layout/sidebar.tsx', import.meta.url)
  ),
  'utf8'
);
const mobileNavSource = readFileSync(
  fileURLToPath(
    new URL('../../components/layout/mobile-nav.tsx', import.meta.url)
  ),
  'utf8'
);

describe('dashboard unread subscription ownership', () => {
  it('keeps one realtime hook in the shell and passes its value to both navs', () => {
    expect(shellSource.match(/useTotalUnread\(\)/g)).toHaveLength(1);
    expect(shellSource).toContain('<Sidebar totalUnread={totalUnread} />');
    expect(shellSource).toContain('<MobileNav totalUnread={totalUnread} />');
    expect(sidebarSource).not.toContain('useTotalUnread(');
    expect(mobileNavSource).not.toContain('useTotalUnread(');
  });
});
