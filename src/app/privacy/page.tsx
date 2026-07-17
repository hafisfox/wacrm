import type { Metadata } from "next";

import {
  LegalShell,
  SALU_ADDRESS,
  SALU_CONTACT_EMAIL,
} from "@/app/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Salu Salon collects, uses, shares, and protects customer data for WhatsApp bookings.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Privacy Policy"
      title="How Salu Salon handles customer data"
      summary="This policy explains what customer data Salu Salon collects through WhatsApp, booking forms, payments, and salon operations, and how that data may be used or shared to provide salon services."
      relatedHref="/terms"
      relatedLabel="View Terms"
      sections={[
        {
          title: "Who we are",
          body: [
            `Salu Salon operates salon booking and customer support through WhatsApp and a private dashboard. You can contact us at ${SALU_CONTACT_EMAIL}. Our salon location is ${SALU_ADDRESS}.`,
            "For personal data collected through our WhatsApp booking flow, Salu Salon acts as the business deciding why and how the data is processed. This policy is written in plain language for customer understanding and is intended to align with India's Digital Personal Data Protection framework.",
          ],
        },
        {
          title: "Data we collect",
          body: [
            "We may collect your name, WhatsApp phone number, WhatsApp profile details, selected services, stylist preferences, appointment date and time, notes you type into the form, chat messages, payment status, Razorpay payment reference details, booking history, cancellation or reschedule requests, and operational support notes.",
            "We do not ask you to send sensitive medical, financial-card, or identity documents through the WhatsApp booking flow. If you voluntarily send extra information in chat, we may process it only as needed to respond to you and run the salon service.",
          ],
        },
        {
          title: "Why we use it",
          body: [
            "We use customer data to answer booking questions, show available services and stylists, hold appointment slots, collect and verify deposits, confirm or manage appointments, send reminders, support salon staff, maintain customer history, prevent duplicate or conflicting bookings, resolve disputes, and keep our systems secure.",
            "We may also use operational records to improve the booking experience, debug automation problems, comply with legal duties, and protect Salu Salon, customers, staff, and service providers from misuse or fraud.",
          ],
        },
        {
          title: "Third-party sharing",
          body: [
            "To provide the service, Salu Salon may share or make customer data available to third-party entities that help operate the booking system. These include Meta/WhatsApp for messaging and Flow forms, n8n for automation, Supabase/Postgres for database storage, Razorpay for payment links and payment verification, Google Calendar and Gmail for appointment and owner/team notifications, hosting and infrastructure providers, salon staff or managers, and legal/compliance advisers when needed.",
            "These third parties receive only the data needed for their role. They may process data under their own security, privacy, and retention practices where they independently provide their platform or service.",
          ],
        },
        {
          title: "Consent and withdrawal",
          body: [
            "Before you submit the WhatsApp booking or contact-manager form, we ask you to tick a required consent box confirming that you understand customer data will be collected by Salu Salon and may be shared with third-party entities for booking, payment, support, reminders, operations, and legal/compliance purposes.",
            `You can withdraw consent or ask a question by messaging the salon on WhatsApp or emailing ${SALU_CONTACT_EMAIL}. Withdrawal will not affect processing already completed before withdrawal, and some records may need to be kept where required for bookings, payment records, dispute handling, fraud prevention, or legal obligations.`,
          ],
        },
        {
          title: "Retention and security",
          body: [
            "We keep booking, payment, message, and customer-history records only for as long as they are useful for salon operations, customer support, dispute resolution, legal compliance, security, and audit needs.",
            "We use access controls, server-side credentials, encrypted token storage, database permissions, and operational safeguards to reduce unauthorized access. No internet-based system is perfectly secure, but we design the workflow so secrets stay in controlled server or n8n credentials rather than in customer-facing pages.",
          ],
        },
        {
          title: "Your rights",
          body: [
            "You may request access to your customer record, correction of inaccurate data, deletion where applicable, withdrawal of consent, and grievance review. We may ask you to verify the WhatsApp number or other details before acting on a request.",
            `For requests, contact ${SALU_CONTACT_EMAIL} or message Salu Salon on WhatsApp. We will respond within a reasonable period and, where the DPDP framework applies, within the time required by applicable law.`,
          ],
        },
      ]}
    />
  );
}
