import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Circle,
  Download,
  Heart,
  LogOut,
  Menu,
  MessageCircle,
  Phone,
  Play,
  Settings,
  UserPlus,
  Users,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

import { Backdrop } from "@/components/Backdrop";
import { Avatar } from "./Avatar";
import { CallPanel } from "./CallPanel";
import { Conversation } from "./Conversation";
import { FriendsPanel, RequestsPanel } from "./FriendsPanel";
import { ProfileDialog } from "./ProfileDialog";
import { ProfilePage } from "./ProfilePage";
import { YouTubePanel } from "./YouTubePanel";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/media";
import {
  ensureNotificationPermission,
  playMessageSound,
  startRingtone,
  stopRingtone,
  unlockSound,
} from "@/lib/sounds";
import type { Friendship, Profile, View } from "@/lib/social";
import { friendIdsOf } from "@/lib/social";
import { useCall } from "@/lib/useCall";

export function ChatRoom({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [view, setView] = useState<View>({ type: "group" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const call = useCall(user.id);

  // Capture PWA install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstallApp() {
    if (!installPrompt) {
      toast("To install, tap your browser's menu (⋮) and select 'Add to Home screen' or 'Install'.");
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
      toast.success("Zyraxon installed successfully!");
    }
  }

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, created_at");
    if (!data) return;
    const map: Record<string, Profile> = {};
    for (const p of data) map[p.id] = p as Profile;
    setProfiles(map);
    const mine = map[user.id];
    if (mine?.avatar_url) {
      setAvatarSrc(
        mine.avatar_url.startsWith("http") ? mine.avatar_url : await signedUrl(mine.avatar_url),
      );
    } else {
      setAvatarSrc("");
    }
  }, [user.id]);

  const loadFriendships = useCallback(async () => {
    const { data } = await supabase.from("friendships").select("*");
    if (data) setFriendships(data as Friendship[]);
  }, []);

  useEffect(() => {
    void loadProfiles();
    void loadFriendships();
    void ensureNotificationPermission();
    unlockSound();
  }, [loadProfiles, loadFriendships]);

  // Realtime Presence tracking
  useEffect(() => {
    const presenceChannel = supabase.channel("zyraxon-online-status", {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const activeIds = new Set<string>(Object.keys(state));
        setOnlineUserIds(activeIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [user.id]);

  useEffect(() => {
    const channel = supabase
      .channel("zyraxon-social")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void loadProfiles();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, (payload) => {
        void loadFriendships();
        const row = payload.new as Friendship | null;
        if (payload.eventType === "INSERT" && row?.addressee_id === user.id) {
          playMessageSound();
          toast("New friend request received");
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProfiles, loadFriendships, user.id]);

  useEffect(() => {
    if (call.status === "incoming") startRingtone();
    else stopRingtone();
    return stopRingtone;
  }, [call.status]);

  const friendIds = useMemo(() => friendIdsOf(friendships, user.id), [friendships, user.id]);
  const friends = friendIds.map((id) => profiles[id]).filter(Boolean) as Profile[];
  const requests = friendships.filter((f) => f.status === "pending" && f.addressee_id === user.id);
  const me = profiles[user.id];

  async function addFriend(id: string) {
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: id });
    if (error) toast.error("Could not send request");
    else {
      toast.success("Request sent");
      void loadFriendships();
    }
  }

  async function acceptRequest(rowId: string) {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", rowId);
    if (error) toast.error("Could not accept");
    else void loadFriendships();
  }

  async function removeFriendship(rowId: string) {
    await supabase.from("friendships").delete().eq("id", rowId);
    void loadFriendships();
  }

  function go(next: View) {
    setView(next);
    setNavOpen(false);
  }

  const navItem = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition ${
      active ? "gradient-romance text-primary-foreground" : "hover:bg-white/10"
    }`;

  const peer = view.type === "dm" ? profiles[view.peerId] : null;
  const isPeerOnline = peer ? onlineUserIds.has(peer.id) : call.peerOnline > 0;

  const headerTitle =
    view.type === "dm"
      ? (peer?.display_name ?? "Chat")
      : view.type === "youtube"
        ? "YouTube"
        : view.type === "friends"
          ? "Friends"
          : view.type === "requests"
            ? "Requests"
            : view.type === "profile"
              ? "Profile"
              : "Zyraxon";

  return (
    <div className="relative flex h-dvh flex-col md:flex-row" onPointerDown={unlockSound}>
      <Backdrop />

      {/* Sidebar */}
      <aside
        className={`glass-strong fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-3 p-3 transition-transform md:static md:m-3 md:w-72 md:translate-x-0 md:rounded-3xl ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-1.5 pt-1">
          <div className="gradient-romance grid h-10 w-10 place-items-center rounded-2xl text-primary-foreground">
            <Heart className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight">Zyraxon</p>
            <p className="truncate text-xs text-muted-foreground">
              {me?.display_name ?? "You"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="glass grid h-9 w-9 place-items-center rounded-full md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          <button type="button" className={navItem(view.type === "group")} onClick={() => go({ type: "group" })}>
            <MessageCircle className="h-4 w-4" /> Group chat
          </button>
          <button type="button" className={navItem(view.type === "friends")} onClick={() => go({ type: "friends" })}>
            <Users className="h-4 w-4" /> Friends
          </button>
          <button type="button" className={navItem(view.type === "requests")} onClick={() => go({ type: "requests" })}>
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

        {/* Install Desktop / Mobile App Button */}
        <button
          type="button"
          onClick={handleInstallApp}
          className="glass flex items-center gap-2.5 rounded-2xl border border-pink-500/30 px-3.5 py-2 text-xs font-semibold text-pink-300 transition hover:bg-pink-500/20"
        >
          <Download className="h-4 w-4" /> Install App to Device
        </button>

        <div className="scroll-soft mt-1 flex-1 overflow-y-auto">
          <p className="px-3 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Your people
          </p>
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
                    <p className="text-[11px] text-muted-foreground">
                      {friendOnline ? "Online" : "Offline"}
                    </p>
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
          className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
        >
          <Avatar profile={me} className="h-9 w-9" />
          <span className="truncate text-sm font-medium">My profile</span>
        </button>
      </aside>

      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-strong z-20 m-3 flex items-center gap-2 rounded-3xl px-3 py-3 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="glass grid h-10 w-10 place-items-center rounded-full md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          {peer ? (
            <button type="button" onClick={() => go({ type: "profile", userId: peer.id })}>
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
            aria-label="Audio call"
            onClick={() => void call.startCall(false).catch(() => toast.error("Microphone blocked"))}
            className="glass grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Video call"
            onClick={() => void call.startCall(true).catch(() => toast.error("Camera blocked"))}
            className="glass grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15"
          >
            <VideoIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Profile settings"
            onClick={() => setProfileOpen(true)}
            className="glass hidden h-10 w-10 place-items-center rounded-full transition hover:bg-white/15 sm:grid"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Sign out"
            onClick={onSignOut}
            className="glass hidden h-10 w-10 place-items-center rounded-full transition hover:bg-white/15 sm:grid"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1">
          {(view.type === "group" || view.type === "dm") && (
            <Conversation
              key={view.type === "dm" ? view.peerId : "group"}
              me={user.id}
              peerId={view.type === "dm" ? view.peerId : null}
              profiles={profiles}
              onOpenProfile={(id) => go({ type: "profile", userId: id })}
            />
          )}

          {view.type === "friends" && (
            <FriendsPanel
              profiles={Object.values(profiles)}
              friendships={friendships}
              me={user.id}
              onAdd={(id) => void addFriend(id)}
              onAccept={(id) => void acceptRequest(id)}
              onRemove={(id) => void removeFriendship(id)}
              onOpenProfile={(id) => go({ type: "profile", userId: id })}
              onMessage={(id) => go({ type: "dm", peerId: id })}
            />
          )}

          {view.type === "requests" && (
            <RequestsPanel
              requests={requests}
              profiles={profiles}
              onAccept={(id) => void acceptRequest(id)}
              onReject={(id) => void removeFriendship(id)}
              onOpenProfile={(id) => go({ type: "profile", userId: id })}
            />
          )}

          {view.type === "youtube" && <YouTubePanel />}

          {view.type === "profile" && profiles[view.userId] && (
            <ProfilePage
              profile={profiles[view.userId]}
              me={user.id}
              friendships={friendships}
              friendCount={friends.length}
              onBack={() => go({ type: "group" })}
              onAdd={(id) => void addFriend(id)}
              onAccept={(id) => void acceptRequest(id)}
              onMessage={(id) => go({ type: "dm", peerId: id })}
            />
          )}
        </div>
      </div>

      {/* Video/Audio Call Overlay */}
      {call.status !== "idle" && (
        <CallPanel call={call} peerName={peer?.display_name ?? "Partner"} />
      )}

      {/* Profile edit modal */}
      {me && (
        <ProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          profile={me}
          avatarUrl={avatarSrc}
          onSaved={() => void loadProfiles()}
        />
      )}
    </div>
  );
}
