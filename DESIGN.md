---
name: Salu Salon
description: A phone-first salon operations daybook for live bookings and conversations.
colors:
  night-canvas: 'oklch(0.13 0.01 260)'
  work-surface: 'oklch(0.18 0.01 260)'
  work-surface-raised: 'oklch(0.22 0.01 260)'
  quiet-line: 'oklch(0.28 0.01 260)'
  primary-violet: 'oklch(0.526 0.247 293)'
  theme-emerald: 'oklch(0.62 0.16 162)'
  theme-cobalt: 'oklch(0.585 0.2 254)'
  theme-amber: 'oklch(0.745 0.16 65)'
  theme-rose: 'oklch(0.645 0.22 16)'
  primary-text: 'oklch(0.985 0 0)'
  quiet-text: 'oklch(0.65 0.01 260)'
  healthy: 'oklch(0.7 0.15 162)'
  caution: 'oklch(0.78 0.14 75)'
  serious: 'oklch(0.577 0.245 27.325)'
  whatsapp-green: '#00a884'
  chat-canvas: '#0b141a'
  chat-panel: '#111b21'
  chat-surface: '#202c33'
  chat-ink: '#e9edef'
  chat-muted: '#8696a0'
  chat-bubble-out: '#005c4b'
typography:
  headline:
    fontFamily: 'Inter, Avenir Next, Avenir, Segoe UI, sans-serif'
    fontSize: 'clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem)'
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Inter, Avenir Next, Avenir, Segoe UI, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.35
  chat-title:
    fontFamily: 'Inter, Avenir Next, Avenir, Segoe UI, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 500
    lineHeight: 1.35
  body:
    fontFamily: 'Inter, Avenir Next, Avenir, Segoe UI, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Inter, Avenir Next, Avenir, Segoe UI, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 600
    lineHeight: 1.25
  compact-meta:
    fontFamily: 'Inter, Avenir Next, Avenir, Segoe UI, sans-serif'
    fontSize: '0.6875rem'
    fontWeight: 600
    lineHeight: 1.25
  micro-marker:
    fontFamily: 'Inter, Avenir Next, Avenir, Segoe UI, sans-serif'
    fontSize: '0.625rem'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '0.12em'
  unread-count:
    fontFamily: 'Inter, Avenir Next, Avenir, Segoe UI, sans-serif'
    fontSize: '0.5625rem'
    fontWeight: 700
    lineHeight: 1
rounded:
  small: '0.375rem'
  medium: '0.5rem'
  control: '0.625rem'
  surface: '0.875rem'
  pill: '999px'
spacing:
  xxs: '0.25rem'
  xs: '0.5rem'
  sm: '0.75rem'
  md: '1rem'
  lg: '1.5rem'
  xl: '2rem'
components:
  button-primary:
    backgroundColor: '{colors.primary-violet}'
    textColor: '{colors.primary-text}'
    rounded: '{rounded.control}'
    height: '2.75rem'
    padding: '0 0.75rem'
  button-outline:
    backgroundColor: '{colors.night-canvas}'
    textColor: '{colors.primary-text}'
    rounded: '{rounded.control}'
    height: '2.75rem'
    padding: '0 0.75rem'
  field:
    backgroundColor: '{colors.work-surface-raised}'
    textColor: '{colors.primary-text}'
    rounded: '{rounded.control}'
    height: '3rem'
    padding: '0 0.75rem'
  daybook-surface:
    backgroundColor: '{colors.work-surface}'
    textColor: '{colors.primary-text}'
    rounded: '{rounded.surface}'
    padding: '1rem'
  status-healthy:
    backgroundColor: '{colors.work-surface}'
    textColor: '{colors.healthy}'
    rounded: '{rounded.pill}'
    height: '1.25rem'
    padding: '0 0.5rem'
---

# Design System: Salu Salon

## Overview

**Creative North Star: "The Salu Daybook"**

Salu is a live shift book, not an analytics dashboard. Urgent replies, the current appointment, and expiring deposits lead; history follows. Cool near-black planes, fine ruled seams, compact sans type, tabular numerals, and a visible now line provide the identity established by direction seed `deebff86` and the shipped Now Line composition.

The interface is phone-first and expands without changing its reading order. Expression stays restrained: the selected accent locates interaction and current state, while familiar WhatsApp material is confined to Messages.

**Key Characteristics:**

- One chronological operational flow with a live now seam.
- Five selectable accents over dark, quiet working surfaces.
- Status words and icons before colour.
- Tonal layering, precise borders, and few meaningful containers.
- Compact metadata that remains subordinate to actions and customer content.

## Colors

Violet is the default, but Emerald, Cobalt, Amber, and Rose are equally supported selections; each rotates the accent and subtly tunes the slate base. Healthy, caution, and serious colours are fixed semantic signals and never rotate with theme.

**The One Accent Rule.** Outside Messages, the selected theme colour is the only decorative accent. Status colours communicate state; chart colours identify data; neither becomes decoration.

**The WhatsApp Boundary Rule.** WhatsApp green and the dedicated chat canvas, panels, bubbles, and ink belong only to Messages. Theme Emerald is deliberately distinct and does not license WhatsApp green elsewhere.

## Typography

**Display and Body Font:** Inter with Avenir Next, Avenir, and Segoe UI fallbacks.

**Operational Mono Font:** SFMono-Regular with Consolas and Liberation Mono fallbacks where identifiers require it.

The hierarchy is compact and direct. Page headlines are 24px and may step to 30px where the route composition supports it; titles are 16px, compact conversation titles 15px, body copy 14px, and standard labels 12px. Space-constrained navigation and chat metadata use intentional 11px steps; eyebrows, role chips, timestamps, and now markers use 10px; the mobile unread micro-count alone may use 9px.

**The Compact-Type Rule.** The 9–11px steps are reserved for short operational metadata with nearby context, never instructions, form values, errors, or body copy.

**The Operational Numeral Rule.** Times, counts, money, and countdowns use tabular numerals so live changes do not shift alignment.

## Layout

The shell fills the dynamic viewport. Signed-in routes scroll inside the shell; Messages owns its pane height so the conversation list, thread, and composer remain anchored. Content is capped at 1280px.

- **320–389px:** 12px page gutters, stacked shift-brief cells, a 76px daybook time column, wrapped appointment status, and a labeled bottom navigation.
- **390–639px:** 16px gutters with the same single-column reading order; actions may share a row when their labels remain intact.
- **Tablet, 640–1023px:** 24px gutters, a 96px time column, three shift-brief cells, and paired support panels; bottom navigation remains because the desktop rail begins at 1024px.
- **1024–1279px:** the 240px left navigation replaces the bottom bar; the daybook remains above the exception panels.
- **1280px and 1440px:** the dominant daybook sits beside a fixed 320px exception rail; lower support surfaces may split into two columns. At 1440px the 1280px content cap produces balanced outer margins.

Coarse-pointer controls reach at least 48px even when desktop controls visually compact. Header and bottom navigation consume Android safe-area insets; horizontal tab/filter rails scroll without stealing vertical space.

**The Stable Reading Order Rule.** Responsive layouts may add columns, never reorder urgent work behind history or detach a row action from its customer.

## Elevation & Depth

Depth is primarily tonal: night canvas, work surface, raised/inset control plane, then popover or dialog. Bounded operational surfaces use a low ambient shadow (`0 1px 2px rgba(0,0,0,0.18)`); auth cards may use a broader soft shadow. Menus and dialogs are the only elements that lift decisively.

**The Flat-By-Default Rule.** Rows share a ruled surface and separate with rhythm or lines. A card exists only when its boundary carries meaning.

## Shapes

Small metadata uses 6px corners, compact chips and tabs use 8px, controls use 10px, and operational surfaces use 14px. Pills are reserved for statuses, unread counts, and continuous chat controls. The straight daybook spine and now seam intentionally cut through rounded containers to keep time visually continuous.

## Components

### Shared shell and controls

- **Navigation:** Desktop uses a 240px left rail; phone and tablet use a labeled bottom bar with 11px labels and a 9px unread micro-count where space is constrained. Active state uses the selected accent plus a soft tint and `aria-current`.
- **Buttons and fields:** Primary, outline, ghost, and destructive controls use 10px corners, plain action labels, visible busy/disabled states, and a selected-accent focus ring. Phone fields are 48px high; desktop may compact to 32–36px.
- **Surfaces and status:** Operational surfaces use 14px corners, a quiet border, and low ambient depth. Status chips combine icon and text; colour is reinforcement only.
- **Focus and motion:** Keyboard focus is a high-contrast selected-accent outline/ring with offset. Reduced motion collapses animation and transition durations without hiding state changes.

### Route-specific patterns

- **Today — Now Line:** The route owns one `h1`, then a live shift brief, chronological appointment ledger, current-time seam, exception queue, shift totals, future activity, and collapsed weekly insights. Missing panels say unavailable; only a total data outage replaces the daybook.
- **Messages:** The dedicated WhatsApp canvas preserves the familiar list → thread → composer model. Mobile shows either list or active thread; ownership/takeover, assignment, and 24-hour session state remain visible. Direct replies disable when the session expires, templates offer the recovery path, optimistic sends expose failure and retry, and read-only roles receive an explanation.
- **Customers:** Search and operational filters precede one honest result count. Mobile renders bounded customer rows; large screens align the same fields as a table. Name, preferences, live state, last contact, and the transition into the conversation remain primary; no-result and load-failure states are distinct.
- **Salon:** Overview is the clean URL; Services, Team, and Schedule use `?tab=services`, `?tab=team`, and `?tab=schedule`. Read-only access is explained above disabled editors. Weekday/purpose labels stay explicit, drafts announce unsaved/saved state, failed saves retain context, and deactivation requires a confirmation dialog.
- **Settings and auth:** Settings tabs are URL-backed and share the same surface, field, error, save, and session patterns. Auth uses one centered card, explicit status/alert copy, consistent eight-character password policy, 48px primary actions on phone, and distinct checking, invalid, complete, and saving states.
- **Android shell:** Capacitor loads the deployed Next.js app so live routes remain available. Back moves active thread → Messages, any other signed-in route → Today, then exits from Today. Safe areas belong to the web shell; loss of connectivity falls back to a branded local offline screen with a 48px retry action.

**The One Page Heading Rule.** Every route or route-level error owns exactly one `h1`; the shared header title is contextual text, not a competing heading.

**The Honest State Rule.** Loading, empty, partial failure, permission, expired session, save, and send states use explicit text plus icons where useful. Failed or absent data never renders as a healthy zero.

## Do's and Don'ts

### Do:

- **Do** put urgent action and current-day state before historical analysis.
- **Do** preserve all five accents and test focus, text, and semantic status against each.
- **Do** keep touch targets at least 48px on coarse pointers and preserve visible keyboard focus.
- **Do** retain drafts and explain recovery after save, send, session, or connection failures.
- **Do** keep the same task order from 320px phones through 1440px desktop.

### Don't:

- **Don't** rebuild the product as a generic grid of metric cards.
- **Don't** use WhatsApp green, chat bubbles, or the doodle canvas outside Messages.
- **Don't** use gradients, glowing chrome, salon stock imagery, or decorative scissors motifs.
- **Don't** hide permissions by removing controls without explanation.
- **Don't** show missing or failed data as zero, empty, saved, sent, or all-clear.
