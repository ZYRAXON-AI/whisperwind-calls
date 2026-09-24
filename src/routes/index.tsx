import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Heart, Loader2, Lock, Sparkles, User, KeyRound } from "lucide-react";
import { toast } from "sonner";
import type { User as SupabaseUser } from "@supabase/supabase-js";

import { Backdrop } from "@/components/Backdrop";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { checkGate, lockSite, unlockAsGuest } from "@/lib/gate.functions";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Zyraxon — Just the two of us" },
      {
        name: "description",
        content:
          "A private glass-styled space for video calls, voice calls and chatting with the one you love.",
      },
      { property: "og:title", content: "Zyraxon — Just the two of us" },
      {
        property: "og:description",
        content: "Private video calls, voice calls and chat for two.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const gate = useServerFn(checkGate);
  const lock = useServerFn(lockSite);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { unlocked } = await gate();
      if (!alive) return;
      if (!unlocked) {
        void navigate({ to: "/unlock", replace: true });
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUser(data.user ?? null);
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [gate, navigate]);

  if (!ready) {
    return (
      <div className="relative grid min-h-dvh place-items-center">
        <Backdrop />
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // লগআউটের সময় gate সম্পূর্ণ লক করে দিয়ে /unlock এ পাঠিয়ে দেবে
  async function handleSignOut() {
    await lock();
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/unlock";
  }

  if (!user) {
    return <SignIn onLock={handleSignOut} onLoggedIn={() => setReady(false)} />;
  }

  return <ChatRoom user={user} onSignOut={handleSignOut} />;
}

function SignIn({ onLock, onLoggedIn }: { onLock: () => Promise<void>; onLoggedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showGuest, setShowGuest] = useState(false);
  const [guestUser, setGuestUser] = useState("");
  const [guestPass, setGuestPass] = useState("");
  const unlockGuest = useServerFn(unlockAsGuest);

  async function signInGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Could not sign in with Google");
      return;
    }
    if (result.redirected) return;
    window.location.reload();
  }

  async function handleGuestLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!guestUser.trim() || !guestPass.trim()) {
      toast.error("Enter username and password");
      return;
    }
    setBusy(true);
    try {
      const cleanUser = guestUser.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const email = `${cleanUser}@guest.local`;

      let authRes = await supabase.auth.signInWithPassword({
        email,
        password: guestPass,
      });

      if (authRes.error) {
        const signUpRes = await supabase.auth.signUp({
          email,
          password: guestPass,
          options: {
            data: { display_name: guestUser.trim(), is_guest: true },
          },
        });
        if (signUpRes.error) {
          toast.error(signUpRes.error.message);
          return;
        }
      }

      await unlockGuest();
      toast.success(`Welcome, ${guestUser}!`);
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center px-5 py-10">
      <Backdrop />
      <div className="glass-strong glow w-full max-w-md rounded-3xl p-8 text-center">
        <div className="gradient-romance mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-primary-foreground">
          <Heart className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">Welcome in</h1>
        <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
          Sign in with Gmail or enter directly with a guest username.
        </p>

        {!showGuest ? (
          <>
            <button
              type="button"
              onClick={signInGoogle}
              disabled={busy}
              className="glass mt-7 inline-flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-3 text-sm font-semibold transition hover:bg-white/15 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
                  />
                </svg>
              )}
              Continue with Google
            </button>

            <div className="mt-5 border-t border-white/10 pt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowGuest(true)}
                className="glass inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-white/10"
              >
                <Sparkles className="h-4 w-4" />
                No Google? Use Instant Username
              </button>

              <button
                type="button"
                onClick={onLock}
                className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-white mt-1 transition"
              >
                <Lock className="h-3 w-3" /> Lock and return to secret page
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleGuestLogin} className="mt-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-input px-4 py-3">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                autoFocus
                value={guestUser}
                onChange={(e) => setGuestUser(e.target.value)}
                placeholder="Choose Username"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-border bg-input px-4 py-3">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="password"
                value={guestPass}
                onChange={(e) => setGuestPass(e.target.value)}
                placeholder="Set Password"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !guestUser || !guestPass}
              className="gradient-romance mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Instant Login / Register
            </button>

            <button
              type="button"
              onClick={() => setShowGuest(false)}
              className="text-xs text-muted-foreground hover:underline mt-2"
            >
              ← Back to Google Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

