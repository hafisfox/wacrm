import type { AccountRole } from '@/lib/auth/roles';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  role: string;
  beta_features?: string[];
  account_id?: string;
  account_role?: AccountRole;
  created_at: string;
}

export interface Account {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface AccountMember {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AccountRole;
  joined_at: string;
}

export interface AccountInvitation {
  id: string;
  account_id: string;
  role: Exclude<AccountRole, 'owner'>;
  created_by_user_id: string | null;
  label: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
}

export interface Contact {
  id: string;
  user_id: string;
  account_id: string;
  phone: string;
  phone_normalized?: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  whatsapp_user_id?: string | null;
  source_metadata?: Record<string, unknown>;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactNote {
  id: string;
  contact_id: string;
  account_id?: string;
  user_id: string;
  note_text: string;
  created_at: string;
}

export type ConversationStatus = 'open' | 'pending' | 'closed';

/**
 * State of the inbox's realtime socket, as reported by the Supabase
 * channel's subscribe callback. Drives the header indicator so an
 * agent can tell "quiet morning" apart from "not receiving events".
 */
export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

export interface Conversation {
  id: string;
  user_id: string;
  account_id: string;
  contact_id: string;
  status: ConversationStatus;
  assigned_agent_id?: string | null;
  last_message_text?: string | null;
  last_message_at?: string | null;
  unread_count: number;
  handoff_state?: 'none' | 'requested' | 'active' | 'resolved';
  handoff_priority?: 'normal' | 'urgent';
  handoff_reason?: string | null;
  handoff_category?: string | null;
  handoff_requested_at?: string | null;
  handoff_resolved_at?: string | null;
  bot_paused?: boolean;
  created_at: string;
  updated_at: string;
  contact?: Contact;
}

export type SenderType = 'customer' | 'agent' | 'bot';
export type ContentType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'location'
  | 'template'
  | 'interactive';
export type MessageStatus =
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id?: string | null;
  content_type: ContentType;
  content_text?: string | null;
  media_url?: string | null;
  template_name?: string | null;
  message_id?: string | null;
  status: MessageStatus;
  metadata?: Record<string, unknown>;
  created_at: string;
  reply_to_message_id?: string | null;
  interactive_reply_id?: string | null;
}

export type ReactionActor = 'customer' | 'agent';

export interface MessageReaction {
  id: string;
  message_id: string;
  conversation_id: string;
  actor_type: ReactionActor;
  actor_id?: string | null;
  emoji: string;
  created_at: string;
}

export interface WhatsAppConfig {
  id: string;
  user_id: string;
  account_id?: string;
  phone_number_id: string;
  waba_id?: string | null;
  access_token: string;
  verify_token?: string | null;
  status: 'connected' | 'disconnected';
  connected_at?: string | null;
}

export type MessageTemplateStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'PENDING_DELETION';

export type TemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string; example?: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
  | { type: 'COPY_CODE'; text: string; example: string };

export interface TemplateSampleValues {
  body?: string[];
  header?: string[];
}

export interface MessageTemplate {
  id: string;
  account_id: string;
  user_id: string;
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language?: string;
  header_type?: 'text' | 'image' | 'video' | 'document';
  header_content?: string | null;
  header_handle?: string | null;
  header_media_url?: string | null;
  body_text: string;
  footer_text?: string | null;
  buttons?: TemplateButton[];
  sample_values?: TemplateSampleValues;
  status?: MessageTemplateStatus;
  meta_template_id?: string | null;
  rejection_reason?: string | null;
  quality_score?: 'GREEN' | 'YELLOW' | 'RED' | null;
  submission_error?: string | null;
  last_submitted_at?: string | null;
  created_at: string;
}
