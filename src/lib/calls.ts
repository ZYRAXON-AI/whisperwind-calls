import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { getSavedRingtone } from "@/lib/sounds";

export type CallRow = {
  id: string;
  kind: string;
  peer_id: string | null;
  created_by: string;
  with_video: boolean;
  ringtone: string;
  status: string;
  created_at: string;
  ended_at: string | null;
};

export type CallMemberRow = {
  call_id: string;
  user_id: string;
  role: string;
  state: string;
  joined_at: string | null;
  updated_at: string;
};

export type OpenCall = { call: CallRow; member: CallMemberRow };

export type CallInvite = {
  to?: string;
  callId: string;
  callerId: string;
  withVideo: boolean;
  ringtone: string;
  kind: string;
  peerId: string | null;
};

export type InviteCancel = { callId: string; callerId: string };
export type InviteDeclined = { callId: string; userId: string; callerId: string };
// Callee answers the invite with ITS OWN ringtone so the caller hears that one
export type RingBack = { callId: string; to: string; ringtone: string };

// calls/call_members may be missing until migration runs — bypass typed client
const raw = () => supabase as unknown as SupabaseClient;

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205") return true;
  const m = error.message ?? "";
  return m.includes("Could not find the table") || m.includes("public.calls");
}

const INVITE_CHANNEL = "zyraxon-call-invites-all";
const RING_MS = 900;

type InviteHandler = (invite: CallInvite) => void;
type CancelHandler = (cancel: InviteCancel) => void;
type RoomHandler = (row: CallRow) => void;
type RoomCloseHandler = (payload: { callId: string }) => void;
type DeclinedHandler = (payload: InviteDeclined) => void;
type RingBackHandler = (payload: RingBack) => void;
const inviteHandlers = new Set<InviteHandler>();
const cancelHandlers = new Set<CancelHandler>();
const roomOpenHandlers = new Set<RoomHandler>();
const roomCloseHandlers = new Set<RoomCloseHandler>();
const declinedHandlers = new Set<DeclinedHandler>();
const ringBackHandlers = new Set<RingBackHandler>();
const inboxChannels = new Map<string, RealtimeChannel>();
let inviteCh: RealtimeChannel | null = null;
let inviteReady: Promise<void> = Promise.resolve();
let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringInvites: CallInvite[] = [];
let roomTimer: ReturnType<typeof setInterval> | null = null;
let roomOpenRow: CallRow | null = null;
const declinedBy = new Map<string, Set<string>>();

function waitChannel(ch: RealtimeChannel): Promise<void> {
  if (ch.state === "SUBSCRIBED") return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 2500);
    ch.subscribe((st) => {
      if (st === "SUBSCRIBED" || st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

function ensureInviteChannel(): RealtimeChannel {
  if (inviteCh) return inviteCh;
  const ch = supabase.channel(INVITE_CHANNEL);
  ch.on("broadcast", { event: "invite" }, ({ payload }) => {
    const inv = payload as CallInvite | null;
    if (!inv?.callId || !inv.callerId) return;
    inviteHandlers.forEach((h) => {
      try {
        h(inv);
      } catch {}
    });
  });
  ch.on("broadcast", { event: "invite_cancel" }, ({ payload }) => {
    const c = payload as InviteCancel | null;
    if (!c?.callId) return;
    cancelHandlers.forEach((h) => {
      try {
        h(c);
      } catch {}
    });
  });
  ch.on("broadcast", { event: "room_open" }, ({ payload }) => {
    const row = payload as CallRow | null;
    if (!row?.id) return;
    roomOpenHandlers.forEach((h) => {
      try {
        h(row);
      } catch {}
    });
  });
  ch.on("broadcast", { event: "room_closed" }, ({ payload }) => {
    const c = payload as { callId?: string } | null;
    if (!c?.callId) return;
    roomCloseHandlers.forEach((h) => {
      try {
        h({ callId: c.callId });
      } catch {}
    });
  });
  ch.on("broadcast", { event: "invite_declined" }, ({ payload }) => {
    const d = payload as InviteDeclined | null;
    if (!d?.callId || !d.userId) return;
    markInviteDeclined(d.callId, d.userId);
    declinedHandlers.forEach((h) => {
      try {
        h(d);
      } catch {}
    });
  });
  ch.on("broadcast", { event: "ring_back" }, ({ payload }) => {
    const r = payload as RingBack | null;
    if (!r?.callId || !r.to || !r.ringtone) return;
    ringBackHandlers.forEach((h) => {
      try {
        h(r);
      } catch {}
    });
  });
  inviteCh = ch;
  inviteReady = waitChannel(ch);
  return ch;
}

function ensureInbox(userId: string): RealtimeChannel {
  const existing = inboxChannels.get(userId);
  if (existing) return existing;
  const ch = supabase.channel(`call-inbox-${userId}`);
  ch.subscribe();
  inboxChannels.set(userId, ch);
  return ch;
}

export function subscribeCallInvites(handler: InviteHandler): () => void {
  inviteHandlers.add(handler);
  ensureInviteChannel();
  return () => {
    inviteHandlers.delete(handler);
  };
}

export function subscribeInviteCancels(handler: CancelHandler): () => void {
  cancelHandlers.add(handler);
  ensureInviteChannel();
  return () => {
    cancelHandlers.delete(handler);
  };
}

export function ensurePersonalInviteInbox(
  userId: string,
  onInvite: InviteHandler,
  onCancel: CancelHandler,
  onDeclined?: DeclinedHandler
): () => void {
  const ch = supabase.channel(`call-inbox-${userId}`);
  ch.on("broadcast", { event: "invite" }, ({ payload }) => {
    const inv = payload as CallInvite | null;
    if (inv?.callId && inv.callerId) onInvite(inv);
  });
  ch.on("broadcast", { event: "invite_cancel" }, ({ payload }) => {
    const c = payload as InviteCancel | null;
    if (c?.callId) onCancel(c);
  });
  if (onDeclined) {
    ch.on("broadcast", { event: "invite_declined" }, ({ payload }) => {
      const d = payload as InviteDeclined | null;
      if (d?.callId && d.userId) {
        markInviteDeclined(d.callId, d.userId);
        onDeclined(d);
      }
    });
  }
  ch.on("broadcast", { event: "ring_back" }, ({ payload }) => {
    const r = payload as RingBack | null;
    if (r?.callId && r.to && r.ringtone) {
      ringBackHandlers.forEach((h) => {
        try {
          h(r);
        } catch {}
      });
    }
  });
  ch.subscribe();
  inboxChannels.set(userId, ch);
  return () => {
    inviteHandlers.delete(onInvite);
    cancelHandlers.delete(onCancel);
    if (onDeclined) declinedHandlers.delete(onDeclined);
    supabase.removeChannel(ch);
    if (inboxChannels.get(userId) === ch) inboxChannels.delete(userId);
  };
}

export function subscribeInviteDeclines(handler: DeclinedHandler): () => void {
  declinedHandlers.add(handler);
  ensureInviteChannel();
  return () => {
    declinedHandlers.delete(handler);
  };
}

export function subscribeRingBacks(handler: RingBackHandler): () => void {
  ringBackHandlers.add(handler);
  ensureInviteChannel();
  return () => {
    ringBackHandlers.delete(handler);
  };
}

// Callee → caller: "this is MY ringtone, play it while you wait"
export function broadcastRingBack(callId: string, to: string, ringtone: string): void {
  if (!callId || !to || !ringtone) return;
  const payload: RingBack = { callId, to, ringtone };
  try {
    const ch = ensureInviteChannel();
    ch.send({ type: "broadcast", event: "ring_back", payload });
  } catch {}
  try {
    const inbox = ensureInbox(to);
    void waitChannel(inbox).then(() => {
      inbox.send({ type: "broadcast", event: "ring_back", payload });
    });
  } catch {}
}

export function markInviteDeclined(callId: string, userId: string): void {
  let set = declinedBy.get(callId);
  if (!set) {
    set = new Set<string>();
    declinedBy.set(callId, set);
  }
  set.add(userId);
  removeInvitee(callId, userId);
}

export function isInviteDeclined(callId: string, userId: string): boolean {
  return declinedBy.get(callId)?.has(userId) ?? false;
}

export function removeInvitee(callId: string, userId: string): void {
  ringInvites = ringInvites.filter((i) => !(i.callId === callId && i.to === userId));
  if (!ringInvites.length && ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}

export function broadcastInviteDeclined(callId: string, userId: string, callerId: string): void {
  const payload: InviteDeclined = { callId, userId, callerId };
  markInviteDeclined(callId, userId);
  try {
    const ch = ensureInviteChannel();
    ch.send({ type: "broadcast", event: "invite_declined", payload });
  } catch {}
  try {
    const inbox = ensureInbox(callerId);
    void waitChannel(inbox).then(() => {
      inbox.send({ type: "broadcast", event: "invite_declined", payload });
    });
  } catch {}
}

async function broadcastInvite(invite: CallInvite): Promise<void> {
  try {
    if (invite.to && isInviteDeclined(invite.callId, invite.to)) return;
    const ch = ensureInviteChannel();
    await inviteReady;
    ch.send({ type: "broadcast", event: "invite", payload: invite });
    if (invite.to) {
      const inbox = ensureInbox(invite.to);
      await waitChannel(inbox);
      inbox.send({ type: "broadcast", event: "invite", payload: invite });
    }
  } catch {}
}

export function broadcastInviteCancel(callId: string, callerId: string): void {
  const payload: InviteCancel = { callId, callerId };
  try {
    const ch = ensureInviteChannel();
    ch.send({ type: "broadcast", event: "invite_cancel", payload });
  } catch {}
}

// Keep ringing until hangup so peers who open the app late still get the call
export function startInviteRing(invites: CallInvite[]): void {
  ringInvites = invites
    .filter((i) => i.callId && i.callerId)
    .filter((i) => !(i.to && isInviteDeclined(i.callId, i.to)));
  const tick = () => {
    for (const inv of ringInvites) void broadcastInvite(inv);
  };
  tick();
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = setInterval(tick, RING_MS);
}

export function stopInviteRing(callId?: string): void {
  if (!callId) {
    ringInvites = [];
    if (ringTimer) {
      clearInterval(ringTimer);
      ringTimer = null;
    }
    return;
  }
  ringInvites = ringInvites.filter((i) => i.callId !== callId);
  if (!ringInvites.length && ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}

// Immediately re-send all active invites (caller returns to the tab, so late/openers catch up)
export function pokeInviteRing(): void {
  for (const inv of ringInvites) void broadcastInvite(inv);
}

export function subscribeRoomOpens(handler: RoomHandler): () => void {
  roomOpenHandlers.add(handler);
  ensureInviteChannel();
  return () => {
    roomOpenHandlers.delete(handler);
  };
}

export function subscribeRoomCloses(handler: RoomCloseHandler): () => void {
  roomCloseHandlers.add(handler);
  ensureInviteChannel();
  return () => {
    roomCloseHandlers.delete(handler);
  };
}

// Keep announcing an open room so anyone who comes online sees the Join button
export function startRoomAnnounce(row: CallRow): void {
  roomOpenRow = row;
  const tick = () => {
    if (!roomOpenRow) return;
    try {
      const ch = ensureInviteChannel();
      void inviteReady.then(() => {
        ch.send({ type: "broadcast", event: "room_open", payload: roomOpenRow });
      });
    } catch {}
  };
  tick();
  if (roomTimer) clearInterval(roomTimer);
  roomTimer = setInterval(tick, 3000);
}

// announceClosed=true only when the room is truly gone (last member left / ended)
export function stopRoomAnnounce(callId?: string, announceClosed = true): void {
  const id = callId ?? roomOpenRow?.id ?? null;
  if (callId && roomOpenRow && roomOpenRow.id !== callId) return;
  roomOpenRow = null;
  if (roomTimer) {
    clearInterval(roomTimer);
    roomTimer = null;
  }
  if (announceClosed && id) {
    try {
      const ch = ensureInviteChannel();
      ch.send({ type: "broadcast", event: "room_closed", payload: { callId: id } });
    } catch {}
  }
}

function buildInvites(call: CallRow, invitees: string[]): CallInvite[] {
  return invitees.map((to) => ({
    to,
    callId: call.id,
    callerId: call.created_by,
    withVideo: call.with_video,
    ringtone: call.ringtone,
    kind: call.kind,
    peerId: call.peer_id,
  }));
}

export async function createCall(opts: {
  createdBy: string;
  kind: "group" | "dm";
  peerId?: string | null;
  inviteeIds: string[];
  withVideo: boolean;
  ringtone?: string;
}): Promise<CallRow | null> {
  const client = raw();
  const ringtone = opts.ringtone ?? getSavedRingtone();
  const invitees = opts.inviteeIds.filter((id) => id !== opts.createdBy);
  const { data: call, error } = await client
    .from("calls")
    .insert({
      kind: opts.kind,
      peer_id: opts.peerId ?? null,
      created_by: opts.createdBy,
      with_video: opts.withVideo,
      ringtone,
      status: "ringing",
    })
    .select()
    .single();

  if (error || !call) {
    if (isMissingTable(error)) {
      const fallback: CallRow = {
        id: newId(),
        kind: opts.kind,
        peer_id: opts.peerId ?? null,
        created_by: opts.createdBy,
        with_video: opts.withVideo,
        ringtone,
        status: "ringing",
        created_at: new Date().toISOString(),
        ended_at: null,
      };
      startInviteRing(buildInvites(fallback, invitees));
      return fallback;
    }
    if (error?.code === "23505" || error?.message?.includes("calls_one_active")) {
      throw new Error("A call is already active here — tap Join to enter.");
    }
    return null;
  }

  const row = call as CallRow;
  const now = new Date().toISOString();
  const members = [
    { call_id: row.id, user_id: opts.createdBy, role: "host", state: "joined", joined_at: now, updated_at: now },
    ...invitees.map((id) => ({
      call_id: row.id,
      user_id: id,
      role: "member",
      state: "invited",
      joined_at: null,
      updated_at: now,
    })),
  ];
  await client.from("call_members").upsert(members, { onConflict: "call_id,user_id" });
  startInviteRing(buildInvites(row, invitees));
  return row;
}

export async function fetchMyOpenCalls(userId: string): Promise<OpenCall[] | null> {
  const client = raw();
  const { data, error } = await client
    .from("call_members")
    .select("*, calls(*)")
    .eq("user_id", userId);
  if (error) {
    if (isMissingTable(error)) return [];
    return null;
  }
  const rows = (data ?? []) as (CallMemberRow & { calls: CallRow | null })[];
  return rows
    .filter((r) => r.calls && r.calls.status !== "ended")
    .map((r) => ({ call: r.calls as CallRow, member: r }));
}

export async function setMemberState(callId: string, userId: string, state: string): Promise<void> {
  const client = raw();
  const row: Record<string, unknown> = {
    call_id: callId,
    user_id: userId,
    state,
    updated_at: new Date().toISOString(),
  };
  if (state === "joined") row["joined_at"] = new Date().toISOString();
  await client.from("call_members").upsert(row, { onConflict: "call_id,user_id" });
}

export async function getJoinedPeers(callId: string, me: string): Promise<string[]> {
  const client = raw();
  const { data, error } = await client
    .from("call_members")
    .select("user_id")
    .eq("call_id", callId)
    .eq("state", "joined");
  if (error) return [];
  return ((data ?? []) as { user_id: string }[])
    .map((r) => r.user_id)
    .filter((id) => id !== me);
}

export async function countJoinedMembers(callId: string): Promise<number> {
  const client = raw();
  const { count, error } = await client
    .from("call_members")
    .select("user_id", { count: "exact", head: true })
    .eq("call_id", callId)
    .eq("state", "joined");
  if (error) return 0;
  return count ?? 0;
}

export async function setCallActive(callId: string): Promise<void> {
  const client = raw();
  await client.from("calls").update({ status: "active" }).eq("id", callId).eq("status", "ringing");
}

// True when a call room is already ringing/active for this peer pair (DM) or any
// group room. We check before creating so a second call can't start — only Join.
export async function hasActiveCall(opts: {
  kind: "group" | "dm";
  peerId?: string | null;
  userId: string;
}): Promise<boolean> {
  const client = raw();
  if (opts.kind === "group") {
    const { data } = await client
      .from("calls")
      .select("id")
      .eq("kind", "group")
      .neq("status", "ended")
      .limit(1);
    return (data ?? []).length > 0;
  }
  if (opts.kind === "dm" && opts.peerId) {
    const a = opts.userId;
    const b = opts.peerId;
    const { data } = await client
      .from("calls")
      .select("id")
      .eq("kind", "dm")
      .neq("status", "ended")
      .or(`and(created_by.eq.${a},peer_id.eq.${b}),and(created_by.eq.${b},peer_id.eq.${a})`)
      .limit(1);
    return (data ?? []).length > 0;
  }
  return false;
}

export async function endCallRoom(callId: string): Promise<void> {
  const client = raw();
  await client
    .from("calls")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", callId);
}
