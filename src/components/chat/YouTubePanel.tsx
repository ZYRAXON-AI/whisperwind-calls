import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Mic,
  ExternalLink,
  Play,
  Youtube,
  Loader2,
  Maximize2,
  Radio,
  X,
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

type PageData = { videos?: YTVideo[]; continuation?: string };

type SpeechRecognitionCtor = new () => {
  lang: string;
  onresult: (e: { results: Array<Array<Array<{ transcript: string }>>> }) => void;
  start: () => void;
};

const queryFor = (cat: string, q: string) => (cat === "All" ? q : `${cat} songs`);

export function YouTubePanel({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [currentQuery, setCurrentQuery] = useState("trending songs");
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [continuation, setContinuation] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Player starts EMPTY — nothing autoplays when the panel opens
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");

  const seenRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // First page whenever the query or category changes
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setVideos([]);
    setContinuation("");
    seenRef.current = new Set();
    const query = queryFor(activeCategory, currentQuery);
    void fetch(`/api/public/youtube?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data: PageData) => {
        if (!alive) return;
        const fresh = (data.videos ?? []).filter((v) => v.id && !seenRef.current.has(v.id));
        fresh.forEach((v) => seenRef.current.add(v.id));
        setVideos(fresh);
        setContinuation(data.continuation ?? "");
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [currentQuery, activeCategory]);

  // Next page for infinite scroll (throttled, deduped, auto-stops)
  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !continuation) return;
    inFlightRef.current = true;
    setLoadingMore(true);
    try {
      const query = queryFor(activeCategory, currentQuery);
      const res = await fetch(
        `/api/public/youtube?q=${encodeURIComponent(query)}&c=${encodeURIComponent(continuation)}`
      );
      const data = (await res.json()) as PageData;
      const fresh = (data.videos ?? []).filter((v) => v.id && !seenRef.current.has(v.id));
      fresh.forEach((v) => seenRef.current.add(v.id));
      const next = data.continuation ?? "";
      setVideos((prev) => (fresh.length ? [...prev, ...fresh] : prev));
      // Stop when a page brings nothing new or the token doesn't advance
      setContinuation(fresh.length && next && next !== continuation ? next : "");
    } catch {
      setContinuation("");
    } finally {
      inFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [activeCategory, continuation, currentQuery]);

  // Infinite scroll — a fresh observer after each load re-checks the sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !continuation) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "800px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [continuation, loadMore, loadingMore]);

  function openVideo(vid: YTVideo) {
    setActiveVideoId(vid.id);
    setActiveTitle(vid.title);
    // Jump back up so the player is in view
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;

    // Paste a direct YouTube video ID or link to play instantly
    const match =
      query.match(/[?&]v=([\w-]{11})/) ||
      query.match(/youtu\.be\/([\w-]{11})/) ||
      query.match(/^([\w-]{11})$/);

    if (match?.[1]) {
      setActiveVideoId(match[1]);
      setActiveTitle("Custom YouTube Video");
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setActiveCategory("All");
    setCurrentQuery(query);
  }

  function handleVoiceSearch() {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "bn-BD";
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.[0]?.transcript ?? "";
      if (!transcript) return;
      setSearchInput(transcript);
      setCurrentQuery(transcript);
    };
    rec.start();
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#0f0f0f] text-white">
      {/* Top YouTube header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#0f0f0f] px-3 sm:px-4">
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
          <div className="flex cursor-pointer items-center gap-1">
            <div className="grid h-6 w-8 place-items-center rounded-lg bg-[#ff0000] text-white shadow-sm">
              <Play className="ml-0.5 h-3.5 w-3.5 fill-white" />
            </div>
            <span className="text-base font-bold tracking-tighter text-white">YouTube</span>
            <span className="-mt-2 text-[10px] font-medium text-white/60">BD</span>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mx-3 flex max-w-xl flex-1 items-center">
          <div className="relative flex flex-1 items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search videos, songs, natok..."
              className="h-10 w-full rounded-l-full border border-white/20 bg-[#121212] px-4 text-xs text-white placeholder-white/40 outline-none transition focus:border-blue-500 sm:text-sm"
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
            title="Search"
            className="grid h-10 w-14 place-items-center rounded-r-full border border-l-0 border-white/20 bg-white/10 transition hover:bg-white/20"
          >
            <Search className="h-4 w-4 text-white/80" />
          </button>
          <button
            type="button"
            onClick={handleVoiceSearch}
            title="Search with voice"
            className="ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <Mic className="h-4 w-4" />
          </button>
        </form>

        <div className="flex items-center gap-1 sm:gap-2">
          {activeVideoId && (
            <a
              href={`https://www.youtube.com/watch?v=${activeVideoId}`}
              target="_blank"
              rel="noreferrer"
              title="Open directly in YouTube"
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open YouTube</span>
            </a>
          )}
          <div
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
            title="More"
          >
            <Maximize2 className="h-4 w-4 text-white/70" />
          </div>
        </div>
      </header>

      {/* Category chips */}
      <div className="scrollbar-none flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-[#0f0f0f] px-3 py-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
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

      {/* Scrollable feed — player sits at the top once a video is chosen */}
      <div ref={scrollRef} className="scroll-soft flex-1 overflow-y-auto bg-[#0f0f0f]">
        {activeVideoId ? (
          <div className="sticky top-0 z-10 border-b border-white/10 bg-black shadow-lg">
            <div className="relative aspect-video w-full max-h-[46vh] bg-black">
              <iframe
                key={activeVideoId}
                src={`https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1&enablejsapi=1&rel=0`}
                title="YouTube Video Player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
              <button
                type="button"
                onClick={() => setActiveVideoId(null)}
                title="Close player"
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white transition hover:bg-black"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 bg-[#181818] px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Radio className="h-4 w-4 shrink-0 animate-pulse text-red-500" />
                <p className="truncate text-xs font-semibold text-white">{activeTitle}</p>
              </div>
              <span className="ml-3 shrink-0 text-[10px] text-white/50">now playing</span>
            </div>
          </div>
        ) : (
          !loading && (
            <div className="border-b border-white/10 bg-gradient-to-br from-[#1f1030] via-[#141420] to-[#0f0f0f] px-6 py-10 text-center">
              <Youtube className="mx-auto h-12 w-12 text-[#ff0000]" />
              <h2 className="mt-3 text-xl font-bold text-white">Watch anything from YouTube</h2>
              <p className="mt-1 text-sm text-white/60">
                Nothing plays until you choose — search above or tap a video below.
              </p>
            </div>
          )
        )}

        {/* Video grid */}
        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="grid h-40 place-items-center">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                <span>Loading real videos from YouTube…</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {videos.map((vid) => {
                const isSelected = activeVideoId === vid.id;
                return (
                  <div
                    key={vid.id}
                    onClick={() => openVideo(vid)}
                    className={`group flex cursor-pointer flex-col overflow-hidden rounded-2xl transition hover:scale-[1.015] ${
                      isSelected ? "ring-2 ring-red-500" : ""
                    }`}
                  >
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-zinc-800">
                      <img
                        src={vid.thumbnail}
                        alt={vid.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
                        {vid.duration}
                      </span>
                      <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-red-600 text-white shadow-lg">
                          <Play className="ml-0.5 h-5 w-5 fill-white" />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2.5 px-1 pt-2">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-700 text-xs font-bold uppercase text-white">
                        {vid.channel.slice(0, 1) || "Y"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-2 text-xs font-semibold leading-snug text-white transition group-hover:text-blue-400">
                          {vid.title}
                        </h4>
                        <p className="mt-0.5 truncate text-[11px] text-white/60">{vid.channel}</p>
                        <p className="text-[10px] text-white/40">{vid.views}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!loading && videos.length === 0 && (
                <div className="col-span-full py-10 text-center text-sm text-white/50">
                  No results — try another search.
                </div>
              )}
            </div>
          )}

          {/* Infinite-scroll sentinel */}
          <div ref={sentinelRef} className="h-10" />
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-white/50">
              <Loader2 className="h-4 w-4 animate-spin text-red-500" />
              <span>Loading more…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
