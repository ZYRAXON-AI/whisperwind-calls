import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "./Avatar";
import { Composer, type OutgoingMessage } from "./Composer";
import { MediaBubble } from "./MediaBubble";
import { supabase } from "@/integrations/supabase/client";
import { kindOf, uploadMedia } from "@/lib/media";
import { pushNotify } from "@/lib/push";
import { notify, playMessageSound } from "@/lib/sounds";
import type { Message, Profile } from "@/lib/social";

function localKey(peerId: string | null, groupKey?: string) {
  return `zyraxon-messages-${groupKey ?? peerId ?? "group"}`;
}

function threadChannelName(me: string, peerId: string | null, groupKey?: string) {
  if (groupKey) return `zyraxon-thread-group-${groupKey}`;
  if (!peerId) return "zyraxon-thread-group";
  return `zyraxon-thread-${[me, peerId].sort().join("-")}`;
}

export function Conversation({
  me,
  peerId,
  profiles,
  onOpenProfile,
  active = true,
  onUnread,
  groupKey,
}: {
  me: string;
  peerId: string | null;
  profiles: Record<string, Profile> | Profile[];
  onOpenProfile: (id: string) => void;
  active?: boolean;
  onUnread?: (threadKey: string, delta: number) => void;
  groupKey?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [peerSeenMsgId, setPeerSeenMsgId] = useState<string | null>(null);
  const [seenReaders, setSeenReaders] = useState<Record<string, string[]>>({});
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const channelRef = useRef<any>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onUnreadRef = useRef(onUnread);
  onUnreadRef.current = onUnread;
  const threadKeyRef = useRef(groupKey ?? peerId ?? "group");
  threadKeyRef.current = groupKey ?? peerId ?? "group";

  const bottomRef = useRef<HTMLDivElement>(null);

  const profileMap: Record<string, Profile> = useMemo(() => {
    if (!profiles) return {};
    if (Array.isArray(profiles)) {
      return Object.fromEntries(profiles.map((p) => [p.id, p]));
    }
    return profiles;
  }, [profiles]);

  const profileMapRef = useRef(profileMap);
  profileMapRef.current = profileMap;
  const meRef = useRef(me);
  meRef.current = me;

  const belongsHere = useCallback(
    (m: Message) => {
      if (m.kind === "push_sub") return false;
      if (groupKey) {
        return m.recipient_id === groupKey;
      }
      if (peerId) {
        return (
          (m.sender_id === me && m.recipient_id === peerId) ||
          (m.sender_id === peerId && m.recipient_id === me)
        );
      }
      return m.recipient_id === null;
    },
    [me, peerId, groupKey]
  );

  const belongsHereRef = useRef(belongsHere);
  belongsHereRef.current = belongsHere;

  // Load local cache immediately
  useEffect(() => {
    try {
      const cached = localStorage.getItem(localKey(peerId, groupKey));
      if (cached) {
        setMessages(JSON.parse(cached) as Message[]);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [peerId, groupKey]);

  // Fetch messages from database
  useEffect(() => {
    let alive = true;
    void (async () => {
      let query = supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(300);

      if (groupKey) {
        query = query.eq("recipient_id", groupKey);
      } else if (peerId) {
        query = query.or(
          `and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`
        );
      } else {
        query = query.is("recipient_id", null);
      }

      const { data } = await query;
      if (alive && data) {
        const list = (data as Message[]).filter((m) => m.kind !== "push_sub");
        setMessages((prev) => {
          const map = new Map<string, Message>();
          prev.forEach((m) => map.set(m.id, m));
          list.forEach((m) => map.set(m.id, m));
          return Array.from(map.values()).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, peerId, groupKey]);

  // Persist messages locally
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(localKey(peerId, groupKey), JSON.stringify(messages.slice(-200)));
      } catch {}
    }
  }, [messages, peerId, groupKey]);

  const handleIncoming = useCallback((msg: Message) => {
    if (!belongsHereRef.current(msg)) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) {
        return prev.map((m) => (m.id === msg.id ? msg : m));
      }
      if (msg.sender_id !== meRef.current) {
        playMessageSound();
        const name = profileMapRef.current[msg.sender_id]?.display_name ?? "New message";
        notify(name, msg.body ?? "Sent you something", {
          force: true,
          tag: `msg-${msg.sender_id}`,
        });
        if (!activeRef.current) {
          toast.info(`${name}: ${msg.body ?? "Sent you something"}`);
        }
      }
      return [...prev, msg];
    });
  }, []);

  // Realtime channel
  useEffect(() => {
    const channel = supabase.channel(threadChannelName(me, peerId, groupKey));

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id?: string };
          if (old?.id) {
            setMessages((prev) => prev.filter((m) => m.id !== old.id));
          }
          return;
        }
        const next = payload.new as Message;
        if (next && next.kind !== "push_sub") {
          handleIncoming(next);
        }
      })
      .on("broadcast", { event: "guest_message" }, ({ payload }) => {
        handleIncoming(payload as Message);
      })
      .on("broadcast", { event: "message" }, ({ payload }) => {
        handleIncoming(payload as Message);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId !== me) {
          setIsPeerTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => {
            setIsPeerTyping(false);
          }, 3000);
        }
      })
      .on("broadcast", { event: "message_seen" }, ({ payload }) => {
        if (payload.readerId !== me && payload.messageId) {
          setPeerSeenMsgId(payload.messageId);
          setSeenReaders((prev) => {
            const readers = prev[payload.messageId] ?? [];
            if (readers.includes(payload.readerId)) return prev;
            return { ...prev, [payload.messageId]: [...readers, payload.readerId] };
          });
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [handleIncoming, me, peerId, groupKey]);

  useEffect(() => {
    if (!active || !messages.length || !channelRef.current) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_id !== me) {
      channelRef.current.send({
        type: "broadcast",
        event: "message_seen",
        payload: { readerId: me, messageId: lastMsg.id },
      });
    }
  }, [messages, active, me]);

  useEffect(() => {
    if (active) onUnreadRef.current?.(threadKeyRef.current, 0);
  }, [active, peerId, groupKey]);

  useEffect(() => {
    if (!active) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isPeerTyping, active]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500 && channelRef.current) {
      lastTypingSentRef.current = now;
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: me },
      });
    }
  }, [me]);

  const send = useCallback(
    async (msg: OutgoingMessage) => {
      setSending(true);
      try {
        const isGuest = profileMap[me]?.is_guest || me.includes("guest");
        const targetRecipient = groupKey ? groupKey : (peerId ?? null);

        const baseMsg: Partial<Message> = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sender_id: me,
          recipient_id: targetRecipient,
          created_at: new Date().toISOString(),
        };

        if (msg.kind === "text") {
          baseMsg.kind = "text";
          baseMsg.body = msg.body;
        } else if (msg.kind === "gif") {
          baseMsg.kind = "gif";
          baseMsg.media_url = msg.url;
        } else {
          const path = await uploadMedia(me, msg.file);
          baseMsg.kind = kindOf(msg.file);
          baseMsg.media_url = path;
          baseMsg.media_name = msg.file.name;
        }

        let saved: Message = baseMsg as Message;

        if (isGuest) {
          setMessages((prev) => [...prev, saved]);
          channelRef.current?.send({
            type: "broadcast",
            event: "guest_message",
            payload: saved,
          });
        } else {
          const { data, error } = await supabase
            .from("messages")
            .insert({
              sender_id: me,
              recipient_id: targetRecipient,
              kind: baseMsg.kind,
              body: baseMsg.body,
              media_url: baseMsg.media_url,
              media_name: baseMsg.media_name,
            })
            .select()
            .single();

          if (error) throw new Error(error.message);
          if (data) saved = data as Message;

          setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
          channelRef.current?.send({
            type: "broadcast",
            event: "message",
            payload: saved,
          });
        }

        playMessageSound();
        if (peerId && msg.kind === "text") {
          const fromName = profileMap[me]?.display_name ?? "Whisperwind";
          void pushNotify(peerId, fromName, msg.body, `msg-${me}`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? `Could not send: ${err.message}`
            : "Could not send message"
        );
      } finally {
        setSending(false);
      }
    },
    [me, peerId, profileMap, groupKey]
  );

  async function removeMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error("Could not delete message");
  }

  async function saveEdit(id: string) {
    const body = editText.trim();
    setEditingId(null);
    if (!body) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m))
    );
    const { error } = await supabase
      .from("messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Could not save edit");
  }

  const rows = useMemo(
    () => messages.filter(belongsHere).map((m) => ({ ...m, mine: m.sender_id === me })),
    [messages, belongsHere, me]
  );

  const lastMineMsg = useMemo(() => {
    const mineMsgs = rows.filter((r) => r.mine);
    return mineMsgs.length ? mineMsgs[mineMsgs.length - 1] : null;
  }, [rows]);

  const peerProfile = peerId ? profileMap[peerId] : null;

  return (
    <div className="flex h-full flex-col">
      <main className="scroll-soft mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {rows.length === 0 && (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            Say the first word. Everything here is private and real-time.
          </p>
        )}

        {rows.map((m) => {
          const author = profileMap[m.sender_id];
          const isSeenTarget =
            m.mine &&
            lastMineMsg?.id === m.id &&
            (peerSeenMsgId === m.id || (seenReaders[m.id]?.length ?? 0) > 0);

          return (
            <div
              key={m.id}
              className={`group flex items-end gap-2 ${m.mine ? "flex-row-reverse" : "flex-row"}`}
            >
              {!m.mine && (
                <button
                  type="button"
                  onClick={() => onOpenProfile(m.sender_id)}
                  className="shrink-0 transition-transform active:scale-95"
                >
                  <Avatar profile={author} className="h-7 w-7" />
                </button>
              )}

              <div className={`flex max-w-[80%] flex-col ${m.mine ? "items-end" : "items-start"}`}>
                <div
                  className={`relative rounded-3xl px-4 py-2.5 text-sm shadow transition-all ${
                    m.mine
                      ? "gradient-romance text-primary-foreground font-medium"
                      : "border border-white/15 bg-black/40 text-foreground"
                  }`}
                >
                  {editingId === m.id ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="rounded-xl border border-white/20 bg-black/50 px-2 py-1 text-sm text-white outline-none"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg p-1 hover:bg-white/20"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(m.id)}
                          className="rounded-lg p-1 hover:bg-white/20"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {m.kind === "text" && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      {m.kind !== "text" && <MediaBubble message={m} />}
                    </>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
                  <span>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {m.edited_at && <span>· edited</span>}

                  {m.mine && editingId !== m.id && (
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {m.kind === "text" && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(m.id);
                            setEditText(m.body || "");
                          }}
                          className="hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMessage(m.id)}
                        className="hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Seen indicator */}
                {isSeenTarget && (
                  <div className="mt-0.5 flex items-center gap-1 self-end pr-1">
                    {peerProfile ? (
                      <Avatar
                        profile={peerProfile}
                        className="h-3.5 w-3.5 border border-white/40 ring-1 ring-primary/40"
                      />
                    ) : (
                      <span className="text-[10px] text-zinc-400">Seen</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isPeerTyping && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span>Someone is typing...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <footer className="border-t border-white/10 p-2 sm:p-3">
        <Composer onSend={send} onTyping={notifyTyping} sending={sending} />
      </footer>
    </div>
  );
}
