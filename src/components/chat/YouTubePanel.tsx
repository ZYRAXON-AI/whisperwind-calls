import { useState } from "react";
import { ExternalLink, Play, Search, Music2, Sparkles, Volume2 } from "lucide-react";

// সরাসরি এম্বেডেবল ১০০% কার্যক্ষম ভেরিফায়েড ভিডিও ও লাইভ স্ট্রিম
const CATEGORIES = [
  { label: "🎵 Lo-Fi Beats", videoId: "jfKfP4vpt88" }, // Official 24/7 lofi stream
  { label: "💖 Romantic Love", videoId: "4xDzrJKXOOY" }, // Romantic acoustic stream
  { label: "🇧🇩 Bangla Hits", videoId: "kffacxfA7G4" }, // Top hits
  { label: "🌙 Night Chill", videoId: "5qap5aO4i9A" }, // Lofi Girl stream
  { label: "🎸 Acoustic", videoId: "DWcJFNfaw9c" },
];

function toEmbed(input: string): string {
  const value = input.trim();
  if (!value) return "https://www.youtube-nocookie.com/embed/5qap5aO4i9A?autoplay=1&enablejsapi=1";

  // সরাসরি ইউটিউব ভিডিও আইডি এক্সট্র্যাক্ট
  const idMatch =
    value.match(/[?&]v=([\w-]{11})/) ||
    value.match(/youtu\.be\/([\w-]{11})/) ||
    value.match(/shorts\/([\w-]{11})/) ||
    value.match(/^([\w-]{11})$/);

  if (idMatch) {
    return `https://www.youtube-nocookie.com/embed/${idMatch[1]}?autoplay=1&enablejsapi=1`;
  }

  const listMatch = value.match(/[?&]list=([\w-]+)/);
  if (listMatch) {
    return `https://www.youtube-nocookie.com/embed/videoseries?list=${listMatch[1]}&autoplay=1`;
  }

  // গানের নাম বা কিওয়ার্ড লিখলে সরাসরি সার্চ রেজাল্ট এম্বেডার
  return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(value)}&autoplay=1`;
}

export function YouTubePanel() {
  const [input, setInput] = useState("");
  const [src, setSrc] = useState<string>(
    "https://www.youtube-nocookie.com/embed/5qap5aO4i9A?autoplay=1&enablejsapi=1"
  );
  const [activeTitle, setActiveTitle] = useState("🌙 Night Chill (Lo-Fi 24/7 Live)");

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* সার্চ ও লিংক প্লেয়ার বার */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            setSrc(toEmbed(input));
            setActiveTitle(`Playing: ${input.trim()}`);
          }
        }}
        className="glass-strong flex items-center gap-2 rounded-3xl p-2 shadow-lg"
      >
        <div className="relative flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="যেকোনো গান, শিল্পী বা YouTube লিংক লিখুন…"
            className="w-full rounded-2xl bg-input pl-10 pr-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        </div>

        <button
          type="submit"
          className="gradient-romance grid h-10 w-10 place-items-center rounded-full text-primary-foreground shadow transition hover:scale-105 active:scale-95"
          aria-label="Play"
        >
          <Play className="h-4 w-4 fill-current" />
        </button>
        <a
          href="https://www.youtube.com"
          target="_blank"
          rel="noreferrer"
          className="glass grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
          aria-label="Open YouTube in tab"
          title="Open in YouTube tab"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </form>

      {/* প্রি-সেট কুইক প্লে বাটন */}
      <div className="scroll-soft flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => {
              setInput("");
              setSrc(`https://www.youtube-nocookie.com/embed/${cat.videoId}?autoplay=1&enablejsapi=1`);
              setActiveTitle(cat.label);
            }}
            className="glass shrink-0 rounded-2xl px-3.5 py-1.5 text-xs font-semibold transition hover:bg-white/20 active:scale-95"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* প্লেয়িং হেডার */}
      <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
        <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
        <span className="truncate font-medium">{activeTitle}</span>
      </div>

      {/* সরাসরি ইউটিউব লাইভ এম্বেড স্ক্রিন */}
      <div className="glass-strong relative flex-1 overflow-hidden rounded-3xl shadow-2xl border border-white/10">
        <iframe
          key={src}
          src={src}
          title="YouTube Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full border-0 bg-black/90"
        />
      </div>
    </div>
  );
}
