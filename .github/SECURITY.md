# Security Policy

## Reporting A Vulnerability

Do not open public issues for security reports. Share the details privately with the Salu project owner or maintainer through the approved internal channel for this deployment.

Please include:

- A short description of the issue and likely impact.
- Reproduction steps or a proof of concept.
- The affected route, workflow, migration, or configuration.
- Whether secrets, customer data, WhatsApp tokens, or service-role keys may be exposed.

## Scope

In scope:

- Dashboard auth, role checks, invitation flows, token encryption, and server routes.
- Supabase RLS and migrations shipped in `supabase/migrations/`.
- The dashboard manual-send bridge and `SALU_N8N_MANUAL_SEND_TOKEN` handling.
- Env templates and setup docs that could lead to unsafe production defaults.

Out of scope:

- Third-party platform vulnerabilities in Supabase, Meta, n8n, Next.js, Node.js, or Razorpay; report those to the relevant vendor.
- Findings that require already-leaked production credentials unless this code widens the blast radius.
- Social engineering, physical attacks, or destructive testing.

## Handling

Treat all production credentials, customer messages, phone numbers, booking details, and payment metadata as sensitive. Rotate exposed secrets immediately, preserve relevant logs, and document the fix and verification steps before redeploying.
