import { supabase } from "@/integrations/supabase/client";

// VAPID public key (P-256, base64url raw uncompressed point)
const VAPID_PUBLIC = "BMTQwOGIYLAX12ie1hnjsPsSJjefO0NqnLlM6e5WgyJ1_fNTCfPBfmwyvXcHYsrdwhaHsvZX_S6ZjjRQ08swScs";

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Call once after login so Chrome closed → still gets Web Push
export async function initPushSubscription(userId: string): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (typeof Notification === "undefined") return;
    const perm =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (perm !== "granted") return;
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
      }));
    const json = sub.toJSON();
    await supabase.from("messages").insert({
      sender_id: userId,
      recipient_id: null,
      kind: "push_sub",
      body: JSON.stringify({
        userId,
        endpoint: json.endpoint,
        keys: json.keys ?? null,
      }),
    });
  } catch {}
}

// Sender fetches target's subscription (readable: recipient_id is null) and asks edge function to deliver
export async function pushNotify(
  toUserId: string | null,
  title: string,
  body: string,
  tag?: string,
  vibrate?: number[] | number
): Promise<void> {
  try {
    if (!toUserId) return;
    const { data } = await supabase
      .from("messages")
      .select("body, sender_id, created_at")
      .eq("kind", "push_sub")
      .eq("sender_id", toUserId)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (!row?.body) return;
    const parsed = JSON.parse(row.body) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string } | null;
    };
    if (!parsed.endpoint || !parsed.keys) return;
    await supabase.functions.invoke("send-push", {
      body: {
        subscription: {
          endpoint: parsed.endpoint,
          keys: parsed.keys,
        },
        title,
        body,
        tag,
        vibrate,
      },
    });
  } catch {}
}
