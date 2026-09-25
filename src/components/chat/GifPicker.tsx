import { useEffect, useRef, useState } from "react";
import { Search, Loader2, ImageOff } from "lucide-react";

const TENOR_KEY = "AIzaSyCZt6SSh5VgVPzD9fhyzG1DprdPRhtoaR4";
const CLIENT_KEY = "zyraxon-web";
const LIMIT = 24;

type Gif = { id: string; thumb: string; full: string };

type TenorFormat = { url?: string };
type TenorResult = {
  id?: string;
  content_description?: string;
  media_formats?: Record<string, TenorFormat | undefined>;
};
type TenorResponse = {
  results?: TenorResult[];
  next?: string;
};

function formatAddr(formats: Record<string, TenorFormat | undefined> | undefined, ...names: string[]): string | undefined {
  if (!formats) return undefined;
  for (const name of names) {
    const match = formats[name];
    if (match && match["url"]) return match["url"];
  }
  return undefined;
}

async function tenorSearch(q: string, pos?: string): Promise<{ gifs: Gif[]; next: string | null }> {
  const params = new URLSearchParams({
    key: TENOR_KEY,
    client_key: CLIENT_KEY,
    limit: String(LIMIT),
    media_filter: "gif,tinygif,mp4",
  });
  if (q) params.set("q", q);
  if (pos) params.set("pos", pos);
  const url = `https://tenor.googleapis.com/v2/${q ? "search" : "featured"}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("tenor-failed");
  const json = (await res.json()) as TenorResponse;
  const gifs: Gif[] = (json["results"] ?? []).flatMap((r) => {
    const id = r["id"] ?? "g";
    const full = formatAddr(r["media_formats"], "gif", "mediumgif", "tinygif");
    const thumb = formatAddr(r["media_formats"], "tinygif", "mp4") ?? full;
    if (!full) return [];
    return [{ id, thumb, full }];
  });
  return { gifs, next: json["next"] ?? null };
}

type OpenverseImage = { id: unknown; url?: string; thumbnail?: unknown; title?: unknown };
type OpenverseResponse = { results?: OpenverseImage[] };

async function openverseSearch(q: string): Promise<Gif[]> {
  if (!q) return [];
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&extension=gif&page_size=${LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("openverse-failed");
  const json = (await res.json()) as OpenverseResponse;
  return (json["results"] ?? []).flatMap((r) => {
    const full = r["url"];
    if (!full) return [];
    const thumb =
      typeof r["thumbnail"] === "string" && r["thumbnail"] ? r["thumbnail"] : full;
    return [{ id: String(r["id"] ?? Math.random()), thumb, full }];
  });
}

export function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seq = ++seqRef.current;
    setLoading(true);
    setFailed(false);
    const t = setTimeout(async () => {
      try {
        const { gifs: items, next } = await tenorSearch(q);
        if (seq !== seqRef.current) return;
        setGifs(items);
        nextRef.current = next;
        setHasMore(Boolean(next));
        setLoading(false);
      } catch {
        try {
          const items = await openverseSearch(q);
          if (seq !== seqRef.current) return;
          setGifs(items);
          nextRef.current = null;
          setHasMore(false);
          setLoading(false);
        } catch {
          if (seq !== seqRef.current) return;
          setGifs([]);
          setHasMore(false);
          setLoading(false);
          setFailed(true);
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function loadMore() {
    const pos = nextRef.current;
    if (!pos || loadingMore) return;
    setLoadingMore(true);
    try {
      const { gifs: items, next } = await tenorSearch(q, pos);
      setGifs((prev) => {
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...items.filter((g) => !seen.has(g.id))];
      });
      nextRef.current = next;
      setHasMore(Boolean(next));
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  function onScroll() {
    const el = gridRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
      void loadMore();
    }
  }

  return (
    <div className="flex h-80 w-full flex-col gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-input px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search GIFs"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div ref={gridRef} onScroll={onScroll} className="scroll-soft grid flex-1 grid-cols-3 gap-2 overflow-y-auto pb-2">
        {loading ? (
          <div className="col-span-3 flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : failed ? (
          <div className="col-span-3 flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <span className="text-sm">GIF service unreachable — try again</span>
          </div>
        ) : gifs.length === 0 ? (
          <div className="col-span-3 py-10 text-center text-sm text-muted-foreground">
            No GIFs found
          </div>
        ) : (
          gifs.map((g) => (
            <button key={g.id} type="button" onClick={() => onPick(g.full)} className="overflow-hidden rounded-xl">
              <img
                src={g.thumb}
                alt="gif"
                loading="lazy"
                className="h-20 w-full rounded-xl object-cover transition hover:scale-105"
              />
            </button>
          ))
        )}
        {loadingMore && (
          <div className="col-span-3 flex items-center justify-center py-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {!loading && hasMore && gifs.length > 0 && (
          <button type="button" onClick={() => void loadMore()} className="col-span-3 rounded-xl bg-white/10 py-2 text-xs font-semibold transition hover:bg-white/20">
            Load more
          </button>
        )}
      </div>
    </div>
  );
}