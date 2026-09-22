import { useState } from "react";
import { ExternalLink, Play, Search, Music2, Sparkles, Heart } from "lucide-react";

const CATEGORIES = [
  { label: "🎵 Lo-Fi Beats", query: "lofi hip hop radio live" },
  { label: "💖 Romantic", query: "romantic love songs playlist" },
  { label: "🇧🇩 Bangla Hits", query: "bangla romantic acoustic songs" },
  { label: "🌙 Night Chill", query: "night drive lofi songs" },
  { label: "🎸 Acoustic", query: "best acoustic love songs" },
];

function toEmbed(input: string): string {
  const value = input.trim();
  if (!value) return "https://www.youtube-nocookie.com/embed/jfKfP4vpt88?autoplay=1";
  
  const idMatch =
    value.match(/[?&]v=([\w-]{11})/) ||
    value.match(/youtu\.be\/([\w-]{11})/) ||
    value.match(/shorts\/([\w-]{11})/) ||
    value.match(/^([\w-]{11})$/);
  if (idMatch) return `https://www.youtube-nocookie.com/embed/${idMatch[1]}?autoplay=1`;

  const listMatch = value.match(/[?&]list=([\w-]+)/);
  if (listMatch) return `https://www.youtube-nocookie.com/embed/videoseries?list=${listMatch[1]}&autoplay=1`;

  return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(value)}&autoplay=1`;
}

export function YouTubePanel() {
  const [input, setInput] = useState("");
  // ডিফল্টভাবে রোমান্টিক লো-ফাই লাইভ সরাসরি লোড হয়ে থাকবে
  const [src, setSrc] = useState<string>(
    "https://www.youtube-nocookie.com/embed/jfKfP4vpt88?autoplay=1"
  );

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) setSrc(toEmbed(input));
        }}
        className="glass-strong flex items-center gap-2 rounded-3xl p-2"
      >
        <div className="relative flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search any song, artist or paste link…"
            className="w-full rounded-2xl bg-input pl-10 pr-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        </div>

        <button
          type="submit"
          className="gradient-romance grid h-10 w-10 place-items-center rounded-full text-primary-foreground shadow"
          aria-label="Play"
        >
          <Play className="h-4 w-4" />
        </button>
        <a
          href="https://www.youtube.com"
          target="_blank"
          rel="noreferrer"
          className="glass grid h-10 w-10 place-items-center rounded-full"
          aria-label="Open YouTube in tab"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </form>

      {/* Quick Play Genre Chips */}
      <div className="scroll-soft flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => {
              setInput(cat.query);
              setSrc(toEmbed(cat.query));
            }}
            className="glass shrink-0 rounded-2xl px-3.5 py-1.5 text-xs font-medium transition hover:bg-white/15"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Direct YouTube Screen */}
      <div className="glass-strong relative flex-1 overflow-hidden rounded-3xl shadow-2xl">
        <iframe
          key={src}
          src={src}
          title="YouTube Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
