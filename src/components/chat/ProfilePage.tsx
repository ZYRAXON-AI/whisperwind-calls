import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clock, MessageCircle, UserPlus, Users } from "lucide-react";

import { signedUrl } from "@/lib/media";
import type { Friendship, Profile } from "@/lib/social";
import { relationWith } from "@/lib/social";

export function ProfilePage({
  profile,
  me,
  friendships,
  friendCount,
  onBack,
  onAdd,
  onAccept,
  onMessage,
}: {
  profile: Profile;
  me: string;
  friendships: Friendship[];
  friendCount: number;
  onBack: () => void;
  onAdd: (id: string) => void;
  onAccept: (id: string) => void;
  onMessage: (id: string) => void;
}) {
  const [avatar, setAvatar] = useState("");
  const rel = relationWith(friendships, me, profile.id);
  const isMe = profile.id === me;

  useEffect(() => {
    let alive = true;
    if (!profile.avatar_url) {
      setAvatar("");
      return;
    }
    if (profile.avatar_url.startsWith("http")) {
      setAvatar(profile.avatar_url);
      return;
    }
    void signedUrl(profile.avatar_url).then((u) => alive && setAvatar(u));
    return () => {
      alive = false;
    };
  }, [profile.avatar_url]);

  return (
    <div className="scroll-soft h-full overflow-y-auto p-3">
      <div className="glass-strong overflow-hidden rounded-3xl">
        <div className="gradient-romance relative h-40 sm:h-56">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="glass absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-6">
          <div className="-mt-14 flex flex-col items-center gap-3 sm:-mt-16 sm:flex-row sm:items-end">
            <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-background sm:h-32 sm:w-32">
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="gradient-romance grid h-full w-full place-items-center text-4xl font-semibold text-primary-foreground">
                  {profile.display_name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 pb-2 text-center sm:text-left">
              <h2 className="text-2xl font-semibold">{profile.display_name}</h2>
              <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
                <Users className="h-3.5 w-3.5" /> {friendCount} friend{friendCount === 1 ? "" : "s"}
              </p>
            </div>

            {!isMe && (
              <div className="flex gap-2 pb-2">
                {rel.state === "none" && (
                  <button
                    type="button"
                    onClick={() => onAdd(profile.id)}
                    className="gradient-romance inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    <UserPlus className="h-4 w-4" /> Add friend
                  </button>
                )}
                {rel.state === "sent" && (
                  <span className="glass inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" /> Request sent
                  </span>
                )}
                {rel.state === "incoming" && (
                  <button
                    type="button"
                    onClick={() => onAccept(rel.row.id)}
                    className="gradient-romance inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    <Check className="h-4 w-4" /> Accept
                  </button>
                )}
                {rel.state === "friends" && (
                  <button
                    type="button"
                    onClick={() => onMessage(profile.id)}
                    className="glass inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
                  >
                    <MessageCircle className="h-4 w-4" /> Message
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="glass rounded-2xl p-4">
              <h3 className="text-sm font-semibold">Intro</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {isMe ? "This is how others see you on Zyraxon." : `Say hi to ${profile.display_name}.`}
              </p>
            </div>
            <div className="glass rounded-2xl p-4">
              <h3 className="text-sm font-semibold">Joined</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {profile.created_at
                  ? new Date(profile.created_at).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
