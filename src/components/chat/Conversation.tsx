import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "./Avatar";
import { Composer, type OutgoingMessage } from "./Composer";
import { MediaBubble } from "./MediaBubble";
import { supabase } from "@/integrations/supabase/client";
import { kindOf, uploadMedia } from "@/lib/media";
import { notify, playMessageSound } from "@/lib/sounds";
import type { Message, Profile } from "@/lib/social";

function localKey(peerId: string | null) {
  return `zyraxon-messages-${peerId ?? "group"}`;
}

export function Conversation({
  me,
  peerId,
  profiles,
  onOpenProfile,
  active = true,
}: {
  me: string;
  peerId: string | null;
  profiles: Record<string, Profile> | Profile[];
  onOpenProfile: (id: string) => void;
  active?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // রিয়েলটাইম টাইপিং ও সিন (Seen) স্ট্যাটাস
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [peerSeenMsgId, setPeerSeenMsgId] = useState<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const channelRef = useRef<any>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Profile Map সেফ অবজেক্ট তৈরি (ক্র্যাশ বন্ধ করতে)
  const profileMap: Record<string, Profile> = useMemo(() => {
    if (!profiles) return {};
    if (Array.isArray(profiles)) {
      return Object.fromEntries(profiles.map((p) => [p.id, p]));
    }
    return profiles;
  }, [profiles]);

  const belongsHere = useCallback(
    (m: Message) =>
      peerId
        ? (m.sender_id === me && m.recipient_id === peerId) ||
          (m.sender_id === peerId && m.recipient_id === me)
        : m.recipient_id === null,
    [me, peerId]
  );

  useEffect(() => {
    try {
      const cached = localStorage.getItem(localKey(peerId));
      setMessages(cached ? (JSON.parse(cached) as Message[]) : []);
    } catch {
      setMessages([]);
    }
  }, [peerId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let query = supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(300);
      query = peerId
        ? query.or(
            `and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`
          )
        : query.is("recipient_id", null);
      const { data } = await query;
      if (alive && data) setMessages(data as Message[]);
    })();
    return () => {
      alive = false;
    };
  }, [me, peerId]);

  useEffect(() => {
    try {
      localStorage.setItem(localKey(peerId), JSON.stringify(messages.slice(-200)));
    } catch {}
  }, [messages, peerId]);

  // রিয়েলটাইম চ্যানেল (Messages + Typing + Seen + Guest Broadcast)
  useEffect(() => {
    const channelName = `zyraxon-thread-${peerId ?? "group"}`;
    const channel = supabase.channel(channelName);

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
          return;
        }
        const msg = payload.new as Message;
        if (!belongsHere(msg)) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) {
            return prev.map((m) => (m.id === msg.id ? msg : m));
          }
          if (msg.sender_id !== me) {
            playMessageSound();
            notify(profileMap[msg.sender_id]?.display_name ?? "New message", msg.body ?? "Sent you something");
          }
          return [...prev, msg];
        });
      })
      .on("broadcast", { event: "guest_message" }, ({ payload }) => {
        const msg = payload as Message;
        if (!belongsHere(msg)) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          if (msg.sender_id !== me) {
            playMessageSound();
            notify(profileMap[msg.sender_id]?.display_name ?? "Guest User", msg.body ?? "New message");
          }
          return [...prev, msg];
        });
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
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [belongsHere, me, peerId, profileMap]);

  // শেষ মেসেজ দেখলে অপর প্রান্তে সাথে সাথে Seen ব্রডকাস্ট পাঠানো
  useEffect(() => {
    if (!messages.length || !peerId || !channelRef.current) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_id === peerId) {
      channelRef.current.send({
        type: "broadcast",
        event: "message_seen",
        payload: { readerId: me, messageId: lastMsg.id },
      });
    }
  }, [messages, peerId, me]);

  useEffect(() => {
    // শুধু দৃশ্যমান (active) কনভার্সেশনে অটো-স্ক্রল — hidden সবগুলোতে লাগালে lag হয়
    if (!active) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isPeerTyping, active]);

  // টাইপিং থ্রটলিং
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

  // মেসেজ সেন্ড
  const send = useCallback(
    async (msg: OutgoingMessage) => {
      setSending(true);
      try {
        const isGuest = profileMap[me]?.is_guest || me.includes("guest");
        const baseMsg: Partial<Message> = {
          id: `msg-${Date.now()}`,
          sender_id: me,
          recipient_id: peerId,
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

        // গেস্টদের মেসেজ ক্লাউড ডাটাবেজে যাবে না, শুধু রিয়েলটাইমে থাকবে
        if (isGuest) {
          setMessages((prev) => [...prev, baseMsg as Message]);
          channelRef.current?.send({
            type: "broadcast",
            event: "guest_message",
            payload: baseMsg,
          });
        } else {
          await supabase.from("messages").insert({
            sender_id: me,
            recipient_id: peerId,
            kind: baseMsg.kind,
            body: baseMsg.body,
            media_url: baseMsg.media_url,
            media_name: baseMsg.media_name,
          });
        }
      } catch {
        toast.error("Could not send message");
      } finally {
        setSending(false);
      }
    },
    [me, peerId, profileMap]
  );

  async function removeMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.from("messages").delete().eq("id", id);
  }

  async function saveEdit(id: string) {
    const body = editText.trim();
    setEditingId(null);
    if (!body) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m))
    );
    await supabase.from("messages").update({ body, edited_at: new Date().toISOString() }).eq("id", id);
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
            peerId &&
            lastMineMsg?.id === m.id &&
            (peerSeenMsgId === m.id || peerSeenMsgId !== null);

          return (
            <div key={m.id} className="flex flex-col">
              <div className={`group flex gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
                <button type="button" onClick={() => onOpenProfile(m.sender_id)} className="mt-auto">
                  <Avatar profile={author} className="h-8 w-8" />
                </button>

                <div
                  className={`glass max-w-[78%] rounded-3xl px-4 py-2.5 ${
                    m.mine ? "rounded-br-lg bg-primary/20" : "rounded-bl-lg"
                  }`}
                >
                  {!m.mine && (
                    <p className="mb-1 text-[11px] font-medium text-primary">
                      {author?.display_name ?? "…"}
                    </p>
                  )}

                  {editingId === m.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void saveEdit(m.id)}
                        autoFocus
                        className="min-w-0 flex-1 rounded-xl bg-input px-3 py-1.5 text-sm outline-none"
                      />
                      <button type="button" onClick={() => void saveEdit(m.id)} aria-label="Save">
                        <Check className="h-4 w-4 text-emerald-400" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : m.kind === "text" ? (
                    <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  ) : (
                    <MediaBubble kind={m.kind} path={m.media_url ?? ""} name={m.media_name} />
                  )}

                  <div className="mt-1 flex items-center justify-end gap-2">
                    {/* শুধুমাত্র নিজের পাঠানো মেসেজে এডিট ও ডিলিট বাটন */}
                    {m.mine && editingId !== m.id && (
                      <>
                        {m.kind === "text" && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditText(m.body ?? "");
                            }}
                            className="text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void removeMessage(m.id)}
                          className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {m.edited_at ? "edited · " : ""}
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* ফেসবুক মেসেঞ্জার-স্টাইল Seen স্ট্যাটাস */}
              {isSeenTarget && peerProfile && (
                <div className="mr-10 mt-1 flex items-center justify-end gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Seen</span>
                  <div className="h-4 w-4 overflow-hidden rounded-full ring-1 ring-primary/40">
                    <Avatar profile={peerProfile} className="h-full w-full text-[8px]" />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ৩-ডট টাইপিং এনিমেশন */}
        {isPeerTyping && (
          <div className="flex items-center gap-2 pl-1">
            {peerProfile && <Avatar profile={peerProfile} className="h-7 w-7 ring-2 ring-primary/30" />}
            <div className="glass flex items-center gap-1.5 rounded-2xl px-3.5 py-2 shadow-sm border border-white/10">
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
              <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                {peerProfile ? `${peerProfile.display_name} is typing…` : "typing…"}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <div className="mx-auto w-full max-w-3xl px-3 pb-3">
        <Composer onSend={send} sending={sending} onTyping={notifyTyping} />
      </div>
    </div>
  );
}
