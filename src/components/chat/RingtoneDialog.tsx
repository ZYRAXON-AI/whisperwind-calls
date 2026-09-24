import { useEffect, useState } from "react";
import { Bell, Check, Music, Play, Square, Search, Youtube, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  RINGTONE_PRESETS,
  getSavedRingtone,
  setSavedRingtone,
  previewRingtone,
  stopRingtone,
} from "@/lib/sounds";

interface SearchResult {
  id: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
}

export function RingtoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<"presets" | "youtube">("youtube");
  const [selected, setSelected] = useState(() => getSavedRingtone());
  const [playingId, setPlayingId] = useState<string | null>(null);

  // YouTube live search state
  const [ytQuery, setYtQuery] = useState("romantic ringtone");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  // Fetch live songs
  function triggerSearch(query: string) {
    if (!query.trim()) return;
    setSearching(true);
    fetch(`/api/public/youtube?q=${encodeURIComponent(query + " ringtone song")}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) setSearchResults(data.videos.slice(0, 20));
      })
      .catch(() => {})
      .finally(() => setSearching(false));
  }

  useEffect(() => {
    if (open && tab === "youtube" && searchResults.length === 0) {
      triggerSearch("romantic song ringtone");
    }
  }, [open, tab]);

  function handleSelectRingtone(id: string, name: string) {
    setSelected(id);
    setSavedRingtone(id);
    stopRingtone();
    setActivePreviewId(null);
    toast.success(`"${name}" successfully set as caller ringtone!`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          stopRingtone();
          setPlayingId(null);
          setActivePreviewId(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="glass-strong rounded-3xl border-border sm:max-w-xl max-h-[85vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Bell className="h-5 w-5 text-primary" /> Caller Tune & Ringtone
          </DialogTitle>
        </DialogHeader>

        {/* Tab switch */}
        <div className="flex rounded-2xl bg-white/5 p-1 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => {
              setTab("youtube");
              stopRingtone();
            }}
            className={`flex-1 rounded-xl py-2 transition flex items-center justify-center gap-1.5 ${
              tab === "youtube" ? "bg-red-600 text-white shadow" : "text-muted-foreground hover:text-white"
            }`}
          >
            <Youtube className="h-4 w-4" /> YouTube Songs
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("presets");
              setActivePreviewId(null);
            }}
            className={`flex-1 rounded-xl py-2 transition ${
              tab === "presets" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-white"
            }`}
          >
            🎵 System Presets
          </button>
        </div>

        {tab === "youtube" ? (
          <div className="mt-3 flex flex-1 flex-col gap-3 overflow-hidden">
            {/* Search form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                triggerSearch(ytQuery);
              }}
              className="relative shrink-0"
            >
              <input
                type="text"
                value={ytQuery}
                onChange={(e) => setYtQuery(e.target.value)}
                placeholder="Search any YouTube song or artist..."
                className="w-full rounded-2xl border border-white/20 bg-input px-4 py-2.5 pl-10 pr-20 text-xs text-white placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <button
                type="submit"
                className="absolute right-1.5 top-1.5 rounded-xl bg-red-600 px-3 py-1 text-xs font-bold text-white transition hover:opacity-90"
              >
                Search
              </button>
            </form>

            {/* Preview audio player frame */}
            {activePreviewId && (
              <div className="rounded-2xl border border-white/20 bg-black p-2 shrink-0">
                <div className="aspect-video w-full max-h-36 overflow-hidden rounded-xl">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${activePreviewId}?autoplay=1`}
                    title="Preview"
                    allow="autoplay"
                    className="h-full w-full border-0"
                  />
                </div>
              </div>
            )}

            {/* Hundreds of real songs */}
            <div className="flex-1 overflow-y-auto pr-1 scroll-soft flex flex-col gap-2">
              {searching ? (
                <div className="grid h-32 place-items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-red-500" />
                </div>
              ) : (
                searchResults.map((vid) => {
                  const tuneKey = `yt:${vid.id}`;
                  const isCurrent = selected === tuneKey;
                  const isPreviewing = activePreviewId === vid.id;

                  return (
                    <div
                      key={vid.id}
                      className={`glass flex items-center justify-between rounded-2xl p-2.5 transition ${
                        isCurrent ? "border-primary/50 bg-primary/10" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={vid.thumbnail}
                          alt={vid.title}
                          className="h-12 w-16 rounded-xl object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-xs font-semibold text-white">
                            {vid.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{vid.channel}</p>
                          {isCurrent && <span className="text-[10px] text-primary font-bold">(Active Ringtone)</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => setActivePreviewId(isPreviewing ? null : vid.id)}
                          className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"
                          title="Preview"
                        >
                          {isPreviewing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectRingtone(tuneKey, vid.title)}
                          className={`grid h-8 w-8 place-items-center rounded-full transition ${
                            isCurrent ? "bg-primary text-white" : "border border-white/20 text-muted-foreground hover:text-white"
                          }`}
                          title="Set as Ringtone"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1 scroll-soft">
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
                    onClick={() => handleSelectRingtone(preset.id, preset.name)}
                  >
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                        isSelected ? "bg-primary text-white" : "bg-white/10 text-foreground"
                      }`}
                    >
                      <Music className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate flex items-center gap-1.5">
                        {preset.name}
                        {isSelected && <span className="text-[10px] text-primary font-bold">(Active)</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{preset.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isPlaying) {
                          stopRingtone();
                          setPlayingId(null);
                        } else {
                          setPlayingId(preset.id);
                          previewRingtone(preset.id);
                          setTimeout(() => setPlayingId(null), 2000);
                        }
                      }}
                      className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    >
                      {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectRingtone(preset.id, preset.name)}
                      className={`grid h-8 w-8 place-items-center rounded-full ${
                        isSelected ? "bg-primary text-white" : "border border-white/20 text-muted-foreground"
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
