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
}: {
  me: string;
  peerId: string | null;
  profiles: Record<string, Profile>;
  onOpenProfile: (id: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const belongsHere = useCallback(
    (m: Message) =>
      peerId
        ? (m.sender_id === me && m.recipient_id === peerId) ||
          (m.sender_id === peerId && m.recipient_id === me)
        : m.recipient_id === null,
    [me, peerId],
  );

  // Device-local copy so the thread is there instantly, even offline.
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
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(300);
      query = peerId
        ? query.or(
            `and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`,
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
    } catch {
      /* ignore */
    }
  }, [messages, peerId]);

  useEffect(() => {
    const channel = supabase
      .channel(`zyraxon-thread-${peerId ?? "group"}`)
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
            notify(profiles[msg.sender_id]?.display_name ?? "New message", msg.body ?? "Sent you something");
          }
          return [...prev, msg];
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [belongsHere, me, peerId, profiles]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useCallback(
    async (msg: OutgoingMessage) => {
      setSending(true);
      try {
        const base = { sender_id: me, recipient_id: peerId };
        if (msg.kind === "text") {
          await supabase.from("messages").insert({ ...base, kind: "text", body: msg.body });
        } else if (msg.kind === "gif") {
          await supabase.from("messages").insert({ ...base, kind: "gif", media_url: msg.url });
        } else {
          const path = await uploadMedia(me, msg.file);
          await supabase.from("messages").insert({
            ...base,
            kind: kindOf(msg.file),
            media_url: path,
            media_name: msg.file.name,
          });
        }
      } catch {
        toast.error("Could not send that");
      } finally {
        setSending(false);
      }
    },
    [me, peerId],
  );

  async function removeMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error("Could not delete");
  }

  async function saveEdit(id: string) {
    const body = editText.trim();
    setEditingId(null);
    if (!body) return;
    const { error } = await supabase
      .from("messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Could not edit");
    else setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m)));
  }

  const rows = useMemo(
    () => messages.filter(belongsHere).map((m) => ({ ...m, mine: m.sender_id === me })),
    [messages, belongsHere, me],
  );

  return (
    <div className="flex h-full flex-col">
      <main className="scroll-soft mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {rows.length === 0 && (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            Say the first word. Everything here stays between you.
          </p>
        )}
        {rows.map((m) => {
          const author = profiles[m.sender_id];
          return (
            <div key={m.id} className={`group flex gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
              <button type="button" onClick={() => onOpenProfile(m.sender_id)} className="mt-auto">
                <Avatar profile={author} className="h-8 w-8" />
              </button>

              <div
                className={`glass max-w-[78%] rounded-3xl px-4 py-2.5 ${m.mine ? "rounded-br-lg" : "rounded-bl-lg"}`}
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
                  {m.mine && editingId !== m.id && (
                    <>
                      {m.kind === "text" && (
                        <button
                          type="button"
                          aria-label="Edit message"
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
                        aria-label="Delete message"
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
          );
        })}
        <div ref={bottomRef} />
      </main>

      <div className="mx-auto w-full max-w-3xl px-3 pb-3">
        <Composer onSend={send} sending={sending} />
      </div>
    </div>
  );
}
