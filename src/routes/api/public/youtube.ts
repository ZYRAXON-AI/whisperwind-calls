import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/youtube")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q") || "bangla songs";

        try {
          const res = await fetch(
            `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
            {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
              },
            }
          );

          const html = await res.text();
          const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);

          if (!match) {
            return new Response(JSON.stringify({ videos: [] }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          const parsed = JSON.parse(match[1]);
          const contents =
            parsed?.contents?.twoColumnSearchResultsRenderer?.primaryContents
              ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

          const videos: Array<{
            id: string;
            title: string;
            channel: string;
            views: string;
            duration: string;
            thumbnail: string;
          }> = [];

          for (const item of contents) {
            const vr = item.videoRenderer;
            if (!vr || !vr.videoId) continue;

            videos.push({
              id: vr.videoId,
              title: vr.title?.runs?.[0]?.text || "YouTube Video",
              channel: vr.ownerText?.runs?.[0]?.text || "Official Channel",
              views: vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || "Verified",
              duration: vr.lengthText?.simpleText || "LIVE",
              thumbnail:
                vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
                `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
            });
          }

          return new Response(JSON.stringify({ videos }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=120",
            },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message, videos: [] }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
