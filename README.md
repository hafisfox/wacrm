# Salu WhatsApp Dashboard

Lean operations console for Salu Salon WhatsApp booking support.

This dashboard is not the live WhatsApp workflow owner. Production inbound messages, WhatsApp Flows, payments, reminders, Google Sheets sync, Calendar updates, Gmail alerts, and the manual-send bridge stay in n8n. The Next.js app provides the team-facing console for daily triage, inbox replies, customer memory, Meta template maintenance, members, settings, and system health.

## Product Surfaces

- Daily Ops Dashboard: today schedule, handoffs, deposits, setup drift, Sheet sync, and n8n/manual-send health.
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

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run check:salu-setup
```

Before typecheck/build, remove stale ignored `.next` artifacts if duplicate generated type files appear.
