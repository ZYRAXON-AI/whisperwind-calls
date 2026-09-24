import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Circle,
  Download,
  Heart,
  LogOut,
  Menu,
  Phone,
  PhoneCall,
  Play,
  Settings,
  UserPlus,
  Users,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "./Avatar";
import { CallPanel } from "./CallPanel";
import { Conversation } from "./Conversation";
import { FriendsPanel } from "./FriendsPanel";
import { ProfileDialog } from "./ProfileDialog";
import { ProfilePage } from "./ProfilePage";
import { RingtoneDialog } from "./RingtoneDialog";
import { YouTubePanel } from "./YouTubePanel";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/media";
import {
  type Friendship,
  type Profile,
  type View,
  friendIdsOf,
} from "@/lib/social";
import {
  ensureNotificationPermission,
  notify,
  playCallAlert,
  playMessageSound,
  startRingtone,
  stopRingtone,
  unlockSound,
} from "@/lib/sounds";
import { useCall } from "@/lib/useCall";

export function ChatRoom({
  user,
  onSignOut,
}: {
  user: { id: string; email?: string | null };
  onSignOut: () => void;
}) {
  const [view, setView] = useState<View>({ type: "group" });
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [profileOpen, setProfileOpen] = useState(false);
  const [ringtoneOpen, setRingtoneOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>("");
  const [navOpen, setNavOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const call = useCall(user.id);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
        toast.success("App installed successfully!");
      }
    } else {
      toast.info("To install on mobile, open the browser menu (⋮) and tap 'Install app' or 'Add to Home screen'.");
    }
  };

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*");
    if (data) {
      const map: Record<string, Profile> = {};
      for (const p of data) map[p.id] = p as Profile;
      setProfiles(map);
    }
  }, []);

  const loadFriendships = useCallback(async () => {
    const { data } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    if (data) setFriendships(data as Friendship[]);
  }, [user.id]);

  useEffect(() => {
    void loadProfiles();
    void loadFriendships();
    void ensureNotificationPermission();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, [loadProfiles, loadFriendships]);

  useEffect(() => {
    const me = profiles[user.id];
    if (me?.avatar_url) {
      void signedUrl(me.avatar_url).then((u) => setAvatarSrc(u || ""));
    } else {
      setAvatarSrc("");
    }
  }, [profiles, user.id]);

  // Realtime Presence & Friendships Channel
  useEffect(() => {
    const ch = supabase.channel("zyraxon-presence", {
      config: { presence: { key: user.id } },
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      setOnlineUserIds(new Set(Object.keys(state)));
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ online_at: new Date().toISOString() });
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user.id]);

  useEffect(() => {
    const channel = supabase
      .channel("zyraxon-social")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, (payload) => {
        void loadFriendships();
        const f = payload.new as Friendship | undefined;
        if (f && f.addressee_id === user.id && f.status === "pending" && payload.eventType === "INSERT") {
          playMessageSound();
          toast.info("New friend request received!");
          notify("Friend request", "Someone wants to connect with you", {
            force: true,
            tag: "friend-req",
          });
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProfiles, loadFriendships, user.id]);

  // Incoming call ringtone (caller-selected) + loud background notify + vibrate
  useEffect(() => {
    if (call.status === "incoming") {
      startRingtone(call.callerRingtone);
      const callerName =
        (call.incoming ? profiles[call.incoming.callerId]?.display_name : undefined) ?? "Someone";
      notify(
        `Incoming ${call.incoming?.withVideo ? "video" : "audio"} call`,
        `${callerName} is calling you — tap to answer`,
        {
          force: true,
          tag: `call-${call.incoming?.callId ?? "in"}`,
          vibrate: [500, 200, 500, 200, 700],
        }
      );
      playCallAlert();
      try {
        navigator.vibrate?.([500, 200, 500, 200, 700]);
      } catch {}
    } else {
      stopRingtone();
      try {
        navigator.vibrate?.(0);
      } catch {}
    }
    return () => {
      stopRingtone();
      try {
        navigator.vibrate?.(0);
      } catch {}
    };
  }, [call.status, call.callerRingtone, call.incoming, profiles]);

  const friendIds = useMemo(() => friendIdsOf(friendships, user.id), [friendships, user.id]);
  const friends = friendIds.map((id) => profiles[id]).filter(Boolean) as Profile[];
  const requests = friendships.filter((f) => f.status === "pending" && f.addressee_id === user.id);
  const me = profiles[user.id];

  async function addFriend(id: string) {
    if (id === user.id) return;
    const existing = friendships.find(
      (f) =>
        (f.requester_id === user.id && f.addressee_id === id) ||
        (f.requester_id === id && f.addressee_id === user.id)
    );
    if (existing) {
      toast.info("A friend request already exists or you are already connected.");
      return;
    }
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: id });
    if (error) {
      toast.error("Could not send request: " + error.message);
    } else {
      toast.success("Friend request sent!");
      void loadFriendships();
    }
  }

  async function acceptRequest(rowId: string) {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", rowId);
    if (error) toast.error("Could not accept the request");
    else {
      toast.success("Friend request accepted!");
      void loadFriendships();
    }
  }

  async function declineRequest(rowId: string) {
    const { error } = await supabase.from("friendships").delete().eq("id", rowId);
    if (error) toast.error("Could not decline the request");
    else void loadFriendships();
  }

  const go = (v: View) => {
    unlockSound();
    setView(v);
    setNavOpen(false);
  };

  const navItem = (active: boolean) =>
    `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition ${
      active ? "bg-white/15 text-foreground shadow" : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
    }`;

  const peer = view.type === "dm" ? profiles[view.peerId] : null;
  const isPeerOnline = view.type === "dm" && view.peerId ? onlineUserIds.has(view.peerId) : onlineUserIds.size > 1;

  // In DM view call that person; otherwise invite all friends to a group call room
  const startCall = (video: boolean) => {
    unlockSound();
    const run =
      view.type === "dm"
        ? call.startDmCall(view.peerId, video)
        : call.startGroupCall(friendIds, video);
    void run.catch((err: unknown) => {
      toast.error(err instanceof Error && err.message ? err.message : video ? "Camera blocked" : "Microphone blocked");
    });
  };

  const joinFirstCall = () => {
    const target = call.joinableCalls[0];
    if (!target) return;
    unlockSound();
    void call.joinCall(target.id).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not join the call"));
  };

  const headerTitle =
    view.type === "dm"
      ? peer?.display_name ?? "Direct Message"
      : view.type === "friends"
      ? "People & Friends"
      : view.type === "requests"
      ? "Friend Requests"
      : view.type === "youtube"
      ? "YouTube Music & Chill"
      : view.type === "profile"
      ? "User Profile"
      : "Zyraxon AI Space";

  return (
    <div className="relative flex h-dvh w-full overflow-hidden p-0 sm:p-3">
      {/* Mobile Sidebar Overlay */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity md:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-3 p-4 transition-transform duration-300 md:static md:z-auto md:w-64 md:translate-x-0 md:p-3 glass-strong md:rounded-3xl border-r md:border border-white/10 ${
          navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-2 pt-1">
          <button
            type="button"
            onClick={() => go({ type: "group" })}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="gradient-romance grid h-9 w-9 place-items-center rounded-2xl text-primary-foreground shadow">
              <Heart className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold leading-none tracking-tight">ZYRAXON</p>
              <p className="text-[10px] text-muted-foreground">Private Universe</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="glass grid h-8 w-8 place-items-center rounded-full md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          <button type="button" className={navItem(view.type === "group")} onClick={() => go({ type: "group" })}>
            <Users className="h-4 w-4" /> Global Lounge
          </button>
          <button type="button" className={navItem(view.type === "friends")} onClick={() => go({ type: "friends" })}>
            <UserPlus className="h-4 w-4" /> Add Friends
          </button>
          <button
            type="button"
            className={navItem(view.type === "requests")}
            onClick={() => go({ type: "requests" })}
          >
            <Bell className="h-4 w-4" /> Requests
            {requests.length > 0 && (
              <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
                {requests.length}
              </span>
            )}
          </button>
          <button type="button" className={navItem(view.type === "youtube")} onClick={() => go({ type: "youtube" })}>
            <Play className="h-4 w-4" /> YouTube
          </button>
        </nav>

        {/* Ringtone Settings Button */}
        <button
          type="button"
          onClick={() => setRingtoneOpen(true)}
          className="glass flex items-center gap-2.5 rounded-2xl border border-primary/30 px-3.5 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          <Bell className="h-4 w-4" /> Set Caller Ringtone
        </button>

        <button
          type="button"
          onClick={handleInstallApp}
          className="glass flex items-center gap-2.5 rounded-2xl border border-pink-500/30 px-3.5 py-2 text-xs font-semibold text-pink-300 transition hover:bg-pink-500/20"
        >
          <Download className="h-4 w-4" /> Install App to Device
        </button>

        <div className="scroll-soft mt-1 flex-1 overflow-y-auto">
          <p className="px-3 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Your people</p>
          <div className="flex flex-col gap-1">
            {friends.map((f) => {
              const friendOnline = onlineUserIds.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => go({ type: "dm", peerId: f.id })}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                    view.type === "dm" && view.peerId === f.id ? "bg-white/15" : "hover:bg-white/10"
                  }`}
                >
                  <div className="relative">
                    <Avatar profile={f} className="h-9 w-9" />
                    <span
                      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background ${
                        friendOnline ? "bg-emerald-400" : "bg-zinc-500"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">{friendOnline ? "Online" : "Offline"}</p>
                  </div>
                </button>
              );
            })}
            {friends.length === 0 && (
              <button
                type="button"
                onClick={() => go({ type: "friends" })}
                className="glass flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs text-muted-foreground"
              >
                <UserPlus className="h-4 w-4" /> Find people to add
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => go({ type: "profile", userId: user.id })}
          className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/10 transition"
        >
          <Avatar profile={me} className="h-9 w-9" />
          <span className="truncate text-sm font-medium">My profile</span>
        </button>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass-strong z-20 m-2 sm:m-3 flex shrink-0 items-center gap-2 rounded-2xl sm:rounded-3xl px-3 py-2.5 sm:px-4 sm:py-3 shadow-lg">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="glass shrink-0 grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-white/10 text-white shadow transition hover:bg-white/20 active:scale-95 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {peer ? (
            <button type="button" onClick={() => go({ type: "profile", userId: peer.id })} className="shrink-0">
              <Avatar profile={peer} className="h-10 w-10" />
            </button>
          ) : (
            <div className="gradient-romance hidden h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground sm:grid">
              <Heart className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight">{headerTitle}</h1>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Circle
                className={`h-2 w-2 ${
                  isPeerOnline ? "fill-emerald-400 text-emerald-400" : "fill-muted-foreground text-muted-foreground"
                }`}
              />
              {isPeerOnline ? "Online now" : "Offline"}
            </p>
          </div>

          <button
            type="button"
            aria-label="Caller Tune & Ringtone"
            onClick={() => setRingtoneOpen(true)}
            title="Set custom ringtone"
            className="glass shrink-0 grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15 text-primary"
          >
            <Bell className="h-4 w-4" />
          </button>

          {call.joinableCalls.length > 0 && (
            <button
              type="button"
              aria-label="Join call"
              title="Join ongoing call"
              onClick={joinFirstCall}
              className="gradient-romance shrink-0 grid h-10 w-10 place-items-center rounded-full text-primary-foreground shadow ring-2 ring-primary/40 transition hover:scale-105 active:scale-95 animate-pulse"
            >
              <PhoneCall className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Audio call"
            onClick={() => startCall(false)}
            className="glass shrink-0 grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Video call"
            onClick={() => startCall(true)}
            className="glass shrink-0 grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
          >
            <VideoIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Profile settings"
            onClick={() => setProfileOpen(true)}
            className="glass hidden h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-white/15 sm:grid"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Sign out"
            onClick={onSignOut}
            className="glass hidden h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-white/15 sm:grid"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Content views — always alive (keep-alive).
            Switching tabs never unmounts a view, so no loading flash,
            and YouTube/sounds keep playing. Only the hidden class toggles. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={view.type === "group" || view.type === "dm" ? "h-full" : "pointer-events-none hidden"}
          >
            <Conversation
              me={user.id}
              peerId={view.type === "dm" ? view.peerId : null}
              profiles={profiles}
              active={view.type === "group" || view.type === "dm"}
              onOpenProfile={(id) => go({ type: "profile", userId: id })}
            />
          </div>

          <div className={view.type === "friends" ? "h-full" : "pointer-events-none hidden"}>
            <FriendsPanel
              me={user.id}
              profiles={profiles}
              friendships={friendships}
              onlineUserIds={onlineUserIds}
              onAddFriend={addFriend}
              onOpenDm={(peerId) => go({ type: "dm", peerId })}
              onOpenProfile={(userId) => go({ type: "profile", userId })}
            />
          </div>

          <div className={view.type === "requests" ? "h-full" : "pointer-events-none hidden"}>
            <div className="scroll-soft mx-auto h-full max-w-xl overflow-y-auto p-4">
              <h2 className="mb-4 text-lg font-semibold">Friend requests</h2>
              {requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending requests right now.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {requests.map((r) => {
                    const sender = profiles[r.requester_id];
                    return (
                      <div
                        key={r.id}
                        className="glass flex items-center justify-between rounded-2xl p-3 shadow"
                      >
                        <div
                          className="flex items-center gap-3 cursor-pointer"
                          onClick={() => go({ type: "profile", userId: r.requester_id })}
                        >
                          <Avatar profile={sender} className="h-10 w-10" />
                          <div>
                            <p className="text-sm font-semibold">{sender?.display_name ?? "Someone"}</p>
                            <p className="text-xs text-muted-foreground">Wants to connect with you</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void acceptRequest(r.id)}
                            className="gradient-romance rounded-xl px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => void declineRequest(r.id)}
                            className="glass rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className={view.type === "youtube" ? "h-full" : "pointer-events-none hidden"}>
            <YouTubePanel onOpenMenu={() => setNavOpen(true)} />
          </div>

          {/* ProfilePage conditional — mounting without profile data can crash */}
          {view.type === "profile" && view.userId && profiles[view.userId] && (
            <ProfilePage
              profile={profiles[view.userId]}
              me={user.id}
              friendships={friendships}
              friendCount={friendIdsOf(friendships, view.userId).length}
              onBack={() => go({ type: "group" })}
              onAdd={addFriend}
              onAccept={(rowId) => acceptRequest(rowId)}
              onMessage={(peerId) => go({ type: "dm", peerId })}
            />
          )}
        </div>
      </div>

      {/* WebRTC Video/Audio Call Panel — mesh group/dm call */}
      <CallPanel
        call={call}
        peerName={peer?.display_name ?? "Someone"}
        profiles={profiles}
        selfProfile={me}
        callerName={
          call.incoming ? profiles[call.incoming.callerId]?.display_name ?? peer?.display_name : undefined
        }
      />

      {/* Ringtone Selection Dialog */}
      <RingtoneDialog open={ringtoneOpen} onOpenChange={setRingtoneOpen} />

      {/* Profile Edit Dialog */}
      {me && (
        <ProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          profile={me}
          avatarSrc={avatarSrc}
          onSaved={() => void loadProfiles()}
        />
      )}
    </div>
  );
}
