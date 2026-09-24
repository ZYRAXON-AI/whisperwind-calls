import { useState } from "react";
import { Bell, Check, Music, Play, Square } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  RINGTONE_PRESETS,
  getSavedRingtone,
  setSavedRingtone,
  previewRingtone,
  stopRingtone,
} from "@/lib/sounds";

export function RingtoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [selected, setSelected] = useState(() => getSavedRingtone());
  const [playingId, setPlayingId] = useState<string | null>(null);

  function handleSelect(id: string) {
    setSelected(id);
    setSavedRingtone(id);
    toast.success("রিংটোন সেট করা হয়েছে! আপনি বা অন্যরা কল দিলে এই সুর বাজবে।");
  }

  function handlePlay(id: string) {
    if (playingId === id) {
      stopRingtone();
      setPlayingId(null);
    } else {
      setPlayingId(id);
      previewRingtone(id);
      setTimeout(() => {
        setPlayingId((curr) => (curr === id ? null : curr));
      }, 1800);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          stopRingtone();
          setPlayingId(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="glass-strong rounded-3xl border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Bell className="h-5 w-5 text-primary" /> Caller Tune & Ringtone
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          আপনার পছন্দমতো রিংটোন নির্বাচন করুন। আপনি যাকে কল দিবেন তার ফোনে এবং আপনাকে অন্য কেউ কল দিলে এই রিংটোনই বাজবে।
        </p>

        <div className="mt-3 flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1 scroll-soft">
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
                  onClick={() => handleSelect(preset.id)}
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
                    onClick={() => handlePlay(preset.id)}
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
                    onClick={() => handleSelect(preset.id)}
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
      </DialogContent>
    </Dialog>
  );
}
