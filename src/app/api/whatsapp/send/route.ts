import { NextResponse } from 'next/server';
import {
  ForbiddenError,
  requireRole,
  toErrorResponse,
  UnauthorizedError,
} from '@/lib/auth/account';
import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import type { MessageTemplate } from '@/types';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import { logSaluAgentMessage, setSaluHumanMode } from '@/lib/salu/crm';

async function sendN8nOwnedTextMessage({
  to,
  text,
  contextMessageId,
}: {
  to: string;
  text: string;
  contextMessageId?: string;
}) {
  const explicitUrl = process.env.SALU_N8N_MANUAL_SEND_WEBHOOK_URL;
  const n8nBase = process.env.N8N_URL?.replace(/\/$/, '');
  const url =
    explicitUrl || (n8nBase ? `${n8nBase}/webhook/salu-dashboard-send` : '');

  if (!url) {
    throw new Error(
      'N8N_URL or SALU_N8N_MANUAL_SEND_WEBHOOK_URL is required for n8n-owned WhatsApp sends'
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Salu-Source': 'dashboard',
      ...(process.env.SALU_N8N_MANUAL_SEND_TOKEN
        ? { 'X-Salu-Webhook-Secret': process.env.SALU_N8N_MANUAL_SEND_TOKEN }
        : {}),
    },
    body: JSON.stringify({
      phone: to,
      text,
      context_message_id: contextMessageId,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      payload?.error || payload?.message || `n8n webhook HTTP ${res.status}`
    );
  }

  const messageId =
    payload?.messages?.[0]?.id || payload?.message_id || payload?.id || '';

  if (!messageId) {
    throw new Error(
      'n8n send succeeded but did not return a WhatsApp message id'
    );
  }

  return { messageId };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const supabase = ctx.supabase;
    const accountId = ctx.accountId;
    const userId = ctx.userId;

    // Per-user rate limit for manual agent sends.
    const limit = checkRateLimit(`send:${userId}`, RATE_LIMITS.send);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const body = await request.json();
    const {
      conversation_id,
      message_type,
      content_text,
      media_url,
      template_name,
      template_language,
      template_params,
      template_message_params,
      reply_to_message_id,
    } = body;

    if (!conversation_id || !message_type) {
      return NextResponse.json(
        { error: 'conversation_id and message_type are required' },
        { status: 400 }
      );
    }

    if (message_type === 'text' && !content_text) {
      return NextResponse.json(
        { error: 'content_text is required for text messages' },
        { status: 400 }
      );
    }

    if (message_type === 'template' && !template_name) {
      return NextResponse.json(
        { error: 'template_name is required for template messages' },
        { status: 400 }
      );
    }

    // Fetch conversation and contact
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(*)')
      .eq('id', conversation_id)
      .eq('account_id', accountId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const contact = conversation.contact;
    if (!contact?.phone) {
      return NextResponse.json(
        { error: 'Contact phone number not found' },
        { status: 400 }
      );
    }

    // Sanitize and validate phone
    const sanitizedPhone = sanitizePhoneForMeta(contact.phone);
    if (!isValidE164(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Fetch and decrypt WhatsApp config
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single();

    const useN8nOwnedSend =
      process.env.SALU_DASHBOARD_MODE === 'n8n-owned-whatsapp' && !config;

    if ((configError || !config) && !useN8nOwnedSend) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Please set up your WhatsApp integration first.',
        },
        { status: 400 }
      );
    }

    const accessToken = config ? decrypt(config.access_token) : '';

    // Self-heal legacy CBC-encrypted tokens. Fire-and-forget: we
    // return from the send without waiting, so a failed upgrade just
    // means the next send tries again. The upgrade is idempotent —
    // concurrent sends both produce valid GCM ciphertexts of the same
    // plaintext, last write wins.
    if (config && isLegacyFormat(config.access_token)) {
      void supabase
        .from('whatsapp_config')
        .update({ access_token: encrypt(accessToken) })
        .eq('id', config.id)
        .then(({ error }) => {
          if (error) {
            console.warn(
              '[whatsapp/send] access_token GCM upgrade failed:',
              error.message
            );
          }
        });
    }

    // Resolve the reply target (if any) to its Meta message_id, which is
    // what `context.message_id` on the outgoing Meta payload needs. The
    // parent must belong to this same conversation — otherwise a caller
    // could quote messages they can't see by guessing UUIDs.
    let contextMessageId: string | undefined;
    if (reply_to_message_id) {
      const { data: parent, error: parentError } = await supabase
        .from('messages')
        .select('message_id, conversation_id')
        .eq('id', reply_to_message_id)
        .eq('conversation_id', conversation_id)
        .maybeSingle();

      if (parentError || !parent) {
        return NextResponse.json(
          { error: 'reply_to_message_id not found in this conversation' },
          { status: 400 }
        );
      }
      if (!parent.message_id) {
        // Parent never reached Meta (still in 'sending' or 'failed') — we
        // can't quote it on WhatsApp. Send without context rather than
        // dropping the message entirely.
        console.warn(
          '[whatsapp/send] reply target has no Meta message_id; sending without context'
        );
      } else {
        contextMessageId = parent.message_id;
      }
    }

    // Send via Meta API — retry with phone-number variants if Meta rejects
    // with "recipient not in allowed list" (common in sandbox / when a
    // number was registered with/without a trunk 0). If an alternate
    // format succeeds, we persist it back to the contact row so the
    // next send goes through on the first attempt.
    let waMessageId = '';
    let workingPhone = sanitizedPhone;

    // For template sends, load the row so sendTemplateMessage can
    // build header + button components from the template definition.
    // Match on (user_id, name, language) — same triple the unique
    // index enforces — so multi-language templates work correctly.
    // Missing template falls through with `templateRow = null` and
    // the legacy body-only path runs.
    // Load the template row so sendTemplateMessage can build header
    // + button components from the definition. isMessageTemplate
    // guards against a malformed row (e.g. from a partial sync)
    // crashing the send-builder later in the stack.
    let templateRow: MessageTemplate | null = null;
    if (message_type === 'template' && template_name) {
      if (!config && useN8nOwnedSend) {
        return NextResponse.json(
          {
            error:
              'Template sends require a dashboard WhatsApp config. Text replies are available through n8n-owned mode.',
          },
          { status: 400 }
        );
      }
      const { data } = await supabase
        .from('message_templates')
        .select('*')
        .eq('account_id', accountId)
        .eq('name', template_name)
        .eq('language', template_language || 'en_US')
        .maybeSingle();
      if (data && !isMessageTemplate(data)) {
        return NextResponse.json(
          {
            error:
              'Template row is malformed locally — run "Sync from Meta" in Settings to repair it.',
          },
          { status: 500 }
        );
      }
      templateRow = data ?? null;
    }

    const attempt = async (phone: string): Promise<string> => {
      if (!config && useN8nOwnedSend) {
        if (message_type !== 'text') {
          throw new Error(
            'Only text replies are supported through the n8n-owned send fallback'
          );
        }
        const result = await sendN8nOwnedTextMessage({
          to: phone,
          text: content_text,
          contextMessageId,
        });
        return result.messageId;
      }

      if (message_type === 'template') {
        const result = await sendTemplateMessage({
          phoneNumberId: config!.phone_number_id,
          accessToken,
          to: phone,
          templateName: template_name,
          language: template_language || 'en_US',
          template: templateRow ?? undefined,
          messageParams: template_message_params ?? undefined,
          // Legacy body-only fallback — only consulted when
          // messageParams.body isn't set.
          params: template_params || [],
          contextMessageId,
        });
        return result.messageId;
      }
      const result = await sendTextMessage({
        phoneNumberId: config!.phone_number_id,
        accessToken,
        to: phone,
        text: content_text,
        contextMessageId,
      });
      return result.messageId;
    };

    // Pause the bot before a human reply leaves the system.
    // A failed pause is a hard stop: sending while the bot can still answer
    // would create two competing operators in the same conversation.
    try {
      await setSaluHumanMode(
        workingPhone || contact.phone,
        true,
        'dashboard_agent_replied'
      );
    } catch (err) {
      console.error(
        '[salu] pre-send pause failed:',
        err instanceof Error ? err.message : err
      );
      return NextResponse.json(
        { error: 'Could not pause the bot. The message was not sent.' },
        { status: 503 }
      );
    }

    try {
      const variants = phoneVariants(sanitizedPhone);
      let lastError: unknown = null;

      for (const variant of variants) {
        try {
          waMessageId = await attempt(variant);
          workingPhone = variant;
          lastError = null;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Only retry when the failure is specifically that the
          // recipient isn't in Meta's allowed list. Any other error
          // (bad token, invalid template, etc.) bubbles up immediately.
          if (!isRecipientNotAllowedError(message)) {
            throw err;
          }
          lastError = err;
          console.warn(
            `[whatsapp/send] variant "${variant}" rejected by Meta, trying next…`
          );
        }
      }

      if (lastError) throw lastError;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error('Meta API send failed for all variants:', message);
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 502 }
      );
    }

    // If a non-original variant succeeded, update the contact so future
    // sends go straight through. sanitizePhoneForMeta on workingPhone
    // will yield workingPhone itself, so re-storing preserves it.
    if (workingPhone !== sanitizedPhone) {
      console.log(
        `[whatsapp/send] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`
      );
      await supabase
        .from('contacts')
        .update({ phone: workingPhone })
        .eq('id', contact.id);
    }

    // Insert message into DB — field names MUST match the messages schema
    // (see supabase/migrations/001_initial_schema.sql):
    //   conversation_id, sender_type, content_type, content_text,
    //   media_url, template_name, message_id, status, created_at
    const { data: messageRecord, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_type: 'agent',
        content_type: message_type,
        content_text: content_text || null,
        media_url: media_url || null,
        template_name: template_name || null,
        message_id: waMessageId,
        status: 'sent',
        reply_to_message_id: reply_to_message_id || null,
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error inserting sent message:', msgError);
      return NextResponse.json(
        {
          error: `Message sent to Meta but failed to save to DB: ${msgError.message}`,
        },
        { status: 500 }
      );
    }

    // Update conversation
    await supabase
      .from('conversations')
      .update({
        last_message_text: content_text || `[${message_type}]`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending',
        handoff_state: 'active',
        handoff_priority: 'urgent',
        handoff_reason: 'Agent replied from the dashboard',
        handoff_category: 'dashboard_manual',
        handoff_requested_at:
          conversation.handoff_requested_at || new Date().toISOString(),
        handoff_resolved_at: null,
        bot_paused: true,
      })
      .eq('id', conversation_id);

    // Mirror the agent message into Salu history as well. The CRM row is
    // already authoritative for the UI, so a mirror failure is recorded
    // without pretending the successful WhatsApp send failed.
    try {
      await logSaluAgentMessage({
        phone: workingPhone || contact.phone,
        messageId: waMessageId,
        text: content_text || `[${message_type}]`,
        senderId: userId,
        contentType: message_type,
      });
    } catch (err) {
      console.error(
        '[salu] agent-message mirror failed:',
        err instanceof Error ? err.message : err
      );
    }

    return NextResponse.json({
      success: true,
      message_id: messageRecord.id,
      whatsapp_message_id: waMessageId,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error);
    }
    console.error('Error in WhatsApp send POST:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
