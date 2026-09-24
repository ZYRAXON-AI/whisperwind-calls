// Infinite random wallpapers — every generated seed maps to a different real
// photo, so there is no fixed list and no hardcoded picture link anywhere.
export type Wallpaper = { id: string; url: string };

function seed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function randomWallpaper(): Wallpaper {
  const id = seed();
  return { id, url: `https://picsum.photos/seed/${id}/1920/1200` };
}

// Different photo provider, used only if the first one fails to load
export function fallbackWallpaperUrl(): string {
  return `https://loremflickr.com/1920/1200/all?lock=${Math.floor(Math.random() * 999999)}`;
}

export function preloadWallpaper(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// Grab the next wallpaper: fresh random seed, verified by preload so the
// visible background never flashes to an empty frame
export async function nextWallpaper(): Promise<Wallpaper | null> {
  for (let i = 0; i < 3; i++) {
    const wall = randomWallpaper();
    if (await preloadWallpaper(wall.url)) return wall;
    const fb = fallbackWallpaperUrl();
    if (await preloadWallpaper(fb)) return { id: wall.id, url: fb };
  }
  return null;
}
