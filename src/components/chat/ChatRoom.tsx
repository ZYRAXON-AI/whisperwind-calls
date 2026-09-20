import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, LogOut, Phone, Video as VideoIcon, Settings, Circle } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

import { Backdrop } from "@/components/Backdrop";
import { Composer, type OutgoingMessage } from "./Composer";
import { MediaBubble } from "./MediaBubble";
import { CallPanel } from "./CallPanel";
import { ProfileDialog, type Profile } from "./ProfileDialog";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, uploadMedia, kindOf } from "@/lib/media";
import { useCall } from "@/lib/useCall";

type Message = {
  id: string;
  sender_id: string;
  kind: string;
  body: string | null;
  media_url: string | null;
  media_name: string | null;
  created_at: string;
};

const LOCAL_KEY = "zyraxon-messages";

export function ChatRoom({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as Message[];
    } catch {
      return [];
    }
  });
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const call = useCall(user.id);

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, display_name, avatar_url");
    if (!data) return;
    const map: Record<string, Profile> = {};
    for (const p of data) map[p.id] = p as Profile;
    setProfiles(map);
    const next: Record<string, string> = {};
    await Promise.all(
      data.map(async (p) => {
        if (!p.avatar_url) return;
        next[p.id] = p.avatar_url.startsWith("http")
          ? p.avatar_url
          : await signedUrl(p.avatar_url);
      }),
    );
    setAvatars(next);
  }, []);

  useEffect(() => {
    void loadProfiles();
    void (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(300);
      if (data) setMessages(data as Message[]);
    })();
  }, [loadProfiles]);

  useEffect(() => {
    const channel = supabase
      .channel("zyraxon-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) => {
            const msg = payload.new as Message;
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void loadProfiles();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProfiles]);

  // Keep a copy on this device so the conversation is there even offline.
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(messages.slice(-200)));
    } catch {
      /* storage full — ignore */
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const me = profiles[user.id];

  const send = useCallback(
    async (msg: OutgoingMessage) => {
      setSending(true);
      try {
        if (msg.kind === "text") {
          await supabase.from("messages").insert({ sender_id: user.id, kind: "text", body: msg.body });
        } else if (msg.kind === "gif") {
          await supabase
            .from("messages")
            .insert({ sender_id: user.id, kind: "gif", media_url: msg.url });
        } else {
          const path = await uploadMedia(user.id, msg.file);
          await supabase.from("messages").insert({
            sender_id: user.id,
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
    [user.id],
  );

  const online = call.peerOnline > 0;

  const grouped = useMemo(
    () =>
      messages.map((m) => ({
        ...m,
        mine: m.sender_id === user.id,
        name: profiles[m.sender_id]?.display_name ?? "…",
        avatar: avatars[m.sender_id],
      })),
    [messages, profiles, avatars, user.id],
  );

  return (
    <div className="relative flex h-dvh flex-col">
      <Backdrop />

      <header className="glass-strong z-20 m-3 flex items-center gap-3 rounded-3xl px-4 py-3">
        <div className="gradient-romance grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground">
          <Heart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight">Zyraxon</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle
              className={`h-2 w-2 ${online ? "fill-emerald-400 text-emerald-400" : "fill-muted-foreground text-muted-foreground"}`}
            />
            {online ? "She is online" : "Waiting for her"}
          </p>
        </div>

        <button
          type="button"
          aria-label="Audio call"
          onClick={() => void call.startCall(false).catch(() => toast.error("Microphone blocked"))}
          className="glass grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
        >
          <Phone className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Video call"
          onClick={() => void call.startCall(true).catch(() => toast.error("Camera blocked"))}
          className="glass grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
        >
          <VideoIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Profile settings"
          onClick={() => setProfileOpen(true)}
          className="glass grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Sign out"
          onClick={onSignOut}
          className="glass grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="scroll-soft mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto px-3 pb-2">
        {grouped.length === 0 && (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            Say the first word. Everything here stays between you two.
          </p>
        )}
        {grouped.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
            {m.avatar ? (
              <img src={m.avatar} alt="" className="mt-auto h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="gradient-romance mt-auto grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-primary-foreground">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div
              className={`glass max-w-[78%] rounded-3xl px-4 py-2.5 ${m.mine ? "rounded-br-lg" : "rounded-bl-lg"}`}
            >
              {!m.mine && (
                <p className="mb-1 text-[11px] font-medium text-primary">{m.name}</p>
              )}
              {m.kind === "text" ? (
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
              ) : (
                <MediaBubble kind={m.kind} path={m.media_url ?? ""} name={m.media_name} />
              )}
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                {new Date(m.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      <div className="mx-auto w-full max-w-3xl px-3 pb-3">
        <Composer onSend={send} sending={sending} />
      </div>

      <CallPanel call={call} />

      {me && (
        <ProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          profile={me}
          avatarSrc={avatars[user.id] ?? ""}
          onSaved={loadProfiles}
        />
      )}
    </div>
  );
}
