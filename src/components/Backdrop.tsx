import { useEffect, useState } from "react";

const FALLBACK = "/bg-aurora.jpg";

const PHOTO_TOPICS = [
  "romantic+night+sky",
  "aurora+borealis",
  "sunset+love",
  "starry+night+romantic",
  "pink+clouds+dreamy",
  "ocean+sunset+romantic",
  "lavender+field+ sunset",
  "galaxy+stars+night",
  "cherry+blossom+moon",
  "aurora+mountain+lake",
];

export function Backdrop({ variant = "aurora" }: { variant?: "aurora" | "silk" }) {
  const [src, setSrc] = useState(FALLBACK);

  useEffect(() => {
    const topic = PHOTO_TOPICS[Math.floor(Math.random() * PHOTO_TOPICS.length)];
    const img = new Image();
    const url = `https://source.unsplash.com/1920x1200/?${topic}`;
    img.onload = () => setSrc(url);
    img.onerror = () => setSrc(FALLBACK);
    img.src = url;
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img
        src={src}
        alt=""
        width={1920}
        height={1200}
        className="h-full w-full scale-105 object-cover transition-opacity duration-[2000ms]"
      />
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute -left-40 top-[-10%] h-[36rem] w-[36rem] rounded-full bg-primary/25 blur-[140px]" />
      <div className="absolute -right-32 bottom-[-15%] h-[34rem] w-[34rem] rounded-full bg-accent/25 blur-[150px]" />
    </div>
  );
}
