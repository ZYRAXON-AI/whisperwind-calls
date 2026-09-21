import { useEffect, useState } from "react";

import { fetchWallpapers, type Wallpaper } from "@/lib/backgrounds";

export function Backdrop() {
  const [shots, setShots] = useState<Wallpaper[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetchWallpapers(8).then((w) => alive && setShots(w));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (shots.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % shots.length), 25000);
    return () => clearInterval(t);
  }, [shots.length]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {shots.map((shot, i) => (
        <img
          key={shot.id}
          src={shot.url}
          alt=""
          className={`absolute inset-0 h-full w-full scale-105 object-cover transition-opacity duration-[2500ms] ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-background/65" />
      <div className="absolute -left-40 top-[-10%] h-[36rem] w-[36rem] rounded-full bg-primary/25 blur-[140px]" />
      <div className="absolute -right-32 bottom-[-15%] h-[34rem] w-[34rem] rounded-full bg-accent/25 blur-[150px]" />
    </div>
  );
}
