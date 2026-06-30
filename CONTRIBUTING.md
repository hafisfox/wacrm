# Contributing

This folder is the Salu Salon WhatsApp operations dashboard. It is a focused Next.js app layered on top of the live n8n-owned WhatsApp automation, not the original upstream WACRM template.

## Local Setup

From `dashboard/`:

```bash
npm install
npm run setup:salu-env
npm run check:salu-setup
npm run dev
```

Keep local secrets in `dashboard/.env.local`. The setup/check scripts read that file and process env only; they do not read the parent `../.env`.

## Before Changing Code

- Read `README.md` and `SALU_DASHBOARD.md` for the current runtime shape.
- Keep Meta's production WhatsApp webhook on n8n. Do not repoint it at this app.
- Treat `salu.*` Postgres tables as the source of truth for bookings, payments, customer memory, and message capture.
- Keep dashboard changes compatible with the n8n manual-send bridge protected by `SALU_N8N_MANUAL_SEND_TOKEN`.

## Verification

Run the narrowest useful checks while developing, and run the full set before shipping dashboard changes:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run check:salu-setup
```

If typecheck/build reports duplicate generated route/type files, remove the ignored `dashboard/.next` directory and rerun the command.

## Database Changes

- Add dashboard-owned schema changes under `supabase/migrations/`.
- Keep migrations additive and idempotent where practical.
- When a dashboard migration depends on root Salu SQL, call that out in `SALU_DASHBOARD.md`.

## Documentation

Update the nearest Markdown file when changing setup steps, required env vars, production ownership boundaries, or operational runbooks.
