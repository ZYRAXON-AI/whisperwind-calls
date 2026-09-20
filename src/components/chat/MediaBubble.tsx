import { useEffect, useState } from "react";
import { Download, FileIcon } from "lucide-react";

import { saveLocally, signedUrl } from "@/lib/media";

type Props = { kind: string; path: string; name?: string | null };

export function MediaBubble({ kind, path, name }: Props) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let alive = true;
    if (kind === "gif" || path.startsWith("http")) {
      setUrl(path);
      return;
    }
    signedUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [kind, path]);

  if (!url) {
    return <div className="h-40 w-56 animate-pulse rounded-2xl bg-muted" />;
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl">
      {kind === "image" || kind === "gif" ? (
        <img src={url} alt={name ?? "shared"} loading="lazy" className="max-h-80 rounded-2xl" />
      ) : kind === "video" ? (
        <video src={url} controls playsInline className="max-h-80 w-full rounded-2xl" />
      ) : kind === "audio" ? (
        <audio src={url} controls className="w-64" />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm"
        >
          <FileIcon className="h-4 w-4" /> {name ?? "File"}
        </a>
      )}

      {kind !== "gif" && (
        <button
          type="button"
          onClick={() => saveLocally(url, name || "zyraxon-media")}
          title="Save to this device"
          className="glass absolute right-2 top-2 rounded-full p-2 opacity-0 transition group-hover:opacity-100"
        >
          <Download className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
