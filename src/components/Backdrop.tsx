import { useEffect, useRef, useState } from "react";

import { nextWallpaper, type Wallpaper } from "@/lib/backgrounds";

const ROTATE_MS = 15000;
const POOL = 6;

export function Backdrop() {
  const [shots, setShots] = useState<Wallpaper[]>([]);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const first = await nextWallpaper();
      if (aliveRef.current && first) setShots((prev) => (prev.length ? prev : [first]));
    })();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Every 15s preload a brand-new random picture, then crossfade to it
  useEffect(() => {
    const t = window.setInterval(() => {
      void (async () => {
        const next = await nextWallpaper();
        if (!aliveRef.current || !next) return;
        setShots((prev) => {
          if (prev.some((p) => p.id === next.id)) return prev;
          const grown = [...prev, next];
          return grown.length > POOL ? grown.slice(grown.length - POOL) : grown;
        });
      })();
    }, ROTATE_MS);
    return () => window.clearInterval(t);
  }, []);

  const active = shots.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {shots.map((shot, i) => (
        <img
          key={shot.id}
          src={shot.url}
          alt=""
          className={`absolute inset-0 h-full w-full scale-105 object-cover transition-opacity duration-[2000ms] ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {/* Light veil — pictures stay clearly visible */}
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute -left-40 top-[-10%] h-[36rem] w-[36rem] rounded-full bg-primary/25 blur-[140px]" />
      <div className="absolute -right-32 bottom-[-15%] h-[34rem] w-[34rem] rounded-full bg-accent/25 blur-[150px]" />
    </div>
  );
}
