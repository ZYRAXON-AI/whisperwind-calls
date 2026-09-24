import { useState } from "react";
import { Search, ExternalLink, Music, Radio, Flame, Sparkles } from "lucide-react";

const PRESETS = [
  { label: "Lofi Live", q: "jfKfP4vpt88" },
  { label: "Romantic Bangla", q: "bangla romantic songs playlist" },
  { label: "Hindi Hits", q: "hindi top romantic songs 2024" },
  { label: "English Chill", q: "chill lofi english songs" },
];

export function YouTubePanel({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [query, setQuery] = useState("");
  // Lofi Girl Live Stream (100% active and embeddable)
  const [embedUrl, setEmbedUrl] = useState("https://www.youtube-nocookie.com/embed/jfKfP4vpt88?autoplay=1&enablejsapi=1");

  function playVideoOrSearch(val: string) {
    if (!val) return;
    const idMatch =
      val.match(/[?&]v=([\w-]{11})/) ||
      val.match(/youtu\.be\/([\w-]{11})/) ||
      val.match(/^([\w-]{11})$/);

    if (idMatch) {
      setEmbedUrl(`https://www.youtube-nocookie.com/embed/${idMatch[1]}?autoplay=1&enablejsapi=1`);
    } else {
      setEmbedUrl(`https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(val)}&autoplay=1&enablejsapi=1`);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    playVideoOrSearch(query.trim());
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black/50">
      {/* Top Search & Actions */}
      <div className="flex flex-col gap-2 border-b border-white/10 p-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              className="glass grid h-10 w-10 place-items-center rounded-full md:hidden text-white"
            >
              ☰
            </button>
          )}
          <form onSubmit={handleSearch} className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search song or paste YouTube link…"
              className="w-full rounded-full bg-white/10 px-4 py-2 pl-10 text-sm text-white placeholder-white/50 outline-none backdrop-blur-sm focus:ring-2 focus:ring-pink-500/50"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
          </form>

          <a
            href="https://www.youtube.com"
            target="_blank"
            rel="noreferrer"
            className="glass flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition shrink-0"
            title="Open YouTube in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open YouTube</span>
          </a>
        </div>

        {/* Quick music genre chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => playVideoOrSearch(p.q)}
              className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-white/90 hover:bg-white/20 transition shrink-0"
            >
              <Music className="h-3 w-3 text-pink-400" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Full Iframe Embed */}
      <div className="relative flex-1 w-full bg-black">
        <iframe
          key={embedUrl}
          src={embedUrl}
          title="YouTube Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
