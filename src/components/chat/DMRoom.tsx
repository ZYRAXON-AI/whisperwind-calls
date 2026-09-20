import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, ArrowUp, Smile, Image as ImageIcon, Paperclip, Pencil, Trash2 } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { supabase } from "@/integrations/supabase/client";
import { rawDb } from "@/lib/rawDb";
import { signedUrl, uploadMedia } from "@/lib/media";
import { MediaBubble } from "@/components/chat/MediaBubble";

type DMMessage = {
  id: string;
  body: string;
  sender_id: string;
  conversation_id: string;
  kind?: string;
  media_url?: string;
  media_name?: string;
  created_at: string;
};

interface Props {
  user: User;
  otherUserId: string;
  onBack: () => void;
}

export function DMRoom({ user, otherUserId, onBack }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showEmoji && emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmoji]);

  const resolveOrCreate = useCallback(async (): Promise<string> => {
    const { data: existing } = await rawDb.from("conversation_participants").select("conversation_id").eq("user_id", user.id);
    if (existing) {
      for (const row of existing as { conversation_id: string }[]) {
        const { data: other } = await rawDb.from("conversation_participants").select("id").eq("conversation_id", row.conversation_id).eq("user_id", otherUserId).maybeSingle();
        if (other) return row.conversation_id;
      }
    }
    const cid = crypto.randomUUID();
    await rawDb.from("conversations").insert({ id: cid });
    await rawDb.from("conversation_participants").insert([
      { conversation_id: cid, user_id: user.id },
      { conversation_id: cid, user_id: otherUserId },
    ]);
    return cid;
  }, [user.id, otherUserId]);

  const load = useCallback(async () => {
    const cid = await resolveOrCreate();
    setConversationId(cid);
    const { data } = await rawDb.from("dm_messages").select("id, body, sender_id, conversation_id, kind, media_url, media_name, created_at").eq("conversation_id", cid).order("created_at", { ascending: true });
    if (data) {
      const resolved = await Promise.all((data as DMMessage[]).map(async m => {
        if (m.media_url && !m.media_url.startsWith("http")) return { ...m, media_url: await signedUrl(m.media_url) };
        return m;
      }));
      setMessages(resolved);
    }
  }, [resolveOrCreate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase.channel(`sb-dm-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${conversationId}` }, async (payload) => {
        const m = payload.new as DMMessage;
        if (m.media_url && !m.media_url.startsWith("http")) m.media_url = await signedUrl(m.media_url);
        setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId]);

  const handleFile = async (file: File) => {
    const url = await uploadMedia(user.id, file);
    setMediaPreview({ url: URL.createObjectURL(file), type: file.type });
    setPendingFile(file);
    setBody(body || `[${file.type.startsWith("video") ? "Video" : file.type.startsWith("audio") ? "Audio" : "Image"}]`);
  };

  const send = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending || !conversationId) return;
    setSending(true);
    try {
      const kind = mediaPreview ? (pendingFile?.type.startsWith("video") ? "video" : pendingFile?.type.startsWith("audio") ? "audio" : "image") : "text";
      const row: Record<string, unknown> = {
        id: crypto.randomUUID(),
        body: trimmed,
        sender_id: user.id,
        conversation_id: conversationId,
        kind,
      };
      if (mediaPreview && pendingFile) {
        const storagePath = await uploadMedia(user.id, pendingFile);
        row.media_url = storagePath;
        row.media_name = pendingFile.name;
      }
      await rawDb.from("dm_messages").insert(row);
      setBody("");
      setMediaPreview(null);
      setPendingFile(null);
      void load();
    } finally { setSending(false); }
  };

  const handleEdit = async (id: string) => {
    if (!editBody.trim()) return;
    await rawDb.from("dm_messages").update({ body: editBody.trim() }).eq("id", id);
    setEditingId(null);
    setEditBody("");
    void load();
  };

  const handleDelete = async (id: string) => {
    await rawDb.from("dm_messages").delete().eq("id", id);
    void load();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="glass flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-full p-1 hover:bg-white/10 md:hidden"><ArrowLeft className="h-5 w-5" /></button>
        <div className="gradient-romance flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-primary-foreground">
          {otherUserId.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1"><p className="text-sm font-medium">Direct Message</p><p className="text-[11px] text-muted-foreground">{otherUserId.slice(0, 8)}...</p></div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map(m => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`group relative max-w-[80%] rounded-2xl px-4 py-2.5 ${mine ? "gradient-romance text-primary-foreground" : "glass text-foreground"}`}>
                {m.id.startsWith("ph-") && <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-muted-foreground/30 animate-pulse" />}
                {editingId === m.id ? (
                  <div className="flex flex-col gap-2">
                    <input value={editBody} onChange={e => setEditBody(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void handleEdit(m.id); if (e.key === "Escape") setEditingId(null); }} className="rounded bg-transparent text-sm outline-none" autoFocus />
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void handleEdit(m.id)} className="rounded px-2 py-0.5 text-[11px] bg-white/20 hover:bg-white/30">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded px-2 py-0.5 text-[11px] hover:bg-white/10">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.body && <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>}
                    {m.media_url && <MediaBubble url={m.media_url} type={m.kind || "image"} />}
                  </>
                )}
                {mine && editingId !== m.id && (
                  <div className="absolute -top-8 right-0 hidden gap-1 rounded-lg bg-black/60 px-1 py-0.5 group-hover:flex">
                    <button type="button" onClick={() => { setEditingId(m.id); setEditBody(m.body); }} className="rounded p-1 hover:bg-white/20"><Pencil className="h-3 w-3" /></button>
                    <button type="button" onClick={() => void handleDelete(m.id)} className="rounded p-1 hover:bg-white/20"><Trash2 className="h-3 w-3" /></button>
                  </div>
                )}
                <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border px-4 py-3">
        {mediaPreview && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
            {mediaPreview.type.startsWith("image") ? <img src={mediaPreview.url} alt="" className="h-12 w-12 rounded object-cover" /> : <Paperclip className="h-5 w-5" />}
            <span className="flex-1 truncate text-xs text-muted-foreground">{mediaPreview.type}</span>
            <button type="button" onClick={() => { setMediaPreview(null); setPendingFile(null); }} className="text-xs text-red-400 hover:text-red-300">Remove</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input type="file" ref={fileRef} className="hidden" accept="image/*,video/*,audio/*" onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full p-2.5 text-muted-foreground hover:bg-white/10"><ImageIcon className="h-5 w-5" /></button>
          <div className="relative" ref={emojiRef}>
            <button type="button" onClick={() => setShowEmoji(v => !v)} className="rounded-full p-2.5 text-muted-foreground hover:bg-white/10"><Smile className="h-5 w-5" /></button>
            {showEmoji && (
              <div className="absolute bottom-12 left-0 z-50"><EmojiPicker theme={Theme.DARK} width={300} height={350} onEmojiClick={e => { setBody(prev => prev + e.emoji); setShowEmoji(false); }} /></div>
            )}
          </div>
          <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Message..." className="glass flex-1 resize-none rounded-full bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground" />
          <button type="button" onClick={() => void send()} disabled={!body.trim() || sending} className="grid h-10 w-10 place-items-center rounded-full gradient-romance text-primary-foreground disabled:opacity-40"><ArrowUp className="h-5 w-5" /></button>
        </div>
      </div>
    </div>
  );
}
