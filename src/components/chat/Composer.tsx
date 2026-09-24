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

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function Composer({
  onSend,
  sending,
  onTyping,
}: {
  onSend: (msg: OutgoingMessage) => void | Promise<void>;
  sending: boolean;
  onTyping?: () => void;
}) {
  const [text, setText] = useState("");
  const [plusOpen, setPlusOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Live voice-typing state
  const [isSpeechListening, setIsSpeechListening] = useState(false);
  const [speechLang, setSpeechLang] = useState<"bn-BD" | "en-US">("en-US");
  const speechRecognitionRef = useRef<any>(null);
  const shouldKeepListeningRef = useRef<boolean>(false);
  const baseTextRef = useRef<string>("");

  // Audio message recording state
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
      shouldKeepListeningRef.current = false;
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {}
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startSpeechRecognition() {
    const win = window as unknown as IWindow;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      alert("Your browser does not support Voice Typing. Please use Chrome or Edge.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = speechLang;

      recognition.onstart = () => {
        setIsSpeechListening(true);
        shouldKeepListeningRef.current = true;
        baseTextRef.current = text;
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const prefix = baseTextRef.current ? baseTextRef.current + " " : "";
        setText(prefix + finalTranscript + interimTranscript);
        onTyping?.();
      };

      recognition.onerror = () => {
        if (!shouldKeepListeningRef.current) {
          setIsSpeechListening(false);
        }
      };

      recognition.onend = () => {
        if (shouldKeepListeningRef.current) {
          try {
            recognition.start();
          } catch {
            setIsSpeechListening(false);
          }
        } else {
          setIsSpeechListening(false);
        }
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsSpeechListening(false);
    }
  }

  function stopSpeechRecognition() {
    shouldKeepListeningRef.current = false;
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
    setIsSpeechListening(false);
  }

  function toggleSpeechRecognition() {
    if (isSpeechListening) {
      stopSpeechRecognition();
    } else {
      startSpeechRecognition();
    }
  }

  async function startRecording() {
    if (isSpeechListening) stopSpeechRecognition();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordSec(0);

      timerRef.current = window.setInterval(() => {
        setRecordSec((s) => s + 1);
      }, 1000);
    } catch {
      alert("Microphone permission denied.");
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

    void onSend({ kind: "text", body });
    setText("");
    baseTextRef.current = "";
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
      <input ref={imageRef} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files)} />
      <input ref={videoRef} type="file" accept="video/*" hidden onChange={(e) => pickFile(e.target.files)} />
      <input ref={audioRef} type="file" accept="audio/*" hidden onChange={(e) => pickFile(e.target.files)} />

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
              <PopoverContent align="start" className="w-[21rem] rounded-2xl border-border bg-popover p-2">
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
                      onEmojiClick={(e) => {
                        setText((t) => t + e.emoji);
                        baseTextRef.current += e.emoji;
                        onTyping?.();
                      }}
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

            <button
              type="button"
              onClick={toggleSpeechRecognition}
              title={isSpeechListening ? "Voice Typing Active" : "Click to speak & auto-type"}
              aria-label="Voice typing"
              className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition ${
                isSpeechListening
                  ? "bg-red-500/90 text-white shadow-lg ring-4 ring-red-500/40 animate-pulse"
                  : "glass hover:bg-white/15 text-foreground"
              }`}
            >
              <Mic className="h-5 w-5" />
              {isSpeechListening && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </button>

            {isSpeechListening && (
              <button
                type="button"
                onClick={() => {
                  const next = speechLang === "bn-BD" ? "en-US" : "bn-BD";
                  setSpeechLang(next);
                  if (speechRecognitionRef.current) speechRecognitionRef.current.lang = next;
                }}
                className="glass shrink-0 rounded-full px-2 py-1 text-[10px] font-bold text-primary"
              >
                {speechLang === "bn-BD" ? "BN" : "EN"}
              </button>
            )}

            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                baseTextRef.current = e.target.value;
                onTyping?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={isSpeechListening ? "Listening… just speak, text appears…" : "Write something sweet…"}
              className={`scroll-soft max-h-32 min-h-11 flex-1 resize-none rounded-2xl border bg-input px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/50 transition ${
                isSpeechListening ? "border-red-500/50 ring-2 ring-red-500/20" : "border-border"
              }`}
            />

            {text.trim() ? (
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                aria-label="Send"
                className="gradient-romance grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary-foreground transition hover:opacity-90 disabled:opacity-40 shadow-lg"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                aria-label="Record voice note"
                title="Click to record voice note"
                className="gradient-romance grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary-foreground transition hover:opacity-90 active:scale-95 shadow"
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </>
        ) : (
          <div className="flex w-full items-center justify-between gap-3 px-2 py-1">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="font-mono text-sm font-semibold text-red-400">{formatSec(recordSec)}</span>
              <span className="text-xs text-muted-foreground">Recording audio note…</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="glass grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={stopAndSendRecording}
                className="gradient-romance grid h-10 w-10 place-items-center rounded-full text-primary-foreground shadow"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
