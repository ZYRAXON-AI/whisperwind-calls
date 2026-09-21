import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";

function toEmbed(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const idMatch =
    value.match(/[?&]v=([\w-]{11})/) ||
    value.match(/youtu\.be\/([\w-]{11})/) ||
    value.match(/shorts\/([\w-]{11})/) ||
    value.match(/^([\w-]{11})$/);
  if (idMatch) return `https://www.youtube-nocookie.com/embed/${idMatch[1]}?autoplay=1`;
  const listMatch = value.match(/[?&]list=([\w-]+)/);
  if (listMatch) return `https://www.youtube-nocookie.com/embed/videoseries?list=${listMatch[1]}`;
  return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(value)}`;
}

export function YouTubePanel() {
  const [input, setInput] = useState("");
  const [src, setSrc] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSrc(toEmbed(input));
        }}
        className="glass-strong flex items-center gap-2 rounded-3xl p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste a YouTube link or search…"
          className="min-w-0 flex-1 rounded-2xl bg-input px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          className="gradient-romance grid h-10 w-10 place-items-center rounded-full text-primary-foreground"
          aria-label="Play"
        >
          <Play className="h-4 w-4" />
        </button>
        <a
          href="https://www.youtube.com"
          target="_blank"
          rel="noreferrer"
          className="glass grid h-10 w-10 place-items-center rounded-full"
          aria-label="Open YouTube"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </form>

      <div className="glass-strong flex-1 overflow-hidden rounded-3xl">
        {src ? (
          <iframe
            key={src}
            src={src}
            title="YouTube"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
            Paste any YouTube link — or type what you want to watch — and it plays right here.
          </div>
        )}
      </div>
    </div>
  );
}
