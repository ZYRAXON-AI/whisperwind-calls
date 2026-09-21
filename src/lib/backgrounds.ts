// Live wallpapers pulled from an online photo service (Picsum / Unsplash library).
const LIST_URL = "https://picsum.photos/v2/list";

export type Wallpaper = { id: string; url: string; author: string };

function sized(id: string) {
  return `https://picsum.photos/id/${id}/1920/1200`;
}

const FALLBACK_IDS = ["1015", "1016", "1018", "1036", "1043", "1039"];

export async function fetchWallpapers(count = 8): Promise<Wallpaper[]> {
  try {
    const page = 1 + Math.floor(Math.random() * 10);
    const res = await fetch(`${LIST_URL}?page=${page}&limit=30`);
    if (!res.ok) throw new Error("bad response");
    const list = (await res.json()) as { id: string; author: string }[];
    const shuffled = list.sort(() => Math.random() - 0.5).slice(0, count);
    return shuffled.map((p) => ({ id: p.id, url: sized(p.id), author: p.author }));
  } catch {
    return FALLBACK_IDS.map((id) => ({ id, url: sized(id), author: "Picsum" }));
  }
}
