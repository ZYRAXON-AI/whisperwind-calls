import { useState } from "react";
import { Search, ExternalLink } from "lucide-react";

export function YouTubePanel({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [query, setQuery] = useState("");
  // নির্ভরযোগ্য এবং লাইভ ১০০% কার্যকরী ইউটিউব এম্বেড
  const [embedUrl, setEmbedUrl] = useState("https://www.youtube-nocookie.com/embed/5qap5aO4i9A?autoplay=1");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const val = query.trim();
    if (!val) return;

    const idMatch =
      val.match(/[?&]v=([\w-]{11})/) ||
      val.match(/youtu\.be\/([\w-]{11})/) ||
      val.match(/^([\w-]{11})$/);

    if (idMatch) {
      setEmbedUrl(`https://www.youtube-nocookie.com/embed/${idMatch[1]}?autoplay=1`);
    } else {
      setEmbedUrl(`https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(val)}&autoplay=1`);
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black/40">
      {/* Top Search & Actions */}
      <div className="flex items-center gap-2 border-b border-white/10 p-3 backdrop-blur-md">
        {onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            className="glass grid h-10 w-10 place-items-center rounded-full md:hidden"
          >
            ☰
          </button>
        )}
        <form onSubmit={handleSearch} className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search YouTube or paste video link…"
            className="w-full rounded-full bg-white/10 px-4 py-2 pl-10 text-sm text-white placeholder-white/50 outline-none backdrop-blur-sm focus:ring-2 focus:ring-primary/50"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
        </form>

        <a
          href="https://www.youtube.com"
          target="_blank"
          rel="noreferrer"
          className="glass flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
          title="Open in YouTube"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">YouTube</span>
        </a>
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
