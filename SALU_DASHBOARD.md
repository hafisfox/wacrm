# Salu WhatsApp Dashboard

This folder is based on `ArnasDon/wacrm`, customized for the current Salu Salon production setup.

## Runtime Shape

- n8n stays the production WhatsApp owner.
- Meta inbound messages, WhatsApp Flows, Razorpay webhooks, reminders, Google Calendar, and Google Sheets sync continue to run through the live n8n workflows.
- The dashboard reads Salu operational data from the existing Postgres `salu` schema through `SALU_BOOKING_DATABASE_URL`.
- The upstream wacrm public schema is still used for Supabase Auth, accounts, roles, and the dashboard shell.

## Setup

From `dashboard/`:

```bash
npm run setup:salu-env
npm run setup:salu-db
npm run check:salu-setup
npm run dev
```

`setup:salu-env` generates an ignored `.env.local` from the parent Salu `.env`.

`setup:salu-db` applies the additive upstream wacrm migrations to the same Supabase database so login/signup and team roles work. It does not modify the `salu` schema.

## Production Notes

- Do not point Meta's WhatsApp webhook at `/api/whatsapp/webhook` in this app. Keep it on the live n8n WhatsApp trigger.
- The n8n health card uses `N8N_URL` and `N8N_API_KEY` only to read workflow status.
- Salu customer, booking, payment, and message data remain source-of-truth in `salu.*`.
