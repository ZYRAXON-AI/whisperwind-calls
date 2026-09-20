import { useCallback, useEffect, useRef, useState } from "react";

export function useRingtone() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const play = useCallback((type: "outgoing" | "incoming") => {
    stop();
    const audio = new Audio(`/ringtones/${type}.mp3`);
    audio.loop = true;
    audio.volume = 0.7;
    audioRef.current = audio;
    audio.play().catch(() => {});
    setPlaying(true);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return { playing, play, stop };
}
