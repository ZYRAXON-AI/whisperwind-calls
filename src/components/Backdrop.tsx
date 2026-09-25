import { useEffect, useRef, useState } from "react";

import { nextWallpaper, type Wallpaper } from "@/lib/backgrounds";

const ROTATE_MS = 60000;
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

  // Every 60s preload a brand-new random picture, then crossfade to it
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
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
          decoding="async"
          className={`absolute inset-0 h-full w-full scale-105 object-cover transition-opacity duration-[2000ms] ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute -left-40 top-[-10%] h-[36rem] w-[36rem] rounded-full bg-primary/10 blur-[70px]" />
      <div className="absolute -right-32 bottom-[-15%] h-[34rem] w-[34rem] rounded-full bg-accent/15 blur-[80px]" />
    </div>
  );
}
