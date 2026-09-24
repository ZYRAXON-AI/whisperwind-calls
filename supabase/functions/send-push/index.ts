// Web Push sender for Whisperwind — VAPID keys are project-owned (private repo).
import webpush from "npm:web-push";

const VAPID_PUBLIC =
  "BMTQwOGIYLAX12ie1hnjsPsSJjefO0NqnLlM6e5WgyJ1_fNTCfPBfmwyvXcHYsrdwhaHsvZX_S6ZjjRQ08swScs";
const VAPID_PRIVATE = "X-GhjVozw63VY5gzK1CIoniRilOijDrg2A44k5cHNkI";

webpush.setVapidDetails("mailto:push@zyraxon.ai", VAPID_PUBLIC, VAPID_PRIVATE);

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }
  try {
    const payload = (await req.json()) as {
      subscription?: {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      title?: string;
      body?: string;
      tag?: string;
    };
    const sub = payload.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return new Response(JSON.stringify({ ok: false, error: "bad subscription" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      JSON.stringify({
        title: payload.title || "Whisperwind",
        body: payload.body || "",
        tag: payload.tag || "whisperwind",
        requireInteraction: true,
      })
    );
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Expired endpoint etc — still 200 so client can ignore quietly
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
