import { useRef, useState } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Plus, Send, Smile, ImageIcon, Video, Music, Loader2, Mic, MicOff } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GifPicker } from "./GifPicker";
import { useSpeech } from "@/hooks/useSpeech";

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
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech();

  function submit() {
    const body = text.trim();
    if (!body) return;
    setText("");
    speech.reset();
    void onSend({ kind: "text", body });
  }

  function pickFile(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setPlusOpen(false);
    void onSend({ kind: "file", file });
  }

  function toggleMic() {
    if (speech.listening) {
      const finalText = speech.stop();
      if (finalText) setText((prev) => (prev + " " + finalText).trim());
    } else {
      speech.start((interimText) => {
        setText(interimText);
      });
    }
  }

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

        {speech.available && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={speech.listening ? "Stop speech input" : "Start speech input"}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition ${
              speech.listening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "glass hover:bg-white/15"
            }`}
          >
            {speech.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}

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
          placeholder={speech.listening ? "Listening…" : "Write something sweet…"}
          className="scroll-soft max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-input px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/50"
        />

        <button
          type="button"
          onClick={submit}
          disabled={sending || !text.trim()}
          aria-label="Send"
          className="gradient-romance grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
