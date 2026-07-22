'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/**
 * Copies a payment link to the clipboard.
 *
 * The deposit queue could open a link in a new tab but not hand it to
 * the customer — which is the actual job. Chasing a deposit means
 * pasting the link into WhatsApp, and that used to require opening the
 * link, then copying it out of the address bar.
 */
export function CopyLinkButton({
  value,
  label = 'Copy link',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access needs a secure context — it fails on plain
      // http:// LAN addresses. Surface the link so it can be copied by
      // hand rather than failing silently.
      toast.error(`Clipboard blocked — the link is: ${value}`);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={copy} aria-label={label}>
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied' : label}
    </Button>
  );
}
