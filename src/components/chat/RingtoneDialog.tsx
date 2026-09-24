import { useState } from "react";
import { Bell, Check, Music, Play, Square, Search, Youtube, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  RINGTONE_PRESETS,
  getSavedRingtone,
  setSavedRingtone,
  previewRingtone,
  stopRingtone,
} from "@/lib/sounds";

const QUICK_SONGS = [
  { label: "Lofi Beats", id: "jfKfP4vpt88", title: "Lofi Girl Live Chills" },
  { label: "Romantic Melody", id: "4xDzrJKXOOY", title: "Peaceful Piano Romance" },
  { label: "Bangla Vibe", id: "kJQP7kiw5Fk", title: "Acoustic Guitar Soul" },
  { label: "English Chill", id: "5qap5aO4i9A", title: "Lofi Hip Hop Vibes" },
];

export function RingtoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<"presets" | "youtube">("presets");
  const [selected, setSelected] = useState(() => getSavedRingtone());
  const [playingId, setPlayingId] = useState<string | null>(null);

  // YouTube search & custom tune states
  const [ytQuery, setYtQuery] = useState("");
  const [previewYtId, setPreviewYtId] = useState<string | null>(null);

  function handleSelect(id: string, name?: string) {
    setSelected(id);
    setSavedRingtone(id);
    stopRingtone();
    setPreviewYtId(null);
    setPlayingId(null);
    toast.success(`রিংটোন হিসেবে "${name || id}" সফলভাবে সেট করা হয়েছে!`);
  }

  function handlePlayPreset(id: string) {
    setPreviewYtId(null);
    if (playingId === id) {
      stopRingtone();
      setPlayingId(null);
    } else {
      setPlayingId(id);
      previewRingtone(id);
      setTimeout(() => {
        setPlayingId((curr) => (curr === id ? null : curr));
      }, 2000);
    }
  }

  function handleSearchYouTube(e: React.FormEvent) {
    e.preventDefault();
    if (!ytQuery.trim()) return;

    // Check if directly a YouTube URL or 11-char ID
    const match =
      ytQuery.match(/[?&]v=([\w-]{11})/) ||
      ytQuery.match(/youtu\.be\/([\w-]{11})/) ||
      ytQuery.match(/^([\w-]{11})$/);

    if (match) {
      setPreviewYtId(match[1]);
    } else {
      // Use query string
      setPreviewYtId(encodeURIComponent(ytQuery.trim()));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          stopRingtone();
          setPlayingId(null);
          setPreviewYtId(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="glass-strong rounded-3xl border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Bell className="h-5 w-5 text-primary" /> Caller Tune & Ringtone
          </DialogTitle>
        </DialogHeader>

        {/* Tab switcher: Presets vs YouTube Search */}
        <div className="flex rounded-2xl bg-white/5 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setTab("presets");
              setPreviewYtId(null);
            }}
            className={`flex-1 rounded-xl py-2 transition ${
              tab === "presets" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-white"
            }`}
          >
            🎵 System Presets
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("youtube");
              stopRingtone();
            }}
            className={`flex-1 rounded-xl py-2 transition flex items-center justify-center gap-1.5 ${
              tab === "youtube" ? "bg-destructive text-white shadow" : "text-muted-foreground hover:text-white"
            }`}
          >
            <Youtube className="h-4 w-4" /> YouTube Songs
          </button>
        </div>

        {tab === "presets" ? (
          <div className="mt-2 flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1 scroll-soft">
            {RINGTONE_PRESETS.map((preset) => {
              const isSelected = selected === preset.id;
              const isPlaying = playingId === preset.id;

              return (
                <div
                  key={preset.id}
                  className={`glass flex items-center justify-between rounded-2xl p-3 transition ${
                    isSelected ? "border-primary/50 bg-primary/10" : "hover:bg-white/5"
                  }`}
                >
                  <div
                    className="flex flex-1 items-center gap-3 cursor-pointer"
                    onClick={() => handleSelect(preset.id, preset.name)}
                  >
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-white/10 text-foreground"
                      }`}
                    >
                      <Music className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                        {preset.name}
                        {isSelected && <span className="text-[10px] text-primary font-bold">(Active)</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{preset.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePlayPreset(preset.id)}
                      title={isPlaying ? "Stop Preview" : "Preview Sound"}
                      className={`grid h-9 w-9 place-items-center rounded-full transition ${
                        isPlaying
                          ? "bg-destructive text-destructive-foreground animate-pulse"
                          : "bg-white/10 hover:bg-white/20 text-foreground"
                      }`}
                    >
                      {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelect(preset.id, preset.name)}
                      className={`grid h-9 w-9 place-items-center rounded-full transition ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "border border-white/20 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              ইউটিউবের যেকোনো গানের নাম লিখুন বা লিংক দিন। গানটি শুনে "Set as Ringtone" চাপলেই রিংটোন সেট হয়ে যাবে!
            </p>

            <form onSubmit={handleSearchYouTube} className="relative">
              <input
                type="text"
                value={ytQuery}
                onChange={(e) => setYtQuery(e.target.value)}
                placeholder="গানের নাম বা YouTube link লিখুন..."
                className="w-full rounded-2xl border border-white/20 bg-input px-4 py-2.5 pl-10 text-xs text-white placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <button
                type="submit"
                className="absolute right-2 top-1.5 rounded-xl bg-destructive px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90"
              >
                Search
              </button>
            </form>

            {/* Quick Suggestions */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {QUICK_SONGS.map((song) => (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => {
                    setPreviewYtId(song.id);
                    setYtQuery(song.title);
                  }}
                  className="glass inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] text-white/90 hover:bg-white/20 shrink-0 transition"
                >
                  <Sparkles className="h-3 w-3 text-amber-300" />
                  {song.label}
                </button>
              ))}
            </div>

            {/* YouTube Player Preview */}
            {previewYtId && (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                <div className="relative aspect-video w-full">
                  <iframe
                    key={previewYtId}
                    src={
                      previewYtId.length === 11
                        ? `https://www.youtube-nocookie.com/embed/${previewYtId}?autoplay=1&enablejsapi=1`
                        : `https://www.youtube-nocookie.com/embed?listType=search&list=${previewYtId}&autoplay=1&enablejsapi=1`
                    }
                    title="YouTube Ringtone Preview"
                    allow="autoplay; encrypted-media"
                    className="h-full w-full border-0"
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5">
                  <span className="text-xs font-semibold text-white/90 truncate max-w-[240px]">
                    {ytQuery || "Selected YouTube Track"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelect(`yt:${previewYtId}`, ytQuery || "YouTube Track")}
                    className="gradient-romance inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white shadow transition hover:scale-105"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Set as Ringtone
                  </button>
                </div>
              </div>
            )}

            {selected.startsWith("yt:") && (
              <div className="glass flex items-center justify-between rounded-2xl p-3 border-primary/50 bg-primary/10">
                <div className="flex items-center gap-2">
                  <Youtube className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-xs font-bold text-white">Current Active Tune: Custom YouTube</p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{selected}</p>
                  </div>
                </div>
                <span className="text-[10px] text-primary font-bold">(Active)</span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

