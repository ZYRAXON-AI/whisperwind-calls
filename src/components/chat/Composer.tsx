import { useEffect, useRef, useState } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import {
  Plus,
  Send,
  Smile,
  ImageIcon,
  Video,
  Music,
  Loader2,
  Mic,
  Square,
  Trash2,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GifPicker } from "./GifPicker";

export type OutgoingMessage =
  | { kind: "text"; body: string }
  | { kind: "gif"; url: string }
  | { kind: "file"; file: File };

export function Composer({
  onSend,
  sending,
}: {
  onSend: (msg: OutgoingMessage) => void | Promise<void>;
  sending: boolean;
}) {
  const [text, setText] = useState("");
  const [plusOpen, setPlusOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordSec(0);

      timerRef.current = window.setInterval(() => {
        setRecordSec((s) => s + 1);
      }, 1000);
    } catch {
      alert("Microphone permission denied or not supported.");
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordSec(0);
    audioChunksRef.current = [];
  }

  function stopAndSendRecording() {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, {
        type: "audio/webm",
      });
      if (audioBlob.size > 0) {
        void onSend({ kind: "file", file: audioFile });
      }
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordSec(0);
  }

  function submit() {
    const body = text.trim();
    if (!body) return;
    setText("");
    void onSend({ kind: "text", body });
  }

  function pickFile(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setPlusOpen(false);
    void onSend({ kind: "file", file });
  }

  const formatSec = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="glass-strong sticky bottom-0 z-20 rounded-3xl p-2 sm:p-3">
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pickFile(e.target.files)}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => pickFile(e.target.files)}
      />
      <input
        ref={audioRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => pickFile(e.target.files)}
      />

      <div className="flex items-end gap-2">
        {!isRecording ? (
          <>
            <Popover open={plusOpen} onOpenChange={setPlusOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Share media"
                  className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-white/15"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 rounded-2xl border-border bg-popover p-2">
                {[
                  { icon: ImageIcon, label: "Photo", ref: imageRef },
                  { icon: Video, label: "Video", ref: videoRef },
                  { icon: Music, label: "Audio", ref: audioRef },
                ].map(({ icon: Icon, label, ref }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => ref.current?.click()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-white/10"
                  >
                    <Icon className="h-4 w-4 text-primary" /> {label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Emoji and GIF"
                  className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-white/15"
                >
                  <Smile className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[21rem] rounded-2xl border-border bg-popover p-2"
              >
                <Tabs defaultValue="emoji">
                  <TabsList className="mb-2 grid w-full grid-cols-2 bg-white/10">
                    <TabsTrigger value="emoji">Emoji</TabsTrigger>
                    <TabsTrigger value="gif">GIF</TabsTrigger>
                  </TabsList>
                  <TabsContent value="emoji">
                    <EmojiPicker
                      theme={Theme.DARK}
                      width="100%"
                      height={320}
                      lazyLoadEmojis
                      onEmojiClick={(e) => setText((t) => t + e.emoji)}
                    />
                  </TabsContent>
                  <TabsContent value="gif">
                    <GifPicker
                      onPick={(url) => {
                        setEmojiOpen(false);
                        void onSend({ kind: "gif", url });
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </PopoverContent>
            </Popover>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Write something sweet…"
              className="scroll-soft max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-input px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/50"
            />

            {text.trim() ? (
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                aria-label="Send"
                className="gradient-romance grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                aria-label="Record voice note"
                className="gradient-romance grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary-foreground transition hover:opacity-90 active:scale-95"
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </>
        ) : (
          <div className="flex w-full items-center gap-3 py-1">
            <button
              type="button"
              onClick={cancelRecording}
              className="glass grid h-11 w-11 place-items-center rounded-full text-destructive transition hover:bg-destructive/20"
              aria-label="Cancel recording"
            >
              <Trash2 className="h-5 w-5" />
            </button>

            <div className="flex flex-1 items-center gap-2.5 rounded-2xl bg-white/5 px-4 py-2.5">
              <span className="h-3 w-3 animate-ping rounded-full bg-red-500" />
              <span className="text-sm font-semibold text-red-400">Recording</span>
              <span className="ml-auto font-mono text-sm text-muted-foreground">
                {formatSec(recordSec)}
              </span>
            </div>

            <button
              type="button"
              onClick={stopAndSendRecording}
              disabled={sending}
              aria-label="Send voice note"
              className="gradient-romance flex h-11 items-center gap-2 rounded-full px-5 font-semibold text-primary-foreground shadow-lg transition hover:opacity-90"
            >
              <Square className="h-4 w-4 fill-current" />
              <span>Send</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
