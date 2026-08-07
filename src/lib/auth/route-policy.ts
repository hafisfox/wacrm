export const PROTECTED_PAGE_PREFIXES = [
  '/dashboard',
  '/salon-control',
  '/inbox',
  '/contacts',
  '/settings',
] as const;

export const LEGACY_PAGE_PREFIXES = [
  '/pipelines',
  '/broadcasts',
  '/automations',
  '/flows',
] as const;

export const AUTH_ENTRY_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
] as const;

export function matchesRoutePrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function matchesAnyRoutePrefix(
  pathname: string,
  prefixes: readonly string[]
) {
  return prefixes.some((prefix) => matchesRoutePrefix(pathname, prefix));
}

export function isProtectedPage(pathname: string) {
  return matchesAnyRoutePrefix(pathname, [
    ...PROTECTED_PAGE_PREFIXES,
    ...LEGACY_PAGE_PREFIXES,
  ]);
}

export function isLegacyPage(pathname: string) {
  return matchesAnyRoutePrefix(pathname, LEGACY_PAGE_PREFIXES);
}

export function isAuthEntryPage(pathname: string) {
  return (AUTH_ENTRY_PATHS as readonly string[]).includes(pathname);
}
