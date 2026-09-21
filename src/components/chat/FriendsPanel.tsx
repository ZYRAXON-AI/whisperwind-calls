import { useMemo, useState } from "react";
import { Check, Clock, MessageCircle, Search, UserPlus, X } from "lucide-react";

import { Avatar } from "./Avatar";
import type { Friendship, Profile } from "@/lib/social";
import { relationWith } from "@/lib/social";

export function FriendsPanel({
  profiles,
  friendships,
  me,
  onAdd,
  onAccept,
  onRemove,
  onOpenProfile,
  onMessage,
}: {
  profiles: Profile[];
  friendships: Friendship[];
  me: string;
  onAdd: (id: string) => void;
  onAccept: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenProfile: (id: string) => void;
  onMessage: (id: string) => void;
}) {
  const [q, setQ] = useState("");

  const list = useMemo(
    () =>
      profiles
        .filter((p) => p.id !== me)
        .filter((p) => p.display_name.toLowerCase().includes(q.trim().toLowerCase())),
    [profiles, me, q],
  );

  return (
    <div className="scroll-soft h-full overflow-y-auto p-3">
      <div className="glass-strong mb-3 flex items-center gap-2 rounded-3xl px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex flex-col gap-2">
        {list.map((p) => {
          const rel = relationWith(friendships, me, p.id);
          return (
            <div key={p.id} className="glass flex items-center gap-3 rounded-3xl px-4 py-3">
              <button
                type="button"
                onClick={() => onOpenProfile(p.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar profile={p} className="h-11 w-11" />
                <span className="truncate text-sm font-medium">{p.display_name}</span>
              </button>

              {rel.state === "none" && (
                <button
                  type="button"
                  onClick={() => onAdd(p.id)}
                  className="gradient-romance inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add
                </button>
              )}
              {rel.state === "sent" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Sent
                </span>
              )}
              {rel.state === "incoming" && (
                <button
                  type="button"
                  onClick={() => onAccept(rel.row.id)}
                  className="gradient-romance inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <Check className="h-3.5 w-3.5" /> Accept
                </button>
              )}
              {rel.state === "friends" && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onMessage(p.id)}
                    aria-label="Message"
                    className="glass grid h-9 w-9 place-items-center rounded-full"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(rel.row.id)}
                    aria-label="Remove friend"
                    className="glass grid h-9 w-9 place-items-center rounded-full text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">Nobody found.</p>
        )}
      </div>
    </div>
  );
}

export function RequestsPanel({
  requests,
  profiles,
  onAccept,
  onDecline,
  onOpenProfile,
}: {
  requests: Friendship[];
  profiles: Record<string, Profile>;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onOpenProfile: (id: string) => void;
}) {
  return (
    <div className="scroll-soft h-full overflow-y-auto p-3">
      <h2 className="mb-3 px-1 text-lg font-semibold">Friend requests</h2>
      <div className="flex flex-col gap-2">
        {requests.map((r) => {
          const p = profiles[r.requester_id];
          return (
            <div key={r.id} className="glass flex items-center gap-3 rounded-3xl px-4 py-3">
              <button
                type="button"
                onClick={() => onOpenProfile(r.requester_id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar profile={p} className="h-11 w-11" />
                <span className="truncate text-sm font-medium">
                  {p?.display_name ?? "Someone"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onAccept(r.id)}
                className="gradient-romance rounded-full px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => onDecline(r.id)}
                className="glass rounded-full px-4 py-2 text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          );
        })}
        {requests.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">No requests right now.</p>
        )}
      </div>
    </div>
  );
}
