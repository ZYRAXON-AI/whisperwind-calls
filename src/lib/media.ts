import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

export async function signedUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) return hit;
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24);
  const url = data?.signedUrl ?? "";
  if (url) cache.set(path, url);
  return url;
}

export async function uploadMedia(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  return path;
}

export function kindOf(file: File): "image" | "video" | "audio" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

export async function saveLocally(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
