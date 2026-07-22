import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy, enforced.
 *
 * This shipped as `Content-Security-Policy-Report-Only` while we
 * confirmed nothing legitimate tripped it. Nothing did — the app talks
 * to exactly one external origin (Supabase REST + realtime); every Meta
 * API call happens server-side, and there are no third-party scripts,
 * fonts, or analytics to whitelist. So it enforces now.
 *
 * Known weak spots, deliberately accepted rather than papered over:
 *   - `script-src` still carries 'unsafe-inline', because Next.js
 *     inlines its hydration bootstrap. This is the one directive doing
 *     less work than it looks like it is. Nonce-based CSP via middleware
 *     is the real fix and is its own project.
 *   - 'unsafe-eval' is dev-only below; production does not get it.
 *
 * The rest of the headers are straight blocks:
 *   - HSTS: only meaningful on HTTPS (no-op on http://localhost).
 *   - X-Content-Type-Options / X-Frame-Options / Referrer-Policy:
 *     baseline OWASP hardening, no behavioural cost.
 *   - Permissions-Policy: we don't use camera / microphone / etc, so
 *     deny them. A supply-chain compromise or a forgotten plugin
 *     can't silently opt back in.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // 'unsafe-inline' covers Next.js's inline hydration script. 'unsafe-eval'
  // is dev-only: Turbopack's HMR runtime needs it, production does not.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind + inline style attributes on lots of components.
  "style-src 'self' 'unsafe-inline'",
  // Supabase public-bucket avatars, contact avatars (arbitrary
  // https URLs paste-able from the UI), OG images, data URLs for
  // tiny inline assets.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Supabase REST + realtime (WSS). All Meta API calls happen
  // server-side, so graph.facebook.com does not belong here.
  // In dev, the HMR socket is same-origin ws: — CSP3 says 'self' covers
  // that, but the browsers disagree in practice, so name it explicitly
  // rather than have the dev loop die on a spec argument.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${
    isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""
  }`,
  // Next.js loads some chunks into blob: workers.
  "worker-src 'self' blob:",
  // No <object>/<embed> anywhere in the app; this closes a classic
  // plugin-based XSS route that default-src alone does not cover.
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
] as const;

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  /**
   * Cache-Control policy.
   *
   * Why this exists:
   *   Hostinger's CDN was applying `s-maxage=31536000` (1 year) to
   *   prerendered HTML pages by default. When a new deploy shipped
   *   fresh Turbopack chunk hashes, the edge kept serving year-old
   *   HTML referencing chunk filenames that no longer existed on
   *   disk — result: HTML 200, every /_next/static/*.js and .css
   *   came back 404, the page rendered unstyled. Private/incognito
   *   did nothing because the cache is server-side.
   *
   * Strategy:
   *   - /_next/static/* — leave to Next. Turbopack dev chunks can go
   *     stale if we force immutable caching here; Next already emits
   *     the correct production headers for hashed assets.
   *   - /api/*          — no-store. API responses are per-user and
   *     must never be shared across requests at the edge.
   *   - Everything else — public, brief s-maxage + generous
   *     stale-while-revalidate. The edge serves instantly from cache
   *     for the first 5 min, then returns cached content while
   *     refreshing in the background for up to 24 h. A deploy's
   *     chunk-hash drift self-heals within ~5 min with no user-
   *     visible latency.
   *
   *   Note: dynamic dashboard routes (/inbox, /contacts, /settings,
   *   /system-health, etc.) are server-rendered per request — Next.js
   *   and Supabase auth already prevent them from being served
   *   from a shared cache. The s-maxage here is a ceiling; Next.js
   *   and auth middleware still set `private` / `no-store` for
   *   per-user responses.
   *
   * Security headers are appended via a separate catch-all rule
   * below — Next.js merges headers from every matching rule, so
   * they apply to every response regardless of which cache rule
   * matched.
   */
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/:path((?!_next/static|_next/image|api).*)",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Security headers on every response, including /_next/static
        // assets (nosniff matters there) and /api/* (HSTS + referrer-
        // policy don't hurt).
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
