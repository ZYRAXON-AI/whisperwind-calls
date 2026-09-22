import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Heart, Lock, Loader2, User, KeyRound, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Backdrop } from "@/components/Backdrop";
import { unlockSite, unlockAsGuest } from "@/lib/gate.functions";
import { supabase } from "@/integrations/supabase/client";

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
  const unlockGuest = useServerFn(unlockAsGuest);

  const [mode, setMode] = useState<"secret" | "guest">("secret");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Instant Account states
  const [username, setUsername] = useState("");
  const [guestPassword, setGuestPassword] = useState("");

  // 1. Permanent secret password unlock
  async function onSubmitSecret(e: React.FormEvent) {
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

  // 2. Instant account creation without verification
  async function onSubmitInstantAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !guestPassword.trim()) {
      toast.error("Please enter both username and password");
      return;
    }
    setBusy(true);
    try {
      const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const syntheticEmail = `${cleanUser}@guest.local`;

      // Try login first (if account already created earlier)
      let authRes = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: guestPassword,
      });

      // If user does not exist, sign up instantly (no verification needed)
      if (authRes.error) {
        const signUpRes = await supabase.auth.signUp({
          email: syntheticEmail,
          password: guestPassword,
          options: {
            data: {
              display_name: username.trim(),
              is_guest: true,
            },
          },
        });
        if (signUpRes.error) {
          toast.error(signUpRes.error.message);
          return;
        }
      }

      // Unlock gate in session so router lets user in
      await unlockGuest();

      toast.success(`Welcome, ${username.trim()}! Logged in without cloud storage.`);
      await router.navigate({ to: "/" });
      router.invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5 py-10">
      <Backdrop />

      <div className="glass-strong glow w-full max-w-md rounded-3xl p-8 text-center">
        <div className="gradient-romance mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-primary-foreground">
          <Heart className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">Zyraxon</h1>

        {mode === "secret" ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
              A private little world for two. Enter the secret word to come in.
            </p>

            <form onSubmit={onSubmitSecret} className="mt-6">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-input px-4 py-3">
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Secret word (zyraxonai)"
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
                Enter with Password
              </button>
            </form>

            <div className="mt-6 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={() => setMode("guest")}
                className="glass inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-white/10"
              >
                <Sparkles className="h-4 w-4" />
                No Password? Create Instant Account
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                No verification required. Chat will not be saved to cloud.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
              Create an instant account or log in with your username and password. No verification required!
            </p>

            <form onSubmit={onSubmitInstantAccount} className="mt-6 flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-input px-4 py-3">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose Username"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-border bg-input px-4 py-3">
                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="password"
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="Set Password"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <button
                type="submit"
                disabled={busy || !username || !guestPassword}
                className="gradient-romance mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Instant Login / Register
              </button>

              <button
                type="button"
                onClick={() => setMode("secret")}
                className="text-xs text-muted-foreground hover:underline mt-2"
              >
                ← Back to Secret Word
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

