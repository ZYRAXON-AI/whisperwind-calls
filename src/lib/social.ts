export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at?: string;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
};

export type Message = {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  kind: string;
  body: string | null;
  media_url: string | null;
  media_name: string | null;
  created_at: string;
  edited_at: string | null;
};

export type View =
  | { type: "group" }
  | { type: "zyraxon" }
  | { type: "dm"; peerId: string }
  | { type: "friends" }
  | { type: "requests" }
  | { type: "youtube" }
  | { type: "profile"; userId: string };

export const ZYRAXON_ROOM = "zyraxon-ai";

export function friendIdsOf(list: Friendship[], me: string) {
  return list
    .filter((f) => f.status === "accepted")
    .map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id));
}

export function relationWith(list: Friendship[], me: string, other: string) {
  const f = list.find(
    (x) =>
      (x.requester_id === me && x.addressee_id === other) ||
      (x.requester_id === other && x.addressee_id === me),
  );
  if (!f) return { state: "none" as const };
  if (f.status === "accepted") return { state: "friends" as const, row: f };
  if (f.requester_id === me) return { state: "sent" as const, row: f };
  return { state: "incoming" as const, row: f };
}
