import { useEffect, useState } from "react";

const PHOTOS = [
  "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920&q=80",
  "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1920&q=80",
  "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80",
  "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1920&q=80",
];

const GRADIENT =
  "linear-gradient(135deg, #1a0a2e 0%, #16213e 30%, #0f3460 60%, #533483 100%)";

export function Backdrop() {
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
    const img = new Image();
    img.onload = () => {
      setSrc(url);
      setLoaded(true);
    };
    img.onerror = () => setLoaded(true);
    img.src = url;
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="h-full w-full transition-opacity duration-[3000ms]"
        style={{
          background: loaded && src ? undefined : GRADIENT,
          opacity: loaded && src ? 1 : 0.7,
        }}
      />
      {src && (
        <img
          src={src}
          alt=""
          width={1920}
          height={1080}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[3000ms] ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
      <div className="absolute inset-0 bg-background/40" />
    </div>
  );
}
