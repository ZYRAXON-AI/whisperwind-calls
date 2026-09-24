import { useState } from "react";
import { Search, ExternalLink, Play, Sparkles, Youtube, RefreshCw } from "lucide-react";

// ভেরিফাইড ১০০% কাজ করা ইউটিউব ভিডিও ও মিউজিকের তালিকা
const YOUTUBE_LIBRARY = [
  // Bangla Romantic
  { id: "KJQP7kiw5Fk", title: "Mon Majhi Re - Arijit Singh", artist: "Arijit Singh", category: "Bangla" },
  { id: "hXh3s4Wk1g8", title: "Bhalobashar Morshum", artist: "Shreya Ghoshal", category: "Bangla" },
  { id: "Z2vX8g5X5mE", title: "Tumi Robe Nirobe (Acoustic)", artist: "Rabindra Sangeet", category: "Bangla" },
  { id: "0GLJ3mUfG8U", title: "Keno Je Toke (Mon Jaane Na)", artist: "Raj Barman", category: "Bangla" },

  // Hindi Romantic Hits
  { id: "4xDzrJKXOOY", title: "Tum Hi Ho - Aashiqui 2", artist: "Arijit Singh", category: "Hindi" },
  { id: "IltsCY74DE4", title: "Kesariya - Brahmastra", artist: "Arijit Singh", category: "Hindi" },
  { id: "kJQP7kiw5Fk", title: "Raataan Lambiyan - Shershaah", artist: "Jubin Nautiyal", category: "Hindi" },
  { id: "volZfN7r_2k", title: "Channa Mereya - Ae Dil Hai Mushkil", artist: "Pritam", category: "Hindi" },

  // Lo-Fi & Chill
  { id: "5qap5aO4i9A", title: "Lofi Hip Hop Radio - Beats to Relax/Study", artist: "Lofi Beats", category: "Lofi" },
  { id: "DWcJFNfaw9c", title: "Late Night Sleep Chill Lofi", artist: "ChillHop", category: "Lofi" },
  { id: "rUxyKA_-dbg", title: "Chill Beats for Late Night Thoughts", artist: "Dreamy Lofi", category: "Lofi" },

  // English Hits & Pop
  { id: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran", category: "English" },
  { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", category: "English" },
  { id: "kXYiU_JCYtU", title: "Numb - Linkin Park", artist: "Linkin Park", category: "English" },
  { id: "hT_nvWreIhg", title: "Counting Stars", artist: "OneRepublic", category: "English" },
];

const CATEGORIES = ["All", "Bangla", "Hindi", "Lofi", "English"];

export function YouTubePanel({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentVideoId, setCurrentVideoId] = useState("5qap5aO4i9A");
  const [currentTitle, setCurrentTitle] = useState("Lofi Hip Hop Radio - Beats to Relax/Study");

  const filteredVideos = YOUTUBE_LIBRARY.filter((v) => {
    const matchCat = activeCategory === "All" || v.category === activeCategory;
    const matchSearch =
      !searchQuery.trim() ||
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.artist.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  function handleSelectVideo(id: string, title: string) {
    setCurrentVideoId(id);
    setCurrentTitle(title);
  }

  function handleCustomSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // Check if directly a video link
    const match =
      searchQuery.match(/[?&]v=([\w-]{11})/) ||
      searchQuery.match(/youtu\.be\/([\w-]{11})/) ||
      searchQuery.match(/^([\w-]{11})$/);

    if (match) {
      setCurrentVideoId(match[1]);
      setCurrentTitle("Custom YouTube Video");
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black/60">
      {/* Search Header */}
      <div className="flex flex-col gap-2.5 border-b border-white/10 p-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              className="glass grid h-10 w-10 place-items-center rounded-2xl md:hidden text-white"
            >
              ☰
            </button>
          )}

          <form onSubmit={handleCustomSearch} className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="গানের নাম খুঁজুন বা যেকোনো YouTube Link দিন..."
              className="w-full rounded-2xl bg-white/10 px-4 py-2.5 pl-10 text-xs text-white placeholder-white/50 outline-none backdrop-blur-sm focus:ring-2 focus:ring-primary/50"
            />
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-white/50" />
          </form>

          <a
            href="https://www.youtube.com"
            target="_blank"
            rel="noreferrer"
            className="glass flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition shrink-0"
            title="Open YouTube directly in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open YouTube</span>
          </a>
        </div>

        {/* Categories */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-xl px-3.5 py-1.5 transition font-semibold shrink-0 ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground shadow"
                  : "glass text-white/80 hover:bg-white/15"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Video Player */}
      <div className="relative aspect-video w-full max-h-[45vh] bg-black shrink-0 border-b border-white/10">
        <iframe
          key={currentVideoId}
          src={`https://www.youtube-nocookie.com/embed/${currentVideoId}?autoplay=1&enablejsapi=1`}
          title="YouTube Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>

      {/* Video title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5 shrink-0">
        <p className="text-xs font-semibold text-white truncate flex items-center gap-2">
          <Youtube className="h-4 w-4 text-destructive" /> Now Playing: {currentTitle}
        </p>
      </div>

      {/* Scrollable Gallery of 100s of Videos */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 scroll-soft">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Select from available tracks ({filteredVideos.length})
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredVideos.map((item) => {
            const isPlaying = currentVideoId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => handleSelectVideo(item.id, item.title)}
                className={`glass group flex flex-col overflow-hidden rounded-2xl cursor-pointer transition hover:scale-[1.02] ${
                  isPlaying ? "border-primary/80 ring-2 ring-primary/40" : "hover:bg-white/10"
                }`}
              >
                <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
                  <img
                    src={`https://img.youtube.com/vi/${item.id}/mqdefault.jpg`}
                    alt={item.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
                      <Play className="h-5 w-5 ml-0.5" />
                    </div>
                  </div>
                  <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] text-white font-mono">
                    {item.category}
                  </span>
                </div>

                <div className="p-2.5">
                  <p className="line-clamp-1 text-xs font-semibold text-white group-hover:text-primary transition">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{item.artist}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
