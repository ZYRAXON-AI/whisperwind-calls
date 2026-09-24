import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/youtube")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q") || "bangla songs";
        // Page 2+ uses YouTube's continuation token (the same value as ?sp=)
        const cont = url.searchParams.get("c");

        try {
          const target = cont
            ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=${encodeURIComponent(cont)}`
            : `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
          const res = await fetch(target, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
            },
          });

          const html = await res.text();
          const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);

          if (!match) {
            return new Response(JSON.stringify({ videos: [], continuation: "" }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          const parsed = JSON.parse(match[1]);
          const contents =
            parsed?.contents?.twoColumnSearchResultsRenderer?.primaryContents
              ?.sectionListRenderer?.contents || [];

          const videos: Array<{
            id: string;
            title: string;
            channel: string;
            views: string;
            duration: string;
            thumbnail: string;
          }> = [];
          let continuation = "";

          for (const item of contents) {
            // Token for the NEXT page of results (infinite scroll)
            if (item.continuationItemRenderer) {
              continuation =
                item.continuationItemRenderer.continuationCommand?.token ||
                item.continuationItemRenderer.continuationItemRenderer?.continuationCommand?.token ||
                continuation;
              continue;
            }
            const section = item.itemSectionRenderer?.contents || [];
            for (const sub of section) {
              const vr = sub.videoRenderer;
              if (!vr || !vr.videoId) continue;
              if (videos.some((v) => v.id === vr.videoId)) continue;

              videos.push({
                id: vr.videoId,
                title: vr.title?.runs?.[0]?.text || "YouTube Video",
                channel: vr.ownerText?.runs?.[0]?.text || "Official Channel",
                views:
                  vr.viewCountText?.simpleText ||
                  vr.shortViewCountText?.simpleText ||
                  "Verified",
                duration: vr.lengthText?.simpleText || "LIVE",
                thumbnail:
                  vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
                  `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
              });
            }
          }

          // Fallback: some page shapes bury the token elsewhere in the payload
          if (!continuation) {
            const blob = JSON.stringify(parsed);
            const tokenMatch = blob.match(/"continuationCommand":\{"token":"([^"]{20,})"/);
            if (tokenMatch) continuation = tokenMatch[1];
          }

          return new Response(JSON.stringify({ videos, continuation }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=120",
            },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message, videos: [], continuation: "" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
