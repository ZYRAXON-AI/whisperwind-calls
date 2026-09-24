import type { SupabaseClient } from "@supabase/supabase-js";

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

// calls/call_members are new tables not yet in generated types — bypass typed client
const raw = () => supabase as unknown as SupabaseClient;

export async function createCall(opts: {
  createdBy: string;
  kind: "group" | "dm";
  peerId?: string | null;
  inviteeIds: string[];
  withVideo: boolean;
}): Promise<CallRow | null> {
  const client = raw();
  const { data: call, error } = await client
    .from("calls")
    .insert({
      kind: opts.kind,
      peer_id: opts.peerId ?? null,
      created_by: opts.createdBy,
      with_video: opts.withVideo,
      ringtone: getSavedRingtone(),
      status: "ringing",
    })
    .select()
    .single();
  if (error || !call) return null;

  const now = new Date().toISOString();
  const members = [
    { call_id: call.id, user_id: opts.createdBy, role: "host", state: "joined", joined_at: now, updated_at: now },
    ...opts.inviteeIds
      .filter((id) => id !== opts.createdBy)
      .map((id) => ({ call_id: call.id, user_id: id, role: "member", state: "invited", joined_at: null, updated_at: now })),
  ];
  await client.from("call_members").upsert(members, { onConflict: "call_id,user_id" });
  return call as CallRow;
}

export async function fetchMyOpenCalls(userId: string): Promise<OpenCall[] | null> {
  const client = raw();
  const { data, error } = await client
    .from("call_members")
    .select("*, calls(*)")
    .eq("user_id", userId);
  if (error) return null;
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
  // upsert: survive missing rows (e.g. invite insert failed earlier)
  await client.from("call_members").upsert(row, { onConflict: "call_id,user_id" });
}

export async function getJoinedPeers(callId: string, me: string): Promise<string[]> {
  const client = raw();
  const { data } = await client
    .from("call_members")
    .select("user_id")
    .eq("call_id", callId)
    .eq("state", "joined");
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter((id) => id !== me);
}

export async function countJoinedMembers(callId: string): Promise<number> {
  const client = raw();
  const { count } = await client
    .from("call_members")
    .select("user_id", { count: "exact", head: true })
    .eq("call_id", callId)
    .eq("state", "joined");
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
