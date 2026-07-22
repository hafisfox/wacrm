/**
 * Redaction for operator-facing summaries of customer messages.
 *
 * The dashboard activity feed is an at-a-glance ops surface: it shows
 * every recent WhatsApp event across every conversation, to every
 * operator, on whatever screen the dashboard happens to be open on.
 * Verbatim customer text does not belong there. A customer who types a
 * card number, an OTP, or an email address into WhatsApp should not
 * have it rendered on a feed nobody is specifically reading.
 *
 * The inbox thread is where a message gets read in full — it is scoped
 * to one conversation and is the operator's actual working surface.
 * That path (mapSaluEventToCrmMessage) deliberately does not come
 * through here.
 *
 * Applied server-side in loadRecentActivity, not in the component:
 * masking in the client would still ship the original string in the
 * RSC payload, where it is one devtools panel away.
 */

/** Feed rows are single-line and CSS-truncated; anything past this is unreadable anyway. */
const MAX_LENGTH = 160;

const REDACTED = '[redacted]';

/**
 * Every rule collapses to the same token, so these are deliberately
 * *not* split per identifier type — one "long digit run" pattern covers
 * phones and cards alike. Separate phone and card patterns only created
 * an ordering trap, where whichever ran first ate part of the number and
 * left the rest (a stray `+`, a trailing group) sitting in the feed.
 */
const RULES: ReadonlyArray<RegExp> = [
  // name@example.com, and UPI handles (name@okhdfcbank) which share the shape.
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)*/g,
  // 7-21 characters of digits, spaces and dashes, with an optional
  // country code: covers phone numbers and card numbers together.
  /\+?\d[\d\s-]{5,19}\d\b/g,
  // Bare 6-digit run: OTP-shaped. Deliberately not 4-5 digits — those
  // are prices and years in a salon's message traffic, and blanking
  // them would make the feed useless without protecting anything.
  /\b\d{6}\b/g,
];

/**
 * Strip identifiers from customer-authored text bound for an ops feed.
 *
 * Not a security boundary — it is defence in depth over a surface that
 * should not have been showing raw text in the first place. Treat the
 * absence of a match as "nothing matched the patterns", never as
 * "this string is safe to broadcast".
 */
export function redactCustomerText(value: string | null | undefined): string {
  if (!value) return '';

  let out = String(value);
  for (const pattern of RULES) {
    out = out.replace(pattern, REDACTED);
  }

  out = out.replace(/\s+/g, ' ').trim();

  return out.length > MAX_LENGTH ? `${out.slice(0, MAX_LENGTH - 1)}…` : out;
}
