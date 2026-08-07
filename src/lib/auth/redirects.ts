const LOCAL_ORIGIN = 'https://salu.local';

/**
 * Accept an application-local destination while rejecting absolute URLs,
 * protocol-relative URLs, encoded backslashes, and malformed input.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = '/dashboard'
) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) {
    return fallback;
  }

  try {
    const parsed = new URL(value, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
