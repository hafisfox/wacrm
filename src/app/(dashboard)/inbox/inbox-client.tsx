"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WifiOff } from "lucide-react";

import { ContactSidebar } from "@/components/inbox/contact-sidebar";
import { ConversationList } from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Contact, Conversation, ConversationStatus, Message } from "@/types";
import { useAuth } from "@/hooks/use-auth";

function normalizeConversation(row: Conversation): Conversation {
  const maybeContact = row.contact as Contact | Contact[] | undefined;
  return {
    ...row,
    contact: Array.isArray(maybeContact) ? maybeContact[0] : maybeContact,
  };
}

function sortConversations(conversations: Conversation[]) {
  return conversations.slice().sort((a, b) => {
    const aTime = a.last_message_at || a.updated_at || a.created_at;
    const bTime = b.last_message_at || b.updated_at || b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

function upsertConversation(
  conversations: Conversation[],
  next: Conversation,
): Conversation[] {
  const hydrated = normalizeConversation(next);
  const existingIndex = conversations.findIndex((c) => c.id === hydrated.id);
  if (existingIndex === -1) return sortConversations([hydrated, ...conversations]);
  const copy = conversations.slice();
  copy[existingIndex] = { ...copy[existingIndex], ...hydrated };
  return sortConversations(copy);
}

function upsertMessage(messages: Message[], next: Message): Message[] {
  const existingIndex = messages.findIndex((m) => m.id === next.id);
  let copy = messages.slice();

  if (existingIndex >= 0) {
    copy[existingIndex] = { ...copy[existingIndex], ...next };
  } else {
    copy = copy.filter((m) => {
      if (!m.id.startsWith("temp-")) return true;
      if (m.sender_type !== next.sender_type) return true;
      if ((m.content_text || "") !== (next.content_text || "")) return true;
      return false;
    });
    copy.push(next);
  }

  return copy.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function InboxClient() {
  const { accountId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkConversationId = searchParams.get("conversation");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [whatsappConnected, setWhatsappConnected] = useState(true);
  const [resyncToken, setResyncToken] = useState(0);
  const [saluDetailsToken, setSaluDetailsToken] = useState(0);

  const activeContact = activeConversation?.contact ?? null;
  const activeConversationId = activeConversation?.id ?? null;

  const fetchConversation = useCallback(async (conversationId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .eq("id", conversationId)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error("[inbox] failed to hydrate conversation:", error);
      }
      return null;
    }

    return normalizeConversation(data as Conversation);
  }, []);

  const handleConversationsLoaded = useCallback(
    (rows: Conversation[]) => {
      const hydrated = sortConversations(rows.map(normalizeConversation));
      setConversations(hydrated);

      setActiveConversation((current) => {
        if (current) {
          const fresh = hydrated.find((c) => c.id === current.id);
          if (fresh) return fresh;
        }
        if (deepLinkConversationId) {
          return hydrated.find((c) => c.id === deepLinkConversationId) ?? current;
        }
        return current;
      });
    },
    [deepLinkConversationId],
  );

  const handleSelectConversation = useCallback(
    (conversation: Conversation) => {
      const hydrated = normalizeConversation(conversation);
      setActiveConversation(hydrated);
      setMessages([]);
      const next = new URLSearchParams(searchParams.toString());
      next.set("conversation", hydrated.id);
      router.replace(`/inbox?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleBack = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
    router.replace("/inbox", { scroll: false });
  }, [router]);

  const handleRefresh = useCallback(() => {
    setResyncToken((token) => token + 1);
    setSaluDetailsToken((token) => token + 1);
  }, []);

  const handleNewMessage = useCallback((message: Message) => {
    setMessages((prev) => upsertMessage(prev, message));
  }, []);

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id ? { ...message, ...updates } : message,
        ),
      );
    },
    [],
  );

  const handleMessagesLoaded = useCallback((loaded: Message[]) => {
    setMessages(loaded);
  }, []);

  const handleStatusChange = useCallback(
    (conversationId: string, status: ConversationStatus) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, status } : conv,
        ),
      );
      setActiveConversation((current) =>
        current?.id === conversationId ? { ...current, status } : current,
      );
    },
    [],
  );

  const handleAssignChange = useCallback(
    (conversationId: string, assignedAgentId: string | null) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? { ...conv, assigned_agent_id: assignedAgentId ?? undefined }
            : conv,
        ),
      );
      setActiveConversation((current) =>
        current?.id === conversationId
          ? { ...current, assigned_agent_id: assignedAgentId ?? undefined }
          : current,
      );
    },
    [],
  );

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from("whatsapp_config")
      .select("status")
      .eq("account_id", accountId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[inbox] WhatsApp config check failed:", error);
          setWhatsappConnected(false);
          return;
        }
        setWhatsappConnected(data?.status === "connected");
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, resyncToken]);

  useEffect(() => {
    if (!deepLinkConversationId || activeConversationId === deepLinkConversationId) {
      return;
    }
    const local = conversations.find((c) => c.id === deepLinkConversationId);
    if (local) {
      setActiveConversation(local);
      return;
    }

    let cancelled = false;
    fetchConversation(deepLinkConversationId).then((conversation) => {
      if (cancelled || !conversation) return;
      setConversations((prev) => upsertConversation(prev, conversation));
      setActiveConversation(conversation);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeConversationId,
    conversations,
    deepLinkConversationId,
    fetchConversation,
  ]);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`salu-crm-inbox:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `account_id=eq.${accountId}`,
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Conversation>;
            if (!oldRow.id) return;
            setConversations((prev) => prev.filter((c) => c.id !== oldRow.id));
            setActiveConversation((current) =>
              current?.id === oldRow.id ? null : current,
            );
            return;
          }

          const row = payload.new as Conversation;
          const hydrated = await fetchConversation(row.id);
          if (!hydrated) return;
          setConversations((prev) => upsertConversation(prev, hydrated));
          setActiveConversation((current) =>
            current?.id === hydrated.id ? { ...current, ...hydrated } : current,
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const message = payload.new as Message;
          if (message.conversation_id !== activeConversationId) return;
          setMessages((prev) => upsertMessage(prev, message));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const message = payload.new as Message;
          if (message.conversation_id !== activeConversationId) return;
          setMessages((prev) => upsertMessage(prev, message));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setResyncToken((token) => token + 1);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, activeConversationId, fetchConversation]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setResyncToken((token) => token + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const showThread = Boolean(activeConversation);

  const connectionBanner = useMemo(() => {
    if (whatsappConnected) return null;
    return (
      <div className="flex items-center gap-2 border-b border-[#233138] bg-amber-950/70 px-4 py-2 text-xs text-amber-200">
        <WifiOff className="h-4 w-4" />
        WhatsApp is not connected. You can review synced history, but replies need a connected Meta config.
      </div>
    );
  }, [whatsappConnected]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0b141a] text-slate-100">
      {connectionBanner}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "min-h-0 w-full shrink-0 lg:w-[360px]",
            showThread && "hidden lg:block",
          )}
        >
          <ConversationList
            activeConversationId={activeConversationId}
            conversations={conversations}
            onConversationsLoaded={handleConversationsLoaded}
            onSelect={handleSelectConversation}
            resyncToken={resyncToken}
          />
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            !showThread && "hidden lg:block",
          )}
        >
          <MessageThread
            conversation={activeConversation}
            contact={activeContact}
            messages={messages}
            onMessagesLoaded={handleMessagesLoaded}
            onNewMessage={handleNewMessage}
            onUpdateMessage={handleUpdateMessage}
            onStatusChange={handleStatusChange}
            onAssignChange={handleAssignChange}
            onBack={handleBack}
            resyncToken={resyncToken}
            onRefresh={handleRefresh}
            onMessageSent={() => {
              setSaluDetailsToken((token) => token + 1);
              setResyncToken((token) => token + 1);
            }}
          />
        </div>

        <div className="hidden min-h-0 shrink-0 2xl:block">
          <ContactSidebar
            contact={activeContact}
            refreshToken={saluDetailsToken}
            onTakeoverChange={() => {
              setSaluDetailsToken((token) => token + 1);
              setResyncToken((token) => token + 1);
            }}
          />
        </div>
      </div>
    </div>
  );
}
