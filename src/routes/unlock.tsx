import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Heart, Lock, Loader2 } from "lucide-react";

import { Backdrop } from "@/components/Backdrop";
import { unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Zyraxon — Private entrance" },
      { name: "description", content: "A private, password protected space for two." },
      { property: "og:title", content: "Zyraxon — Private entrance" },
      { property: "og:description", content: "A private, password protected space for two." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Unlock,
});

function Unlock() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await unlock({ data: { password } });
      if (res.ok) {
        await router.navigate({ to: "/" });
        router.invalidate();
      } else {
        setError(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5 py-10">
      <Backdrop variant="silk" />
      <form
        onSubmit={onSubmit}
        className="glass-strong glow w-full max-w-md rounded-3xl p-8 text-center"
      >
        <div className="gradient-romance mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-primary-foreground">
          <Heart className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">Zyraxon</h1>
        <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
          A private little world for two. Enter the secret word to come in.
        </p>

        <div className="mt-7 flex items-center gap-2 rounded-2xl border border-border bg-input px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Secret word"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {error && <p className="mt-3 text-sm text-destructive">That is not the secret word.</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="gradient-romance mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Enter
        </button>

        <p className="mt-4 text-xs text-muted-foreground">
          You only need this once on this device.
        </p>
      </form>
    </div>
  );
}
