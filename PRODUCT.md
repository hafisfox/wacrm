# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the Salu Salon owner checking the business from a phone while moving around the salon. Admins use the same product for configuration and team management, while agents handle customer conversations and viewers need reliable read-only access. Desktop is the secondary environment for denser setup and maintenance work.

## Product Purpose

Salu gives the salon team one operational view of today's appointments, customer WhatsApp conversations, deposits, customer memory, staff, services, and booking availability. Success means the owner can immediately see what needs attention, act without hunting through systems, and trust that the displayed state matches the live booking and messaging workflows.

## Positioning

Salu bridges an automated WhatsApp booking concierge with the human work of running the salon: it brings booking, payment, handoff, and customer context together without moving production messaging ownership out of n8n.

## Operating Context

- The owner uses the dashboard between appointments, often one-handed on an Android phone.
- n8n owns production WhatsApp ingress, WhatsApp Flows, payments, reminders, Calendar updates, and the manual-send bridge.
- Supabase Auth and the public schema own accounts, roles, conversations, messages, and shared customer records.
- The `salu` Postgres schema is the source of truth for bookings, payments, salon configuration, availability, and customer-session state.

## Capabilities and Constraints

- Preserve the existing role hierarchy: owner, admin, agent, and viewer.
- Preserve all existing database tables, dashboard APIs, Supabase tenancy, and n8n workflow ownership.
- Improve the existing product rather than adding new analytics, bulk actions, saved views, or automation behavior.
- The Android app remains a Capacitor shell loading the deployed Next.js application so live server routes stay available.
- Existing customer and operational data must never be reset, reseeded, exposed to unauthenticated users, or shared through public caches.

## Brand Commitments

- Product name: Salu Salon.
- Preserve the dark operational character, five selectable accent themes, and WhatsApp familiarity inside Messages.
- The interface should feel like a focused salon daybook rather than a generic SaaS analytics dashboard.

## Evidence on Hand

- Live production records exist for customers, conversations, messages, bookings, payments, services, stylists, and availability.
- Real stylist photographs are available in `../photos/` and production storage.
- The repository includes working booking, payment, handoff, customer-memory, template, membership, and Android-shell implementations.
- No testimonials, commercial claims, or marketing proof should be invented.

## Product Principles

- Put urgent operational work before historical analysis.
- Make automation versus human ownership unmistakable.
- Keep phone actions fast, thumb-reachable, and safe.
- Show failure and uncertainty honestly; never render missing data as a healthy zero.
- Preserve familiar messaging behavior while giving the wider product a distinct Salu identity.

## Accessibility & Inclusion

The product must support keyboard navigation, visible focus, reduced motion, semantic headings, non-colour status cues, screen-reader labels, and at least 48px primary touch targets on coarse-pointer devices. Layouts must remain usable from 320px-wide phones through large desktop screens.
