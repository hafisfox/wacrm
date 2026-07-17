import type { Metadata } from "next";

import {
  LegalShell,
  SALU_ADDRESS,
  SALU_CONTACT_EMAIL,
} from "@/app/legal-shell";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "Terms for Salu Salon WhatsApp bookings, deposits, payments, cancellations, and customer responsibilities.",
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Terms and Conditions"
      title="Terms for WhatsApp bookings with Salu Salon"
      summary="These terms explain how Salu Salon handles WhatsApp appointment requests, slot holds, deposits, confirmations, cancellations, and customer responsibilities."
      relatedHref="/privacy"
      relatedLabel="View Privacy Policy"
      sections={[
        {
          title: "About these terms",
          body: [
            `These terms apply when you use Salu Salon's WhatsApp chat, WhatsApp Flow forms, payment links, or salon booking support. Salu Salon is located at ${SALU_ADDRESS}. You can contact us at ${SALU_CONTACT_EMAIL}.`,
            "By submitting a WhatsApp booking or contact-manager form, you confirm that the details you provide are accurate and that you agree to these terms and the Privacy Policy.",
          ],
        },
        {
          title: "Bookings and slot holds",
          body: [
            "Submitting a booking form may temporarily hold the selected stylist and service time. A hold is not a confirmed appointment until all required checks pass and, where a deposit is required, Razorpay verifies the payment.",
            "A pending hold may expire if payment is not completed in time, if the selected slot becomes unavailable, if pricing or salon setup data is invalid, or if the booking request cannot be safely processed.",
          ],
        },
        {
          title: "Payments and deposits",
          body: [
            "When a service requires payment, Salu Salon sends a Razorpay payment link for the deposit amount shown in the WhatsApp booking flow. The remaining balance, if any, is payable at the salon unless the salon confirms a different arrangement.",
            "Customer text such as paid, done, or confirmed does not confirm payment by itself. The booking is confirmed only after Razorpay payment status is verified by the system or by salon staff.",
          ],
        },
        {
          title: "Cancellations, reschedules, and refunds",
          body: [
            "You may request cancellation or rescheduling through WhatsApp. Salu Salon will process requests based on staff availability, booking state, payment status, and operational constraints.",
            "If a paid appointment is cancelled, marked unavailable after payment, or otherwise needs review, the system may mark it as refund required and alert the salon team. Refunds are reviewed manually and may depend on Razorpay records, appointment timing, service preparation, and salon policy.",
          ],
        },
        {
          title: "Customer responsibilities",
          body: [
            "Please provide accurate name, phone, appointment, and service details. Do not submit someone else's information without permission. Do not misuse the WhatsApp chat, send unlawful content, attempt to bypass payment verification, or interfere with salon systems.",
            "If you send special requests, allergies, preferences, or other notes, the salon will try to consider them but cannot guarantee every request unless confirmed by staff.",
          ],
        },
        {
          title: "Third-party services",
          body: [
            "The booking flow depends on third-party entities, including Meta/WhatsApp, n8n, Supabase/Postgres, Razorpay, Google Calendar, Gmail, hosting providers, and salon operations tools. Their service availability, processing times, outages, or policy restrictions may affect booking or messaging.",
            "Salu Salon is not responsible for delays or failures caused by third-party platforms outside its reasonable control, but we will try to help resolve operational issues when they affect your booking.",
          ],
        },
        {
          title: "Limits and changes",
          body: [
            "To the maximum extent permitted by law, Salu Salon is not liable for indirect, incidental, or consequential losses from using WhatsApp booking, payment links, or appointment automation. Nothing in these terms limits rights that cannot be limited under applicable law.",
            "Salu Salon may update these terms when the service, law, or operational process changes. The version linked from the WhatsApp booking form at the time of submission is the version we intend to apply to that submission.",
          ],
        },
      ]}
    />
  );
}
