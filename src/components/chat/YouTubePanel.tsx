import { useEffect, useState } from "react";
import {
  Search,
  Mic,
  ExternalLink,
  Play,
  Youtube,
  Loader2,
  Bell,
  Plus,
  Maximize2,
  Radio,
} from "lucide-react";

const CATEGORIES = [
  "All",
  "Music",
  "Mixes",
  "Natok",
  "Gaming",
  "Baul",
  "Podcasts",
  "Live",
  "Albums",
  "Dubbing",
  "Web series",
  "Action Thrillers",
];

interface YTVideo {
  id: string;
  title: string;
  channel: string;
  views: string;
  duration: string;
  thumbnail: string;
}

export function YouTubePanel({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [currentQuery, setCurrentQuery] = useState("bangla songs trending");
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [loading, setLoading] = useState(false);

  // বর্তমানে অ্যাক্টিভ প্লেয়ার ভিডিও
  const [activeVideoId, setActiveVideoId] = useState<string>("kJQP7kiw5Fk");
  const [activeTitle, setActiveTitle] = useState<string>("Mon Majhi Re - Arijit Singh");

  // লাইভ ইউটিউব থেকে সার্চ ফেচ করা
  useEffect(() => {
    let alive = true;
    setLoading(true);

    const query = activeCategory === "All" ? currentQuery : `${activeCategory} songs`;

    fetch(`/api/public/youtube?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!alive) return;
        if (data.videos && data.videos.length > 0) {
          setVideos(data.videos);
          // প্রথমবার লোড হলে প্রথম ভিডিও সেট করা
          if (activeCategory !== "All" && data.videos[0]) {
            setActiveVideoId(data.videos[0].id);
            setActiveTitle(data.videos[0].title);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [currentQuery, activeCategory]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;

    // সরাসরি ইউটিউব ভিডিও আইডি বা লিংক পেস্ট করলে সাথে সাথে প্লে
    const match =
      query.match(/[?&]v=([\w-]{11})/) ||
      query.match(/youtu\.be\/([\w-]{11})/) ||
      query.match(/^([\w-]{11})$/);

    if (match) {
      setActiveVideoId(match[1]);
      setActiveTitle("Custom YouTube Video");
      return;
    }

    setActiveCategory("All");
    setCurrentQuery(query);
  }

  function handleCategoryClick(cat: string) {
    setActiveCategory(cat);
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#0f0f0f] text-white">
      {/* ১. টপ ইউটিউব হেডার (স্ক্রিনশটের মতো হুবহু) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-3 sm:px-4 bg-[#0f0f0f]">
        {/* বামে: মেনু ও অফিসিয়াল YouTube BD লোগো */}
        <div className="flex items-center gap-3">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              className="grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10 md:hidden"
            >
              ☰
            </button>
          )}

          <div className="flex items-center gap-1 cursor-pointer">
            <div className="grid h-6 w-8 place-items-center rounded-lg bg-[#ff0000] text-white shadow-sm">
              <Play className="h-3.5 w-3.5 fill-white ml-0.5" />
            </div>
            <span className="text-base font-bold tracking-tighter text-white">YouTube</span>
            <span className="text-[10px] font-medium text-white/60 -mt-2">BD</span>
          </div>
        </div>

        {/* মাঝখানে: ইউটিউব সার্চ বার + ভয়েস সার্চ মাইক */}
        <form onSubmit={handleSearch} className="flex flex-1 max-w-xl mx-3 items-center">
          <div className="relative flex flex-1 items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search YouTube videos, songs..."
              className="h-10 w-full rounded-l-full border border-white/20 bg-[#121212] px-4 text-xs sm:text-sm text-white placeholder-white/40 outline-none focus:border-blue-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-3 text-xs text-white/50 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            className="grid h-10 w-14 place-items-center rounded-r-full border border-l-0 border-white/20 bg-white/10 hover:bg-white/20 transition"
            title="Search"
          >
            <Search className="h-4 w-4 text-white/80" />
          </button>

          <button
            type="button"
            onClick={() => {
              const SpeechRecognition =
                (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
              if (SpeechRecognition) {
                const rec = new SpeechRecognition();
                rec.lang = "bn-BD";
                rec.onresult = (e: any) => {
                  const transcript = e.results[0][0].transcript;
                  setSearchInput(transcript);
                  setCurrentQuery(transcript);
                };
                rec.start();
              }
            }}
            className="ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            title="Search with voice"
          >
            <Mic className="h-4 w-4" />
          </button>
        </form>

        {/* ডানে: Create, Bell, Open YouTube */}
        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href={`https://www.youtube.com/watch?v=${activeVideoId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition"
            title="Open directly in YouTube"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open YouTube</span>
          </a>

          <div className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 cursor-pointer">
            <Bell className="h-4 w-4 text-white" />
            <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1 text-[9px] font-bold">
              9+
            </span>
          </div>
        </div>
      </header>

      {/* ২. ক্যাটাগরি চিপস ফিল্টার (স্ক্রিনশটের মতো হরাইজন্টাল) */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 px-3 py-2 bg-[#0f0f0f] scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => handleCategoryClick(cat)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeCategory === cat
                ? "bg-white text-black shadow"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ৩. লাইভ ইউটিউব প্লেয়ার */}
      <div className="relative aspect-video w-full max-h-[46vh] bg-black shrink-0 border-b border-white/10">
        <iframe
          key={activeVideoId}
          src={`https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1&enablejsapi=1&rel=0`}
          title="YouTube Video Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>

      {/* নাউ প্লেয়িং বার */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#181818] px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <Radio className="h-4 w-4 shrink-0 text-red-500 animate-pulse" />
          <p className="truncate text-xs font-semibold text-white">{activeTitle}</p>
        </div>
      </div>

      {/* ৪. রিয়েল ভিডিও ফিড গ্রিড (স্ক্রিনশটের মতো কার্ডস) */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 scroll-soft bg-[#0f0f0f]">
        {loading ? (
          <div className="grid h-40 place-items-center">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="h-5 w-5 animate-spin text-red-500" />
              <span>Loading real videos from YouTube...</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {videos.map((vid) => {
              const isSelected = activeVideoId === vid.id;
              return (
                <div
                  key={vid.id}
                  onClick={() => {
                    setActiveVideoId(vid.id);
                    setActiveTitle(vid.title);
                  }}
                  className={`group flex flex-col cursor-pointer overflow-hidden rounded-2xl transition hover:scale-[1.01] ${
                    isSelected ? "ring-2 ring-red-500" : ""
                  }`}
                >
                  {/* থাম্বনেইল ও সময় */}
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-zinc-800">
                    <img
                      src={vid.thumbnail}
                      alt={vid.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-mono font-medium text-white">
                      {vid.duration}
                    </span>
                    <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-red-600 text-white shadow-lg">
                        <Play className="h-5 w-5 fill-white ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* ভিডিওর তথ্য */}
                  <div className="flex gap-2.5 pt-2 px-1">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-700 text-xs font-bold text-white uppercase">
                      {vid.channel.slice(0, 1) || "Y"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="line-clamp-2 text-xs font-semibold leading-snug text-white group-hover:text-blue-400 transition">
                        {vid.title}
                      </h4>
                      <p className="mt-0.5 text-[11px] text-white/60 truncate">{vid.channel}</p>
                      <p className="text-[10px] text-white/40">{vid.views}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
