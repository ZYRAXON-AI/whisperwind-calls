import { useCallback, useEffect, useState } from "react";
import { Heart, Users, UserPlus, Bell, BellOff, LogOut, Check, X } from "lucide-react";
import { rawDb } from "@/lib/rawDb";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/media";
import type { Profile } from "@/components/chat/ProfileDialog";

type FriendRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  other: Profile;
  avatar?: string;
};

type Props = {
  user: { id: string };
  activeView: string;
  onSelectView: (v: string) => void;
  onSelectDM: (id: string) => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function Sidebar({ user, activeView, onSelectView, onSelectDM, onSignOut, mobileOpen, onMobileClose }: Props) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [pending, setPending] = useState<FriendRow[]>([]);
  const [muted, setMuted] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("zyraxon-muted") || "[]"); } catch { return []; }
  });

  const load = useCallback(async () => {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url");
    const { data: fships } = await rawDb.from("friendships").select("id, requester_id, addressee_id, status");
    if (!profiles || !fships) return;

    const pMap: Record<string, Profile> = {};
    const aMap: Record<string, string> = {};
    for (const p of profiles) {
      pMap[p.id] = p as Profile;
      if (p.avatar_url && !p.avatar_url.startsWith("http")) {
        aMap[p.id] = await signedUrl(p.avatar_url);
      } else if (p.avatar_url) {
        aMap[p.id] = p.avatar_url;
      }
    }

    const acc: FriendRow[] = [];
    const pen: FriendRow[] = [];
    for (const f of fships as { id: string; requester_id: string; addressee_id: string; status: string }[]) {
      const oid = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      const other = pMap[oid];
      if (!other) continue;
      const row: FriendRow = { ...f, other, avatar: aMap[oid] };
      if (f.status === "accepted") acc.push(row);
      else if (f.addressee_id === user.id) pen.push(row);
    }
    setFriends(acc);
    setPending(pen);
  }, [user.id]);

  useEffect(() => {
    void load();
    const ch = supabase.channel("sb-friends")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const accept = async (id: string) => { await rawDb.from("friendships").update({ status: "accepted" }).eq("id", id); void load(); };
  const reject = async (id: string) => { await rawDb.from("friendships").delete().eq("id", id); void load(); };
  const toggleMute = (uid: string) => {
    setMuted(prev => {
      const next = prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid];
      localStorage.setItem("zyraxon-muted", JSON.stringify(next));
      return next;
    });
  };

  const nav = (view: string, icon: React.ReactNode, label: string, badge?: number) => (
    <button type="button" onClick={() => { onSelectView(view); onMobileClose(); }}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${activeView === view ? "gradient-romance text-primary-foreground" : "text-muted-foreground hover:bg-white/10"}`}>
      {icon}<span className="flex-1 text-left">{label}</span>
      {badge ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{badge}</span> : null}
    </button>
  );

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="gradient-romance flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground"><Heart className="h-5 w-5" /></div>
        <h1 className="text-lg font-bold">Zyraxon</h1>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {nav("group", <Users className="h-4 w-4" />, "Group Chat")}
        {nav("friends", <UserPlus className="h-4 w-4" />, "Friends")}
        {nav("requests", <Bell className="h-4 w-4" />, "Requests", pending.length || undefined)}
        {activeView === "requests" && pending.length > 0 && (
          <div className="mt-2 space-y-2">
            {pending.map(f => (
              <div key={f.id} className="glass flex items-center gap-3 rounded-xl px-3 py-2.5">
                {f.avatar ? <img src={f.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="gradient-romance flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-primary-foreground">{f.other.display_name?.[0]?.toUpperCase() ?? "?"}</span>}
                <span className="flex-1 truncate text-sm">{f.other.display_name}</span>
                <button type="button" onClick={() => void accept(f.id)} className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={() => void reject(f.id)} className="grid h-8 w-8 place-items-center rounded-full bg-red-500 text-white hover:bg-red-400"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
        {friends.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Messages</p>
            {friends.map(f => (
              <button key={f.id} type="button" onClick={() => { onSelectDM(f.other.id); onMobileClose(); }}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition ${activeView === `dm-${f.other.id}` ? "gradient-romance text-primary-foreground" : "text-muted-foreground hover:bg-white/10"}`}>
                {f.avatar ? <img src={f.avatar} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="gradient-romance flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-primary-foreground">{f.other.display_name?.[0]?.toUpperCase() ?? "?"}</span>}
                <span className="flex-1 truncate text-left">{f.other.display_name}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); toggleMute(f.other.id); }} className="rounded-full p-1 hover:bg-white/15" title={muted.includes(f.other.id) ? "Unmute" : "Mute"}>
                  {muted.includes(f.other.id) ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                </button>
              </button>
            ))}
          </div>
        )}
      </nav>
      <div className="border-t border-border px-3 py-3">
        <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm text-muted-foreground hover:bg-white/10"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="glass-strong hidden w-72 shrink-0 flex-col border-r border-border md:flex">{content}</aside>
      <div className={`fixed inset-0 z-[60] transition-opacity duration-300 md:hidden ${mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} onClick={onMobileClose} />
      <aside className={`glass-strong fixed inset-y-0 left-0 z-[65] flex w-72 flex-col border-r border-border transition-transform duration-300 ease-out md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{content}</aside>
    </>
  );
}
