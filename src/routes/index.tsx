import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

import { Backdrop } from "@/components/Backdrop";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { checkGate } from "@/lib/gate.functions";
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
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

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

  if (!user) return <SignIn />;

  return (
    <ChatRoom
      user={user}
      onSignOut={async () => {
        await supabase.auth.signOut();
        setUser(null);
      }}
    />
  );
}

function SignIn() {
  const [busy, setBusy] = useState(false);

  async function signIn() {
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

  return (
    <div className="relative grid min-h-dvh place-items-center px-5 py-10">
      <Backdrop />
      <div className="glass-strong glow w-full max-w-md rounded-3xl p-8 text-center">
        <div className="gradient-romance mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-primary-foreground">
          <Heart className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">Welcome in</h1>
        <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
          Sign in with your Gmail account to start talking, calling and sharing.
        </p>
        <button
          type="button"
          onClick={signIn}
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
      </div>
    </div>
  );
}
