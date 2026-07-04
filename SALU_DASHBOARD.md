# Salu WhatsApp Dashboard

This folder is the Salu Salon WhatsApp operations dashboard.

## Runtime Shape

- n8n stays the production WhatsApp owner.
- Meta inbound messages, WhatsApp Flows, Razorpay webhooks, reminders, Google Calendar, and dashboard manual-send automation continue to run through the live n8n workflows.
- The dashboard reads Salu operational data from the existing Postgres `salu` schema through `SALU_BOOKING_DATABASE_URL`.
- The existing public schema is still used for Supabase Auth, accounts, roles, conversations, messages, and the dashboard shell.

## Setup

From `dashboard/`:

```bash
npm run setup:salu-env
npm run setup:salu-db
npm run check:salu-setup
npm run dev
```

`setup:salu-env` normalizes the ignored `dashboard/.env.local` file. The dashboard does not read the parent Salu `.env`; keep dashboard Supabase, Postgres, n8n, and encryption values in `dashboard/.env.local`.

`setup:salu-db` applies the additive dashboard migrations to the same Supabase database. Apply root `sql/003_salu_handoff_capture.sql` first because dashboard migration `025_salu_handoff_capture.sql` bridges those new Salu columns into the shared inbox.

## Production Notes

- Do not point Meta's WhatsApp webhook at `/api/whatsapp/webhook` in this app. Keep it on the live n8n WhatsApp trigger.
- The n8n health card uses `N8N_URL` and `N8N_API_KEY` only to read workflow status.
- Salu customer, booking, payment, and message data remain source-of-truth in `salu.*`.
- Every valid inbound message is visible in the dashboard from the ingress capture, including messages received while the bot is paused.
- `Needs human` shows urgent, owner/admin-assigned conversations on desktop and mobile. Agent replies acquire the Salu pause before WhatsApp send; `Resume bot` is the only resume mechanism.
- n8n-owned manual replies require `SALU_N8N_MANUAL_SEND_TOKEN` in both this app and the `Salu WhatsApp - Dashboard Manual Send` webhook credential.
