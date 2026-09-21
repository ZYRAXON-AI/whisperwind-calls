import { useEffect, useState } from "react";

import { signedUrl } from "@/lib/media";
import type { Profile } from "@/lib/social";

export function Avatar({
  profile,
  className = "h-10 w-10",
}: {
  profile?: Profile | null | undefined;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  const path = profile?.avatar_url ?? null;

  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl("");
      return;
    }
    if (path.startsWith("http")) {
      setUrl(path);
      return;
    }
    void signedUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);

  if (url) {
    return <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span
      className={`${className} gradient-romance grid shrink-0 place-items-center rounded-full text-sm font-semibold text-primary-foreground`}
    >
      {(profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
