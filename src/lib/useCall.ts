import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  type CallRow,
  countJoinedMembers,
  createCall,
  endCallRoom,
  fetchMyOpenCalls,
  getJoinedPeers,
  setCallActive,
  setMemberState,
  subscribeCallInvites,
} from "@/lib/calls";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
  ],
};

export type CallStatus = "idle" | "calling" | "incoming" | "connected";

export type IncomingCall = {
  callId: string;
  callerId: string;
  withVideo: boolean;
  ringtone: string;
};

type SigPayload = {
  from?: string;
  to?: string;
  kind?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

// Translate getUserMedia failures into clear, actionable messages
export function mediaErrorMessage(err: unknown, video: boolean): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return video
      ? "Camera permission is blocked — allow camera for this site in your browser"
      : "Microphone permission is blocked — allow microphone for this site in your browser";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return video ? "No camera found on this device" : "No microphone found on this device";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera/microphone is being used by another app";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return video ? "Camera does not support the requested settings" : "Microphone does not support the requested settings";
  }
  if (name === "AbortError") return "Could not access camera/microphone — try again";
  return video ? "Could not start the camera" : "Could not start the microphone";
}

async function acquireMedia(video: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: "user" } : false,
    });
  } catch (err) {
    // Retry with loose constraints — some devices reject exact/facingMode combos
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video });
    } catch {
      throw err;
    }
  }
}

export function useCall(userId: string | null) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [withVideo, setWithVideo] = useState(false);
  const [incomingVideo, setIncomingVideo] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [peerSharingScreen, setPeerSharingScreen] = useState(false);
  const [callerRingtone, setCallerRingtone] = useState("classic");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [joinableCalls, setJoinableCalls] = useState<CallRow[]>([]);

  const statusRef = useRef<CallStatus>("idle");
  const userIdRef = useRef<string | null>(userId);
  const callIdRef = useRef<string | null>(null);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const sharersRef = useRef<Set<string>>(new Set());
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const publishRemotes = useCallback(() => {
    const obj: Record<string, MediaStream> = {};
    remoteRef.current.forEach((s, id) => {
      obj[id] = s;
    });
    setRemoteStreams(obj);
  }, []);

  const send = useCallback((payload: Record<string, unknown>) => {
    callChannelRef.current?.send({
      type: "broadcast",
      event: "sig",
      payload: { ...payload, from: userIdRef.current },
    });
  }, []);

  const closePeer = useCallback(
    (peerId: string) => {
      const pc = pcsRef.current.get(peerId);
      if (pc) {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onnegotiationneeded = null;
        try {
          pc.close();
        } catch {}
        pcsRef.current.delete(peerId);
      }
      pendingIceRef.current.delete(peerId);
      makingOfferRef.current.delete(peerId);
      sharersRef.current.delete(peerId);
      setPeerSharingScreen(sharersRef.current.size > 0);
      const remote = remoteRef.current.get(peerId);
      if (remote) {
        remote.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        remoteRef.current.delete(peerId);
      }
      publishRemotes();
    },
    [publishRemotes]
  );

  const createPeer = useCallback(
    (peerId: string) => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;
      if (!userIdRef.current || !localRef.current) return null;

      const pc = new RTCPeerConnection(ICE);
      const remote = new MediaStream();
      remoteRef.current.set(peerId, remote);

      localRef.current.getTracks().forEach((t) => {
        try {
          pc.addTrack(t, localRef.current as MediaStream);
        } catch {}
      });

      // perfect negotiation: impolite peer (lower userId) rejects colliding offers
      pc.onnegotiationneeded = async () => {
        if (makingOfferRef.current.has(peerId)) return;
        try {
          makingOfferRef.current.add(peerId);
          if (pc.signalingState !== "stable") return;
          const offer = await pc.createOffer();
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);
          send({ to: peerId, kind: "offer", sdp: pc.localDescription });
        } catch {
        } finally {
          makingOfferRef.current.delete(peerId);
        }
      };

      pc.ontrack = (e) => {
        const stream = remoteRef.current.get(peerId) ?? new MediaStream();
        remoteRef.current.set(peerId, stream);
        if (e.streams[0]) {
          e.streams[0].getTracks().forEach((track) => {
            if (!stream.getTracks().some((x) => x.id === track.id)) stream.addTrack(track);
          });
        } else if (e.track) {
          stream.addTrack(e.track);
        }
        publishRemotes();
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) send({ to: peerId, kind: "ice", candidate: e.candidate.toJSON() });
      };

      pcsRef.current.set(peerId, pc);
      return pc;
    },
    [publishRemotes, send]
  );

  const drainIce = useCallback(async (peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    if (!pc?.remoteDescription) return;
    const queue = pendingIceRef.current.get(peerId) ?? [];
    pendingIceRef.current.delete(peerId);
    for (const c of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {}
    }
  }, []);

  const handleSig = useCallback(
    async (payload: SigPayload) => {
      if (!payload || !userIdRef.current) return;
      if (payload.to !== userIdRef.current) return;
      const from = payload.from;
      if (!from || from === userIdRef.current) return;

      if (payload.kind === "ice") {
        if (!payload.candidate) return;
        const pc = pcsRef.current.get(from);
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {}
        } else {
          const queue = pendingIceRef.current.get(from) ?? [];
          queue.push(payload.candidate);
          pendingIceRef.current.set(from, queue);
        }
        return;
      }

      if (payload.kind === "offer") {
        if (!payload.sdp) return;
        const pc = createPeer(from);
        if (!pc) return;
        const polite = (userIdRef.current ?? "") > from;
        if (makingOfferRef.current.has(from) && !polite) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await drainIce(from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ to: from, kind: "answer", sdp: pc.localDescription });
          if (callIdRef.current) void setCallActive(callIdRef.current);
          setStatus((s) => (s === "calling" || s === "incoming" || s === "connected" ? "connected" : s));
        } catch {}
        return;
      }

      if (payload.kind === "answer") {
        if (!payload.sdp) return;
        const pc = pcsRef.current.get(from);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await drainIce(from);
          if (callIdRef.current) void setCallActive(callIdRef.current);
          setStatus((s) => (s === "calling" || s === "incoming" || s === "connected" ? "connected" : s));
        } catch {}
      }
    },
    [createPeer, drainIce, send]
  );

  const localCleanup = useCallback(() => {
    Array.from(pcsRef.current.keys()).forEach((id) => closePeer(id));
    const ch = callChannelRef.current;
    if (ch) {
      try {
        ch.send({ type: "broadcast", event: "peer_leave", payload: { from: userIdRef.current } });
      } catch {}
      supabase.removeChannel(ch);
    }
    callChannelRef.current = null;
    localRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {}
    });
    screenRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {}
    });
    localRef.current = null;
    screenRef.current = null;
    camTrackRef.current = null;
    micTrackRef.current = null;
    callIdRef.current = null;
    remoteRef.current.clear();
    pendingIceRef.current.clear();
    makingOfferRef.current.clear();
    sharersRef.current.clear();
    publishRemotes();
    setLocalStream(null);
    setStatus("idle");
    setIncoming(null);
    setIncomingVideo(false);
    setCurrentCallId(null);
    setWithVideo(false);
    setSharingScreen(false);
    setPeerSharingScreen(false);
    setMicOn(true);
    setCamOn(true);
  }, [closePeer, publishRemotes]);

  const joinChannel = useCallback(
    (callId: string): Promise<void> => {
      const ch = supabase.channel(`call:${callId}`, {
        config: { broadcast: { self: false } },
      });

      ch.on("broadcast", { event: "sig" }, ({ payload }) => {
        void handleSig(payload as SigPayload);
      });

      ch.on("broadcast", { event: "peer_leave" }, ({ payload }) => {
        const from = (payload as { from?: string })?.from;
        if (from && from !== userIdRef.current) closePeer(from);
      });

      ch.on("broadcast", { event: "screen" }, ({ payload }) => {
        const p = payload as { from?: string; sharing?: boolean };
        if (!p.from || p.from === userIdRef.current) return;
        if (p.sharing) sharersRef.current.add(p.from);
        else sharersRef.current.delete(p.from);
        setPeerSharingScreen(sharersRef.current.size > 0);
      });

      ch.on("broadcast", { event: "call_ended" }, ({ payload }) => {
        const p = payload as { callId?: string; from?: string };
        if (p.callId === callIdRef.current && p.from !== userIdRef.current) localCleanup();
      });

      // Presence: discover peers even when call_members table is missing
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const seen = new Set<string>();
        for (const key of Object.keys(state)) {
          const entries = state[key] as { userId?: string }[];
          for (const e of entries) {
            if (e?.userId && e.userId !== userIdRef.current) seen.add(e.userId);
          }
        }
        seen.forEach((id) => {
          if (localRef.current && !pcsRef.current.has(id)) createPeer(id);
        });
      });

      callChannelRef.current = ch;

      // Only send offers after the channel is SUBSCRIBED — otherwise broadcast is dropped
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        ch.subscribe((st) => {
          if (st === "SUBSCRIBED") {
            clearTimeout(timer);
            try {
              void ch.track({ userId: userIdRef.current });
            } catch {}
            resolve();
          }
        });
      });
    },
    [closePeer, createPeer, handleSig, localCleanup]
  );

  const loadOpenCalls = useCallback(
    async (silentLeave: boolean) => {
      if (!userId) return;
      const rows = await fetchMyOpenCalls(userId);
      if (!rows) return; // network/RLS error — never kick an active call on fetch failure
      const openIds = new Set(rows.map((r) => r.call.id));

      if (callIdRef.current && !openIds.has(callIdRef.current) && silentLeave) {
        localCleanup();
        return;
      }

      const inv = rows.find(
        (r) =>
          r.member.state === "invited" &&
          r.call.created_by !== userId &&
          r.call.id !== callIdRef.current
      );
      const joinable = rows.filter((r) => r.call.id !== callIdRef.current).map((r) => r.call);
      setJoinableCalls(joinable);

      if (inv && statusRef.current === "idle") {
        setIncoming({
          callId: inv.call.id,
          callerId: inv.call.created_by,
          withVideo: inv.call.with_video,
          ringtone: inv.call.ringtone,
        });
        setIncomingVideo(inv.call.with_video);
        setCallerRingtone(inv.call.ringtone);
        setStatus("incoming");
        return;
      }
      if (!inv && statusRef.current === "incoming") {
        setIncoming(null);
        setIncomingVideo(false);
        setStatus("idle");
      }
    },
    [localCleanup, userId]
  );

  // realtime invites (broadcast bus) + call status + initial load
  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      void loadOpenCalls(true);
    };
    const ch = supabase.channel(`call-invites:${userId}`);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "call_members", filter: `user_id=eq.${userId}` },
      refresh
    )
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, refresh)
      .subscribe();

    // Realtime invite bus — rings even when calls/call_members tables are missing
    const offInvite = subscribeCallInvites((inv) => {
      if (inv.to && inv.to !== userId) return;
      if (inv.callerId === userId) return;
      if (inv.callId === callIdRef.current) return;
      if (statusRef.current !== "idle" && statusRef.current !== "incoming") return;
      setIncoming({
        callId: inv.callId,
        callerId: inv.callerId,
        withVideo: inv.withVideo,
        ringtone: inv.ringtone,
      });
      setIncomingVideo(inv.withVideo);
      setCallerRingtone(inv.ringtone);
      setStatus("incoming");
    });

    void loadOpenCalls(true);
    return () => {
      offInvite();
      supabase.removeChannel(ch);
    };
  }, [loadOpenCalls, userId]);

  const enteringRef = useRef(false);

  const enterCall = useCallback(
    async (callId: string, video: boolean) => {
      if (!userId || enteringRef.current) return;
      enteringRef.current = true;
      try {
        if (callIdRef.current && callIdRef.current !== callId) {
          const prev = callIdRef.current;
          await setMemberState(prev, userId, "left");
          if ((await countJoinedMembers(prev)) === 0) await endCallRoom(prev);
          localCleanup();
        }

        let stream: MediaStream;
        try {
          stream = await acquireMedia(video);
        } catch (err) {
          localCleanup();
          throw new Error(mediaErrorMessage(err, video));
        }

        localRef.current = stream;
        setLocalStream(stream);
        const at = stream.getAudioTracks()[0];
        const vt = stream.getVideoTracks()[0];
        if (at) micTrackRef.current = at;
        if (vt) camTrackRef.current = vt;

        callIdRef.current = callId;
        setCurrentCallId(callId);
        setWithVideo(video);
        setIncoming(null);
        setIncomingVideo(false);
        setStatus("calling");
        setSharingScreen(false);
        setPeerSharingScreen(false);
        sharersRef.current.clear();

        await setMemberState(callId, userId, "joined");
        await joinChannel(callId);
        await setCallActive(callId);

        // New joiner rule: offer to every existing member (DB) + presence covers fallback
        try {
          const peers = await getJoinedPeers(callId, userId);
          peers.forEach((p) => createPeer(p));
        } catch {}
        setJoinableCalls((prev) => prev.filter((c) => c.id !== callId));
      } finally {
        enteringRef.current = false;
      }
    },
    [createPeer, joinChannel, localCleanup, userId]
  );

  const startDmCall = useCallback(
    async (peerId: string, video: boolean) => {
      if (!userId || !peerId || peerId === userId) return;
      if (statusRef.current !== "idle") return;
      const call = await createCall({
        createdBy: userId,
        kind: "dm",
        peerId,
        inviteeIds: [peerId],
        withVideo: video,
      });
      if (!call) throw new Error("Could not create the call room — server error. Please try again.");
      await enterCall(call.id, video);
    },
    [enterCall, userId]
  );

  const startGroupCall = useCallback(
    async (inviteeIds: string[], video: boolean) => {
      if (!userId) return;
      if (statusRef.current !== "idle") return;
      const call = await createCall({
        createdBy: userId,
        kind: "group",
        peerId: null,
        inviteeIds,
        withVideo: video,
      });
      if (!call) throw new Error("Could not create the call room — server error. Please try again.");
      await enterCall(call.id, video);
    },
    [enterCall, userId]
  );

  const accept = useCallback(() => {
    if (!incoming) return;
    return enterCall(incoming.callId, incoming.withVideo);
  }, [enterCall, incoming]);

  const decline = useCallback(async () => {
    if (!userId || !incoming) return;
    await setMemberState(incoming.callId, userId, "declined");
    setIncoming(null);
    setIncomingVideo(false);
    setStatus("idle");
    void loadOpenCalls(true);
  }, [incoming, loadOpenCalls, userId]);

  const joinCall = useCallback(
    async (callId: string) => {
      const row = joinableCalls.find((c) => c.id === callId);
      if (!row) return;
      await enterCall(callId, row.with_video);
    },
    [enterCall, joinableCalls]
  );

  const hangup = useCallback(async () => {
    const me = userIdRef.current;
    const callId = callIdRef.current;
    if (me && callId) {
      await setMemberState(callId, me, "left");
      if ((await countJoinedMembers(callId)) === 0) await endCallRoom(callId);
    }
    localCleanup();
    void loadOpenCalls(true);
  }, [loadOpenCalls, localCleanup]);

  const toggleMic = useCallback(() => {
    if (!micTrackRef.current) return;
    const next = !micTrackRef.current.enabled;
    micTrackRef.current.enabled = next;
    setMicOn(next);
  }, []);

  const toggleCam = useCallback(() => {
    if (!camTrackRef.current) return;
    const next = !camTrackRef.current.enabled;
    camTrackRef.current.enabled = next;
    setCamOn(next);
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (screenRef.current) {
      screenRef.current.getTracks().forEach((t) => t.stop());
      screenRef.current = null;
    }
    for (const pc of pcsRef.current.values()) {
      const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (videoSender) {
        if (camTrackRef.current) {
          try {
            await videoSender.replaceTrack(camTrackRef.current);
          } catch {}
        } else {
          try {
            pc.removeTrack(videoSender);
          } catch {}
        }
      }
    }
    if (localRef.current) setLocalStream(new MediaStream(localRef.current.getTracks()));
    setSharingScreen(false);
    callChannelRef.current?.send({
      type: "broadcast",
      event: "screen",
      payload: { from: userIdRef.current, sharing: false },
    });
  }, []);

  const shareScreen = useCallback(async () => {
    if (!localRef.current || pcsRef.current.size === 0) return;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      screenRef.current = displayStream;
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrack.contentHint = "detail";

      for (const pc of pcsRef.current.values()) {
        const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (videoSender) {
          try {
            await videoSender.replaceTrack(screenTrack);
          } catch {}
        } else {
          try {
            pc.addTrack(screenTrack, displayStream);
          } catch {}
        }
      }

      setLocalStream(displayStream);
      setSharingScreen(true);
      callChannelRef.current?.send({
        type: "broadcast",
        event: "screen",
        payload: { from: userIdRef.current, sharing: true },
      });

      screenTrack.onended = () => {
        void stopScreenShare();
      };
    } catch {
      void stopScreenShare();
    }
  }, [stopScreenShare]);

  // unmount: best-effort leave so the room doesn't stay ghost-joined
  useEffect(() => {
    return () => {
      const callId = callIdRef.current;
      const me = userIdRef.current;
      if (callId && me) void setMemberState(callId, me, "left");
    };
  }, []);

  return {
    status,
    withVideo,
    incomingVideo,
    micOn,
    camOn,
    sharingScreen,
    peerSharingScreen,
    callerRingtone,
    localStream,
    remoteStreams,
    incoming,
    currentCallId,
    joinableCalls,
    startDmCall,
    startGroupCall,
    accept,
    decline,
    hangup,
    joinCall,
    toggleMic,
    toggleCam,
    shareScreen,
    stopScreenShare,
  };
}
