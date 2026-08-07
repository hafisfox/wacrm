---
name: Salu Salon
description: A phone-first salon operations daybook for live bookings and conversations.
colors:
  night-canvas: "oklch(0.13 0.01 260)"
  work-surface: "oklch(0.18 0.01 260)"
  work-surface-raised: "oklch(0.22 0.01 260)"
  quiet-line: "oklch(0.28 0.01 260)"
  primary-violet: "oklch(0.526 0.247 293)"
  whatsapp-green: "#00a884"
  healthy: "oklch(0.7 0.15 162)"
  caution: "oklch(0.78 0.14 75)"
  serious: "oklch(0.577 0.245 27.325)"
  primary-text: "oklch(0.985 0 0)"
  quiet-text: "oklch(0.65 0.01 260)"
typography:
  headline:
    fontFamily: "Inter, Avenir Next, Segoe UI, sans-serif"
    fontSize: "clamp(1.5rem, 4vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: "Inter, Avenir Next, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Inter, Avenir Next, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, Avenir Next, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.08em"
rounded:
  control: "0.5rem"
  surface: "0.75rem"
  pill: "999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary-violet}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.control}"
    height: "2.75rem"
    padding: "0 1rem"
  daybook-surface:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.surface}"
    padding: "1rem"
---

# Design System: Salu Salon

## Overview

**Creative North Star: "The Salu Daybook"**

Salu should feel like opening the salon's live shift book: the next customer, the unresolved message, and the expiring deposit are immediately legible. The system is operational and restrained, with identity coming from precise time lines, status seams, and the rhythm of a working day rather than decorative salon clichés.

The interface is phone-first and expands rather than transforms on desktop. Dense administrative work may use wider grids, but the hierarchy and familiar controls remain the same.

**Key Characteristics:**

- Dark, quiet working surfaces with one selected accent.
- Chronological time spines and shift-oriented grouping.
- Status is expressed by words and icons before colour.
- WhatsApp green remains exclusive to the Messages environment.
- Fewer containers, stronger internal alignment, and clear action priority.

## Colors

The base is a cool near-black slate. The selected theme accent identifies interactive state; semantic green, amber, and red never rotate with themes.

**The One Accent Rule.** Outside Messages, the selected primary theme colour is the only decorative accent on a screen. Status colours communicate state and are never repurposed as decoration.

## Typography

**Display and Body Font:** Inter with Avenir Next and Segoe UI fallbacks.

The type system is compact, direct, and tabular where time, money, or counts must be compared. Page headlines are confident without becoming promotional.

**The Operational Numeral Rule.** Times, counts, money, and countdowns use tabular numerals so rows do not shift as live data changes.

## Layout

Phone layouts use a single vertical shift flow with 12–16px gutters and 16–20px section rhythm. Desktop preserves the reading order, placing the daybook in the dominant column and supporting queues or insights in a narrower rail. Primary navigation is bottom-mounted on phones and left-mounted on desktop. Touch targets are at least 48px for coarse pointers.

## Elevation & Depth

Depth comes from tonal layering and seams, not floating stacks. Shadows stay low and ambient; dialogs and menus are the only elements allowed to lift clearly above the working plane.

**The Flat-By-Default Rule.** Operational rows share a surface and separate with rhythm or lines. A card exists only when its boundary carries meaning.

## Shapes

Controls use compact 8px corners; primary surfaces use 12px corners; pills are reserved for statuses and counts. Chronological rows may use a straight left time spine even when their enclosing surface is rounded.

## Components

- **Shift brief:** A concise priority region with one dominant next action and two secondary operational states.
- **Daybook row:** Time, customer/service, status, and direct action aligned to a continuous time spine.
- **Buttons:** Solid primary for the next action, outlined secondary, ghost for local row utilities; all retain visible focus.
- **Status chips:** Icon plus plain-language label; colour reinforces but never carries meaning alone.
- **Fields:** Dark inset fill, quiet border, 8px corners, and an accent border/ring on focus.
- **Navigation:** Text labels remain visible on mobile; unread counts are announced to assistive technology.

## Do's and Don'ts

### Do:

- **Do** put urgent action and current-day state before historical analysis.
- **Do** keep scheduling, payment, and handoff uncertainty explicit.
- **Do** use one semantic heading hierarchy and stable focus order.
- **Do** preserve familiar WhatsApp behaviour inside Messages.

### Don't:

- **Don't** rebuild the product as a generic grid of metric cards.
- **Don't** use gradients, glowing chrome, salon stock imagery, or decorative scissors motifs.
- **Don't** hide permissions by removing controls without explanation.
- **Don't** show missing or failed data as zero or all-clear.
