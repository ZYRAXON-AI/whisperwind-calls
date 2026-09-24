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

// Single shared invite channel — both send and receive on the SAME channel name
const INVITE_CHANNEL = "zyraxon-call-invites-all";

type InviteHandler = (invite: CallInvite) => void;
const inviteHandlers = new Set<InviteHandler>();
let inviteCh: RealtimeChannel | null = null;

function onInviteBroadcast({ payload }: { payload: unknown }) {
  const inv = payload as CallInvite | null;
  if (!inv || !inv.callId || !inv.callerId) return;
  inviteHandlers.forEach((h) => {
    try {
      h(inv);
    } catch {}
  });
}

function ensureInviteChannel(): RealtimeChannel {
  if (inviteCh) return inviteCh;
  const ch = supabase.channel(INVITE_CHANNEL);
  ch.on("broadcast", { event: "invite" }, onInviteBroadcast);
  ch.subscribe();
  inviteCh = ch;
  return ch;
}

export function subscribeCallInvites(handler: InviteHandler): () => void {
  inviteHandlers.add(handler);
  ensureInviteChannel();
  return () => {
    inviteHandlers.delete(handler);
  };
}

async function broadcastInvite(invite: CallInvite): Promise<void> {
  try {
    const ch = ensureInviteChannel();
    if (ch.state !== "SUBSCRIBED") {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 2000);
        const check = (st: string) => {
          if (st === "SUBSCRIBED") {
            clearTimeout(t);
            resolve();
          }
        };
        // already may be subscribing
        if (ch.state === "SUBSCRIBED") {
          clearTimeout(t);
          resolve();
          return;
        }
        ch.subscribe(check);
      });
    }
    ch.send({ type: "broadcast", event: "invite", payload: invite });
  } catch {}
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

  const invitees = opts.inviteeIds.filter((id) => id !== opts.createdBy);

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
      for (const to of invitees) {
        await broadcastInvite({
          to,
          callId: fallback.id,
          callerId: fallback.created_by,
          withVideo: fallback.with_video,
          ringtone: fallback.ringtone,
          kind: fallback.kind,
          peerId: fallback.peer_id,
        });
      }
      return fallback;
    }
    return null;
  }

  const now = new Date().toISOString();
  const members = [
    { call_id: call.id, user_id: opts.createdBy, role: "host", state: "joined", joined_at: now, updated_at: now },
    ...invitees.map((id) => ({
      call_id: call.id,
      user_id: id,
      role: "member",
      state: "invited",
      joined_at: null,
      updated_at: now,
    })),
  ];
  await client.from("call_members").upsert(members, { onConflict: "call_id,user_id" });

  for (const to of invitees) {
    await broadcastInvite({
      to,
      callId: call.id,
      callerId: opts.createdBy,
      withVideo: opts.withVideo,
      ringtone,
      kind: opts.kind,
      peerId: opts.peerId ?? null,
    });
  }

  return call as CallRow;
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

export async function endCallRoom(callId: string): Promise<void> {
  const client = raw();
  await client
    .from("calls")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", callId);
}
