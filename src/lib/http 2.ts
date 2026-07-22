/**
 * fetch with a deadline.
 *
 * Nothing in this app used to bound an outbound request — not the n8n
 * health check, not the 13 Meta Graph API calls, not a single client
 * mutation. The failure mode is nasty and silent: an unreachable host
 * doesn't error, it *hangs*, so a server render blocks until the
 * platform kills it and a client spinner runs forever with the panel
 * disabled behind it.
 *
 * `AbortSignal.timeout()` aborts with a `TimeoutError` DOMException,
 * which is distinguishable from a caller-initiated abort — see
 * `isTimeout` below. Any caller-supplied `signal` is combined with the
 * deadline rather than replaced, so unmount-cancellation still works.
 */

/** Outbound calls to third parties (Meta, n8n) — generous, they can be slow. */
export const TIMEOUT_EXTERNAL_MS = 10_000;

/** Our own API routes, called from the browser. */
export const TIMEOUT_INTERNAL_MS = 15_000;

export class HttpTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** True when `error` came from a deadline rather than a caller abort. */
export function isTimeout(error: unknown): boolean {
  if (error instanceof HttpTimeoutError) return true;
  return error instanceof DOMException && error.name === 'TimeoutError';
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUT_INTERNAL_MS
): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  // Combine so a caller's own abort (React unmount, user cancel) still
  // wins, instead of being clobbered by the deadline signal.
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;

  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    // Re-throw the deadline case as our own type so callers can render
    // "took too long" rather than a bare "aborted".
    if (deadline.aborted && isTimeout(deadline.reason ?? error)) {
      throw new HttpTimeoutError(url, timeoutMs);
    }
    throw error;
  }
}

/**
 * `response.json()` that survives a non-JSON body.
 *
 * A gateway 502/504 returns an HTML error page. Calling `.json()` on it
 * throws a SyntaxError, so the UI ends up showing the user
 * "Unexpected token '<'" instead of the actual failure. Returns
 * `fallback` in that case.
 */
export async function safeJson<T = unknown>(
  response: Response,
  fallback: T = {} as T
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}
