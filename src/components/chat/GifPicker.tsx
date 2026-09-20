import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";

const KEY = "LIVDSRZULELA"; // Giphy public demo key

type Gif = { id: string; url: string };

export function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const endpoint = q
          ? `https://api.giphy.com/v1/gifs/search?api_key=${KEY}&limit=24&q=${encodeURIComponent(q)}`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${KEY}&limit=24`;
        const res = await fetch(endpoint);
        const json = (await res.json()) as {
          data?: { id: string; images: { fixed_width: { url: string } } }[];
        };
        setGifs((json.data ?? []).map((g) => ({ id: g.id, url: g.images.fixed_width.url })));
      } catch {
        setGifs([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

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
      <div className="scroll-soft grid flex-1 grid-cols-3 gap-2 overflow-y-auto">
        {loading ? (
          <div className="col-span-3 flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          gifs.map((g) => (
            <button key={g.id} type="button" onClick={() => onPick(g.url)}>
              <img src={g.url} alt="gif" loading="lazy" className="h-24 w-full rounded-lg object-cover" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
