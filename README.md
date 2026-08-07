# Salu WhatsApp Dashboard

Lean operations console for Salu Salon WhatsApp booking support.

This dashboard is not the live WhatsApp workflow owner. Production inbound messages, WhatsApp Flows, payments, reminders, Calendar updates, Gmail alerts, and the manual-send bridge stay in n8n. The Next.js app provides the team-facing console for daily triage, Salon Control, inbox replies, customer memory, Meta template maintenance, members, settings, and system health.

## Product Surfaces

- Salu Daybook: a live shift brief, chronological appointment ledger, reply and deposit exceptions, and lower-priority weekly insights.
- Salon Control: salon details, services, current staff, stylist-service mappings, salon hours, stylist availability, blackout dates, and effective windows.
- WhatsApp Inbox: shared conversation history, bot pause-before-send, human takeover/resume, n8n-owned text replies, and Meta template sends.
- Customers: Salu memory by phone number, preferences, active booking, pending payment, handoff state, and inbox links.
- Settings: profile, members, Meta maintenance credentials, template maintenance, and system health.

Legacy CRM routes such as `/broadcasts`, `/pipelines`, `/automations`, and `/flows` redirect back to `/dashboard`.

## Setup

```bash
npm install
npm run setup:salu-env
npm run check:salu-setup
npm run dev
```

Required environment values live in `.env.local.example`. Keep `SALU_DASHBOARD_MODE=n8n-owned-whatsapp` unless the production ownership model changes intentionally.

`dashboard/.env.local` is the canonical local env file for this app. The dashboard setup/check scripts do not read the parent `../.env`; keep Supabase, Postgres, n8n, and encryption values in `dashboard/.env.local` and mirror the same dashboard values in Vercel.

In Supabase Auth URL Configuration, allow the production callback URL
`https://<your-dashboard-domain>/auth/callback` and the local callback
`http://localhost:3000/auth/callback`. Password-recovery emails return through
that callback and continue to `/reset-password`; no database migration is
required.

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run check:salu-setup
npm run android:apk
```

Before typecheck/build, remove stale ignored `.next` artifacts if duplicate generated type files appear.

The release APK is copied to `releases/Salu-Salon-0.2.3.apk`; see
`MOBILE_ANDROID.md` for verification and signing guidance.
