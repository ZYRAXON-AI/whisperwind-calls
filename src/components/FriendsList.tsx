import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Search, UserPlus, Clock, MessageCircle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rawDb } from "@/lib/rawDb";
import { signedUrl } from "@/lib/media";
import type { Profile } from "@/components/chat/ProfileDialog";

type FriendRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  avatar?: string;
};

interface Props {
  user: User;
  onOpenDM: (userId: string) => void;
  showRequestsOnly?: boolean;
}

export default function FriendsList({ user, onOpenDM, showRequestsOnly }: Props) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url");
    if (!profiles) return;

    const resolved: Profile[] = [];
    for (const p of profiles) {
      if (p.id === user.id) continue;
      let avatar: string | null = null;
      if (p.avatar_url) {
        avatar = p.avatar_url.startsWith("http") ? p.avatar_url : await signedUrl(p.avatar_url);
      }
      resolved.push({ ...p, avatar_url: avatar });
    }
    setUsers(resolved);

    const { data: fships } = await rawDb.from("friendships").select("id, requester_id, addressee_id, status");
    if (fships) {
      const rows = (fships as { id: string; requester_id: string; addressee_id: string; status: string }[]).filter(
        f => f.requester_id === user.id || f.addressee_id === user.id
      );
      setFriends(rows);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
    const ch = supabase.channel("sb-friends-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const statusFor = (uid: string) => friends.find(f => f.requester_id === uid || f.addressee_id === uid);
  const requestedIds = new Set(friends.filter(f => f.status === "pending").map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id));
  const acceptedIds = new Set(friends.filter(f => f.status === "accepted").map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id));

  const incomingPending = friends.filter(f => f.status === "pending" && f.addressee_id === user.id);

  const sendRequest = async (uid: string) => {
    await rawDb.from("friendships").insert({ requester_id: user.id, addressee_id: uid, status: "pending" });
    void load();
  };

  const acceptRequest = async (id: string) => {
    await rawDb.from("friendships").update({ status: "accepted" }).eq("id", id);
    void load();
  };

  const filtered = users.filter(u => {
    if (search && !(u.display_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (showRequestsOnly) {
      return incomingPending.some(f => {
        const oid = f.requester_id === user.id ? f.addressee_id : f.requester_id;
        return oid === u.id;
      });
    }
    return true;
  });

  if (showRequestsOnly && incomingPending.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="gradient-romance mb-4 flex h-16 w-16 items-center justify-center rounded-3xl"><Clock className="h-8 w-8 text-primary-foreground" /></div>
        <p className="text-lg font-semibold">No pending requests</p>
        <p className="text-sm text-muted-foreground">When someone follows you, you'll see their request here.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-4 pt-3">
        <div className="glass relative flex-1 rounded-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={showRequestsOnly ? "Search requests..." : "Search users..."}
            className="w-full rounded-xl bg-transparent py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {filtered.map(u => {
          const rel = statusFor(u.id);
          const isAccepted = acceptedIds.has(u.id);
          const isPending = requestedIds.has(u.id) || (rel?.status === "pending");
          const isIncoming = incomingPending.some(f => (f.requester_id === user.id ? f.addressee_id : f.requester_id) === u.id);
          return (
            <div key={u.id} className="glass flex items-center gap-3 rounded-2xl px-3 py-3">
              {u.avatar_url ? (
                <img src={u.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <span className="gradient-romance flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-primary-foreground">{(u.display_name || "?")[0]?.toUpperCase()}</span>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{u.display_name || "Anonymous"}</p>
              </div>
              {isAccepted ? (
                <button type="button" onClick={() => onOpenDM(u.id)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-primary hover:bg-white/10"><MessageCircle className="h-3.5 w-3.5" />Message</button>
              ) : isIncoming ? (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => { const f = incomingPending.find(x => x.requester_id === u.id); if (f) void acceptRequest(f.id); }} className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400"><Check className="h-3.5 w-3.5" /></button>
                </div>
              ) : isPending ? (
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground">Pending</span>
              ) : (
                <button type="button" onClick={() => void sendRequest(u.id)} className="gradient-romance flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-primary-foreground"><UserPlus className="h-3.5 w-3.5" />Follow</button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">{search ? "No users match your search." : "No users found."}</div>
        )}
      </div>
    </div>
  );
}
