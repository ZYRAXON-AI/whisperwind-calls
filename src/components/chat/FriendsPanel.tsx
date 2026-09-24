import { useMemo, useState } from "react";
import { Check, Clock, MessageCircle, Search, UserPlus, Users, X, Circle } from "lucide-react";

import { Avatar } from "./Avatar";
import type { Friendship, Profile } from "@/lib/social";
import { relationWith } from "@/lib/social";

export function FriendsPanel({
  profiles,
  friendships = [],
  me,
  onlineUserIds = new Set(),
  onAddFriend,
  onOpenDm,
  onOpenProfile,
  onAccept,
  onRemove,
}: {
  profiles: Record<string, Profile> | Profile[];
  friendships?: Friendship[];
  me: string;
  onlineUserIds?: Set<string>;
  onAddFriend?: (id: string) => void;
  onOpenDm?: (peerId: string) => void;
  onOpenProfile?: (id: string) => void;
  onAccept?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const [q, setQ] = useState("");

  // Safely build a Profile array from either object map or array format
  const profileList: Profile[] = useMemo(() => {
    if (Array.isArray(profiles)) return profiles;
    if (profiles && typeof profiles === "object") return Object.values(profiles);
    return [];
  }, [profiles]);

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return profileList
      .filter((p) => p && p.id && p.id !== me)
      .filter((p) => !search || (p.display_name && p.display_name.toLowerCase().includes(search)));
  }, [profileList, me, q]);

  return (
    <div className="scroll-soft h-full overflow-y-auto p-3 sm:p-5">
      <div className="glass-strong mb-4 flex items-center gap-2 rounded-2xl px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people by name..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.map((p) => {
          const rel = relationWith(friendships, me, p.id);
          const isOnline = onlineUserIds.has(p.id);

          return (
            <div
              key={p.id}
              className="glass flex items-center justify-between gap-3 rounded-2xl p-3.5 transition hover:bg-white/10"
            >
              <div
                onClick={() => onOpenProfile?.(p.id)}
                className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer"
              >
                <div className="relative">
                  <Avatar profile={p} className="h-11 w-11" />
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background ${
                      isOnline ? "bg-emerald-400" : "bg-zinc-500"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.display_name || "Anonymous"}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Circle className={`h-1.5 w-1.5 ${isOnline ? "fill-emerald-400 text-emerald-400" : "fill-zinc-500 text-zinc-500"}`} />
                    {isOnline ? "Online now" : "Offline"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {rel.state === "none" && (
                  <button
                    type="button"
                    onClick={() => onAddFriend?.(p.id)}
                    className="gradient-romance inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:scale-105 active:scale-95"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Add Friend
                  </button>
                )}

                {rel.state === "sent" && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Request Sent
                  </span>
                )}

                {rel.state === "incoming" && (
                  <button
                    type="button"
                    onClick={() => onAccept?.(rel.row.id)}
                    className="gradient-romance inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </button>
                )}

                {rel.state === "friends" && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenDm?.(p.id)}
                      title="Send Message"
                      className="glass grid h-9 w-9 place-items-center rounded-xl transition hover:bg-white/20"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(rel.row.id)}
                        title="Unfriend"
                        className="glass grid h-9 w-9 place-items-center rounded-xl text-destructive hover:bg-destructive/20 transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="mt-12 text-center text-sm text-muted-foreground">
            <Users className="mx-auto h-8 w-8 opacity-40 mb-2" />
            <p>No users found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
