import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  Heart,
  MessageCircle,
  Phone,
  UserPlus,
  Users,
  Video as VideoIcon,
  Calendar,
  Sparkles,
  MapPin,
  Image as ImageIcon,
} from "lucide-react";

import { signedUrl } from "@/lib/media";
import type { Friendship, Profile } from "@/lib/social";
import { relationWith } from "@/lib/social";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    <div className="scroll-soft h-full overflow-y-auto p-2 sm:p-4">
      <div className="glass-strong mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
        {/* Facebook Style Cover Photo */}
        <div className="relative h-44 sm:h-64 w-full overflow-hidden bg-gradient-to-r from-pink-900/60 via-purple-900/60 to-indigo-900/60">
          <img
            src="https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1200&q=80"
            alt="Cover"
            className="h-full w-full object-cover opacity-60"
          />
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="glass absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        {/* Profile Header Block */}
        <div className="px-5 pb-6">
          <div className="-mt-16 flex flex-col items-center gap-4 sm:-mt-20 sm:flex-row sm:items-end sm:gap-6">
            {/* Avatar with Status Ring */}
            <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-background shadow-xl sm:h-36 sm:w-36">
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="gradient-romance grid h-full w-full place-items-center text-5xl font-semibold text-primary-foreground">
                  {profile.display_name.slice(0, 1).toUpperCase()}
                </span>
              )}
              {/* Online Dot */}
              <span className="absolute bottom-2 right-2 h-5 w-5 rounded-full border-2 border-background bg-emerald-500 shadow-md" />
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold">{profile.display_name}</h2>
              <p className="mt-1 flex items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-start">
                <Users className="h-4 w-4" /> {friendCount} friend{friendCount === 1 ? "" : "s"} •
                <span className="flex items-center gap-1 text-pink-400 font-medium">
                  <Heart className="h-3.5 w-3.5 fill-current" /> In love
                </span>
              </p>
            </div>

            {/* Facebook Action Buttons */}
            {!isMe && (
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {rel.state === "none" && (
                  <button
                    type="button"
                    onClick={() => onAdd(profile.id)}
                    className="gradient-romance inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow"
                  >
                    <UserPlus className="h-4 w-4" /> Add Friend
                  </button>
                )}
                {rel.state === "sent" && (
                  <span className="glass inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" /> Request Sent
                  </span>
                )}
                {rel.state === "incoming" && (
                  <button
                    type="button"
                    onClick={() => onAccept(rel.row.id)}
                    className="gradient-romance inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    <Check className="h-4 w-4" /> Accept Request
                  </button>
                )}
                {rel.state === "friends" && (
                  <>
                    <button
                      type="button"
                      onClick={() => onMessage(profile.id)}
                      className="gradient-romance inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow"
                    >
                      <MessageCircle className="h-4 w-4" /> Message
                    </button>
                    <button
                      type="button"
                      onClick={() => onMessage(profile.id)}
                      className="glass inline-flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-medium hover:bg-white/15"
                      title="Audio Call"
                    >
                      <Phone className="h-4 w-4 text-emerald-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMessage(profile.id)}
                      className="glass inline-flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-medium hover:bg-white/15"
                      title="Video Call"
                    >
                      <VideoIcon className="h-4 w-4 text-pink-400" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="my-5 border-t border-white/10" />

          {/* Facebook Style Tabs */}
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList className="glass mb-4 grid w-full grid-cols-4 rounded-2xl bg-white/5 p-1">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="friends">Friends</TabsTrigger>
              <TabsTrigger value="photos">Photos</TabsTrigger>
            </TabsList>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="space-y-4">
              <div className="glass rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10">
                    {avatar ? (
                      <img src={avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-sm font-bold">
                        {profile.display_name[0]}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{profile.display_name}</p>
                    <p className="text-xs text-muted-foreground">Updated relationship status</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                  Joined Zyraxon — a special private space built just for us. ✨
                </p>
              </div>
            </TabsContent>

            {/* About Tab */}
            <TabsContent value="about" className="grid gap-3 sm:grid-cols-2">
              <div className="glass rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-primary">Overview</h3>
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Heart className="h-4 w-4 text-pink-400 fill-current" />
                  <span>Relationship: In a relationship</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span>From: Dhaka, Bangladesh</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>
                    Joined:{" "}
                    {profile.created_at
                      ? new Date(profile.created_at).toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })
                      : "Recently"}
                  </span>
                </div>
              </div>

              <div className="glass rounded-2xl p-4 space-y-2">
                <h3 className="text-sm font-semibold text-primary">Bio & Thoughts</h3>
                <p className="text-sm italic text-muted-foreground">
                  {isMe
                    ? "Welcome to my Zyraxon profile! Let's share songs, memories, and late-night calls."
                    : `Always here for quiet chats and music with ${profile.display_name}.`}
                </p>
              </div>
            </TabsContent>

            {/* Friends Tab */}
            <TabsContent value="friends">
              <div className="glass rounded-2xl p-4">
                <p className="text-sm font-semibold mb-3">Friends ({friendCount})</p>
                <p className="text-sm text-muted-foreground">
                  You are connected in this private sphere.
                </p>
              </div>
            </TabsContent>

            {/* Photos Tab */}
            <TabsContent value="photos">
              <div className="glass rounded-2xl p-6 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Photos and shared media will be saved directly inside your private chats.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
