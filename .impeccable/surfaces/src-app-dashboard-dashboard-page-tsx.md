---
version: 1
slug: 'src-app-dashboard-dashboard-page-tsx'
primary_target: 'src/app/(dashboard)/dashboard/page.tsx'
related_targets: ['src/app/(dashboard)/dashboard-shell.tsx']
---

## Scope and mode

- Operate mode for the authenticated Today route and shared responsive shell.
- Primary user: salon owner on a 390px Android phone; desktop expands the same hierarchy.

## Job and action

- Show what requires intervention now, what appointment is happening, and what comes next.
- Primary action is opening the highest-priority customer conversation; deposits and appointment actions remain directly reachable.

## Approved direction

- “Now Line” composition: `.impeccable/mocks/salu-daybook-now-line.png`.
- A continuous live-state ribbon feeds into one chronological appointment ledger with a visible current-time marker.
- Desktop uses a dominant daybook and narrow exception rail; mobile retains the time spine and labeled bottom navigation.

## Fidelity inventory

| Ingredient             | Implementation medium                          | Commitment                                                                                          |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| App navigation         | Semantic links + Lucide icons                  | Existing destinations, one active state, unread count announced                                     |
| Live shift ribbon      | Semantic links/buttons + CSS grid              | Replies, current/next appointment, expiring deposits; no decorative metrics                         |
| Appointment time spine | Semantic list + CSS pseudo-elements            | Continuous ruled spine, tabular times, current row visibly anchored                                 |
| Exception rail         | Semantic sections + existing data              | Handoffs and deposit follow-ups only; absent on narrow screens because they are already in sequence |
| Status language        | Existing icons + tokenized text/border colours | Every colour cue has an icon and plain-language label                                               |
| Type                   | Existing workhorse sans stack                  | Compact, strong headings; tabular operational numerals                                              |
| Historical insights    | Existing Recharts components                   | Below operational content, collapsible on phone                                                     |
| Primary action         | Next.js Link styled as a restrained action row | No animation beyond colour/position feedback                                                        |

## Constraints

- Preserve all real product data and existing routes; do not literalize mock names, dates, counts, or unimplemented actions.
- Keep WhatsApp green inside Messages only.
- No new database schema, automation, analytics, or bulk-action capability.
- Support 320px through desktop, keyboard navigation, reduced motion, and 48px coarse-pointer targets.
