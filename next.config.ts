import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

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
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
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
    isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''
  }`,
  // Next.js loads some chunks into blob: workers.
  "worker-src 'self' blob:",
  // No <object>/<embed> anywhere in the app; this closes a classic
  // plugin-based XSS route that default-src alone does not cover.
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Content-Security-Policy', value: CSP_DIRECTIVES },
] as const;

const PRIVATE_APP_HEADERS = [
  {
    key: 'Cache-Control',
    value: 'private, no-cache, no-store, max-age=0, must-revalidate',
  },
] as const;

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [...PRIVATE_APP_HEADERS],
      },
      ...[
        '/dashboard/:path*',
        '/salon-control/:path*',
        '/inbox/:path*',
        '/contacts/:path*',
        '/settings/:path*',
      ].map((source) => ({ source, headers: [...PRIVATE_APP_HEADERS] })),
      {
        // Security headers on every response, including /_next/static
        // assets (nosniff matters there) and /api/* (HSTS + referrer-
        // policy don't hurt).
        source: '/:path*',
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
