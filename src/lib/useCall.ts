import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  type CallInvite,
  type CallRow,
  broadcastInviteCancel,
  broadcastInviteDeclined,
  broadcastRingBack,
  countJoinedMembers,
  createCall,
  endCallRoom,
  ensurePersonalInviteInbox,
  fetchMyOpenCalls,
  getJoinedPeers,
  isInviteDeclined,
  removeInvitee,
  setCallActive,
  setMemberState,
  startRoomAnnounce,
  stopInviteRing,
  stopRoomAnnounce,
  subscribeCallInvites,
  subscribeInviteCancels,
  subscribeInviteDeclines,
  subscribeRingBacks,
  subscribeRoomCloses,
  subscribeRoomOpens,
} from "@/lib/calls";
import { pushNotify } from "@/lib/push";
import { getSavedRingtone, stopRingtone } from "@/lib/sounds";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
    // Free TURN — relay when both peers are behind strict NAT (openrelay is the only public free relay)
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 1,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
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

// Deterministic: lower userId sends the WebRTC offer (kills offer glare)
function shouldOfferTo(myId: string, peerId: string): boolean {
  return myId < peerId;
}

// Two people calling at once → higher creator yields to lower creator
function shouldYieldCall(
  myCreator: string,
  myCallId: string,
  theirCreator: string,
  theirCallId: string
): boolean {
  if (theirCreator !== myCreator) return theirCreator < myCreator;
  return theirCallId < myCallId;
}

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
  // Modest resolution = much less lag on mobile/weak networks.
  // Echo cancellation + noise suppression make both sides actually hear speech.
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: video
        ? {
            facingMode: "user",
            width: { ideal: 640, max: 1280 },
            height: { ideal: 360, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          }
        : false,
    });
  } catch (err) {
    // Retry with loose constraints — some devices reject exact/facingMode combos
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: video || false });
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
  // OUR side: outgoing=true → we placed the call (we hear THEIR ringtone)
  const [outgoing, setOutgoing] = useState(false);
  const [peerRingtone, setPeerRingtone] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [joinableCalls, setJoinableCalls] = useState<CallRow[]>([]);

  const statusRef = useRef<CallStatus>("idle");
  const enterCallRef = useRef<(callId: string, video: boolean) => Promise<void>>(async () => {});
  const userIdRef = useRef<string | null>(userId);
  const callIdRef = useRef<string | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const callStartedAtRef = useRef<number | null>(null);
  const withVideoRef = useRef(false);
  const peerIdRef = useRef<string | null>(null);
  const lastCallRowRef = useRef<CallRow | null>(null);
  const declinedCallIdsRef = useRef<Set<string>>(new Set());
  // Offer/ICE bookkeeping — broadcasts are fire-and-forget, so we must be able to resend
  const answeredRef = useRef<Set<string>>(new Set());
  const iceSentRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const lastOfferSentRef = useRef<Map<string, number>>(new Map());

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
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);
  useEffect(() => {
    withVideoRef.current = withVideo;
  }, [withVideo]);

  // When WE are the callee: answer the invite with our own saved ringtone so
  // the caller hears it on their side (sent twice — broadcasts can drop)
  const announceRingBack = useCallback((callId: string, callerId: string) => {
    const me = userIdRef.current;
    if (!me || !callId || !callerId || callerId === me) return;
    const tone = getSavedRingtone();
    broadcastRingBack(callId, callerId, tone);
    window.setTimeout(() => broadcastRingBack(callId, callerId, tone), 900);
  }, []);

  // Call events go into messages table → show up in chat like normal messages
  const logCallEvent = useCallback(async (body: string, recipient: string | null) => {
    const me = userIdRef.current;
    if (!me) return;
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          sender_id: me,
          recipient_id: recipient,
          kind: "call",
          body,
        })
        .select()
        .single();
      if (error || !data) return;
      // Instant mirror into the open thread so peer sees it without waiting on postgres_changes
      const chName = recipient
        ? `zyraxon-thread-${[me, recipient].sort().join("-")}`
        : "zyraxon-thread-group";
      const ch = supabase.channel(chName);
      ch.subscribe((st) => {
        if (st === "SUBSCRIBED") {
          ch.send({ type: "broadcast", event: "message", payload: data });
          supabase.removeChannel(ch);
        }
      });
      // Web Push when peer's Chrome is closed
      const name = "Whisperwind";
      void pushNotify(recipient, name, body, `call-${me}`);
    } catch {}
  }, []);

  const logCallEnd = useCallback(
    (_callId: string, startedAt: number | null, video: boolean) => {
      if (!startedAt) return;
      const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      const mm = Math.floor(secs / 60);
      const ss = secs % 60;
      const dur = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
      void logCallEvent(`${video ? "Video" : "Audio"} call · ${dur}`, peerIdRef.current);
    },
    [logCallEvent]
  );

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

  // Re-trickle every candidate we already gathered — early ones are usually
  // broadcast before the peer even joins the channel (dropped silently)
  const sendStoredIce = useCallback(
    (peerId: string) => {
      const list = iceSentRef.current.get(peerId);
      if (!list?.length) return;
      for (const c of list) send({ to: peerId, kind: "ice", candidate: c });
    },
    [send]
  );

  // Belt & braces: make sure our mic/cam is really attached and sending.
  // replaceTrack/direction can silently fail during offer/answer shuffling.
  const ensureSenders = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    const local = localRef.current;
    if (!pc || !local || pc.signalingState === "closed") return;
    const a = local.getAudioTracks()[0];
    const v = screenRef.current?.getVideoTracks()[0] ?? local.getVideoTracks()[0];
    for (const tx of pc.getTransceivers()) {
      const kind = tx.receiver.track?.kind;
      try {
        if (kind === "audio" && a) {
          if (tx.sender.track !== a) void tx.sender.replaceTrack(a);
          if (tx.direction !== "sendrecv") tx.direction = "sendrecv";
        }
        if (kind === "video" && v) {
          if (tx.sender.track !== v) void tx.sender.replaceTrack(v);
          if (tx.direction !== "sendrecv") tx.direction = "sendrecv";
        }
      } catch {}
    }
    try {
      if (a && !pc.getTransceivers().some((t) => t.receiver.track?.kind === "audio")) {
        pc.addTrack(a, local);
      }
      if (v && !pc.getTransceivers().some((t) => t.receiver.track?.kind === "video")) {
        pc.addTrack(v, local);
      }
    } catch {}
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
      answeredRef.current.delete(peerId);
      iceSentRef.current.delete(peerId);
      lastOfferSentRef.current.delete(peerId);
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

  const makeOffer = useCallback(
    async (peerId: string, iceRestart = false) => {
      const pc = pcsRef.current.get(peerId);
      if (!pc) return;
      if (makingOfferRef.current.has(peerId)) return;

      // The very first offer is usually broadcast before the peer joins the
      // channel and vanishes. If we're still waiting for their answer, resend
      // the SAME offer (throttled) instead of deadlocking in have-local-offer.
      if (pc.signalingState === "have-local-offer" && pc.localDescription && !iceRestart) {
        const last = lastOfferSentRef.current.get(peerId) ?? 0;
        if (Date.now() - last > 1500) {
          lastOfferSentRef.current.set(peerId, Date.now());
          send({ to: peerId, kind: "offer", sdp: pc.localDescription });
          sendStoredIce(peerId);
        }
        return;
      }

      if (pc.signalingState !== "stable") return;
      // Negotiation already succeeded — never churn a healthy link from the heal loop
      if (answeredRef.current.has(peerId) && !iceRestart && pc.connectionState !== "failed") return;

      try {
        makingOfferRef.current.add(peerId);
        const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        lastOfferSentRef.current.set(peerId, Date.now());
        send({ to: peerId, kind: "offer", sdp: pc.localDescription });
      } catch {
      } finally {
        makingOfferRef.current.delete(peerId);
      }
    },
    [send, sendStoredIce]
  );

  // answerOnly: wait for remote offer before attaching local tracks (avoids m-line glare)
  const createPeer = useCallback(
    (peerId: string, answerOnly = false) => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;
      if (!userIdRef.current || !localRef.current) return null;

      const pc = new RTCPeerConnection(ICE);
      const remote = new MediaStream();
      remoteRef.current.set(peerId, remote);

      if (!answerOnly) {
        localRef.current.getTracks().forEach((t) => {
          try {
            pc.addTrack(t, localRef.current as MediaStream);
          } catch {}
        });
      }

      let answerReady = !answerOnly;

      pc.onnegotiationneeded = async () => {
        if (makingOfferRef.current.has(peerId)) return;
        if (!answerReady) return;
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
        const add = (t: MediaStreamTrack) => {
          if (!stream.getTracks().some((x) => x.id === t.id)) stream.addTrack(t);
          try {
            t.enabled = true;
          } catch {}
        };
        // Always attach e.track — streams[0] can fire empty on some browsers
        if (e.track) add(e.track);
        e.streams[0]?.getTracks().forEach(add);
        e.track?.addEventListener("unmute", () => publishRemotes());
        e.track?.addEventListener("mute", () => publishRemotes());
        // Their track arrived → make sure OUR mic is attached too (silent-send fix)
        ensureSenders(peerId);
        publishRemotes();
        setStatus((s) => (s === "calling" || s === "incoming" ? "connected" : s));
      };

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const json = e.candidate.toJSON();
        const list = iceSentRef.current.get(peerId) ?? [];
        list.push(json);
        iceSentRef.current.set(peerId, list);
        send({ to: peerId, kind: "ice", candidate: json });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          answerReady = true;
          // Link is up — guarantee our mic/cam senders are attached and sendrecv
          ensureSenders(peerId);
          setStatus((s) => (s === "calling" || s === "incoming" ? "connected" : s));
        }
        if (pc.connectionState === "failed") {
          // ICE restart — only the offerer side pushes a new offer
          if (shouldOfferTo(userIdRef.current ?? "", peerId) && pc.signalingState === "stable") {
            void makeOffer(peerId, true);
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          answerReady = true;
          setStatus((s) => (s === "calling" || s === "incoming" ? "connected" : s));
        }
      };

      pcsRef.current.set(peerId, pc);
      // If we're already screen-sharing when this peer connects, send the screen track
      const scr = screenRef.current?.getVideoTracks()[0];
      if (scr && !answerOnly) {
        const vs = pc.getSenders().find((s) => s.track?.kind === "video");
        if (vs) {
          void vs.replaceTrack(scr).catch(() => undefined);
        } else {
          try {
            pc.addTrack(scr, screenRef.current as MediaStream);
          } catch {}
        }
      }

      if (answerOnly) {
        // Expose a one-shot hook so handleSig can flip answerReady after remote answer
        (pc as RTCPeerConnection & { __markAnswerReady?: () => void }).__markAnswerReady = () => {
          answerReady = true;
        };
      }
      return pc;
    },
    [ensureSenders, makeOffer, publishRemotes, send]
  );

  // Only the lower userId creates the initial peer+offer — no double-offer glare
  const discoverPeer = useCallback(
    (peerId: string) => {
      const me = userIdRef.current;
      if (!me || !peerId || peerId === me || !localRef.current) return;
      const existing = pcsRef.current.get(peerId);
      // Healthy link — never churn it from heal/discovery
      if (existing && existing.connectionState === "connected" && existing.remoteDescription) return;
      if (!shouldOfferTo(me, peerId)) {
        // Higher id waits — only nudge the lower id to (re)send the offer
        send({ to: peerId, kind: "hello" });
        return;
      }
      const pc = existing ?? createPeer(peerId, false);
      if (!pc) return;
      // Offer already answered and ICE still checking → only re-trickle ICE,
      // never stack a fresh renegotiation on top of a working handshake
      if (pc.remoteDescription && pc.connectionState !== "failed") return;
      void makeOffer(peerId);
    },
    [createPeer, makeOffer, send]
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

      if (payload.kind === "hello") {
        // Peer is waiting for our offer — make sure we have a PC with local tracks
        sendStoredIce(from);
        if (shouldOfferTo(userIdRef.current, from)) {
          if (!pcsRef.current.has(from)) createPeer(from, false);
          void makeOffer(from);
        }
        return;
      }

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
        const existingPc = pcsRef.current.get(from);
        // Already applying an offer from this peer — let that pass finish first
        if (existingPc?.signalingState === "have-remote-offer") return;
        const pc = existingPc ?? createPeer(from, true);
        if (!pc) return;
        try {
          // Perfect negotiation: polite (higher id) rolls back own offer on collision
          if (pc.signalingState !== "stable") {
            const polite = (userIdRef.current ?? "") > from;
            if (!polite) return;
            await pc.setLocalDescription({ type: "rollback" });
          }
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          // Attach our mic/cam onto the transceivers the remote offer opened —
          // MUST happen before createAnswer so the answer actually says sendrecv
          ensureSenders(from);
          await drainIce(from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ to: from, kind: "answer", sdp: pc.localDescription });
          (pc as RTCPeerConnection & { __markAnswerReady?: () => void }).__markAnswerReady?.();
          if (callIdRef.current) void setCallActive(callIdRef.current).catch(() => undefined);
          setStatus((s) => (s === "calling" || s === "incoming" || s === "connected" ? "connected" : s));
        } catch {}
        return;
      }

      if (payload.kind === "answer") {
        if (!payload.sdp) return;
        const pc = pcsRef.current.get(from);
        if (!pc) return;
        try {
          // Duplicate answer (we resend offers until one lands) — skip the SDP,
          // but still drain ICE and re-check our senders
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          }
          answeredRef.current.add(from);
          ensureSenders(from);
          await drainIce(from);
          (pc as RTCPeerConnection & { __markAnswerReady?: () => void }).__markAnswerReady?.();
          if (callIdRef.current) void setCallActive(callIdRef.current).catch(() => undefined);
          setStatus((s) => (s === "calling" || s === "incoming" || s === "connected" ? "connected" : s));
        } catch {}
      }
    },
    [createPeer, drainIce, ensureSenders, makeOffer, send, sendStoredIce]
  );

  const localCleanup = useCallback(() => {
    const endedId = callIdRef.current;
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
    if (endedId) {
      stopInviteRing(endedId);
      // Only stop our own room announce — do NOT close the room for others still inside
      stopRoomAnnounce(endedId, false);
    }
    callIdRef.current = null;
    remoteRef.current.clear();
    pendingIceRef.current.clear();
    makingOfferRef.current.clear();
    sharersRef.current.clear();
    publishRemotes();
    setLocalStream(null);
    statusRef.current = "idle";
    setStatus("idle");
    setIncoming(null);
    setIncomingVideo(false);
    setCurrentCallId(null);
    setWithVideo(false);
    setSharingScreen(false);
    setPeerSharingScreen(false);
    setMicOn(true);
    setCamOn(true);
    setOutgoing(false);
    setPeerRingtone("");
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
        if (p.callId === callIdRef.current && p.from !== userIdRef.current) {
          const ended = p.callId;
          localCleanup();
          if (ended && userIdRef.current) broadcastInviteCancel(ended, userIdRef.current);
        }
      });

      // Peer accepted — stop our invite ring for them (kills "another call" reopen)
      // + immediately (re)send offer & ICE: our first broadcast likely fired
      // before they subscribed to this channel and was dropped
      ch.on("broadcast", { event: "joined" }, ({ payload }) => {
        const p = payload as { from?: string; callId?: string };
        if (p?.from && p.from !== userIdRef.current && p.callId) {
          removeInvitee(p.callId, p.from);
          discoverPeer(p.from);
          sendStoredIce(p.from);
        }
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
        seen.forEach((id) => discoverPeer(id));
      });

      callChannelRef.current = ch;

      // Only send offers after the channel is SUBSCRIBED — otherwise broadcast is dropped
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
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
    [closePeer, discoverPeer, handleSig, localCleanup, sendStoredIce]
  );

  const loadOpenCalls = useCallback(
    async (silentLeave: boolean) => {
      if (!userId) return;
      const rows = await fetchMyOpenCalls(userId);
      if (!rows) return; // network/RLS error — never kick an active call on fetch failure
      const openIds = new Set(rows.map((r) => r.call.id));

      // Missing table → rows=[] — must NOT kick active call or clear broadcast incoming
      if (rows.length && callIdRef.current && !openIds.has(callIdRef.current) && silentLeave) {
        const gone = callIdRef.current;
        localCleanup();
        if (userId) broadcastInviteCancel(gone, userId);
        return;
      }

      const inv = rows.find(
        (r) =>
          r.member.state === "invited" &&
          r.call.created_by !== userId &&
          r.call.id !== callIdRef.current
      );
      const joinable = rows.filter((r) => r.call.id !== callIdRef.current).map((r) => r.call);
      if (joinable.length) setJoinableCalls(joinable);

      // Broadcast invite owns incoming state — DB must never clear it or reopen declined
      if (inv && statusRef.current === "idle") {
        if (declinedCallIdsRef.current.has(inv.call.id)) return;
        setIncoming({
          callId: inv.call.id,
          callerId: inv.call.created_by,
          withVideo: inv.call.with_video,
          ringtone: inv.call.ringtone,
        });
        setIncomingVideo(inv.call.with_video);
        setCallerRingtone(inv.call.ringtone);
        statusRef.current = "incoming";
        setStatus("incoming");
        announceRingBack(inv.call.id, inv.call.created_by);
      }
    },
    [announceRingBack, localCleanup, userId]
  );

  // realtime invites (broadcast bus + personal inbox) + call status + initial load
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

    const handleInvite = (inv: CallInvite) => {
      if (inv.to && inv.to !== userId) return;
      if (inv.callerId === userId) return;
      if (inv.callId === callIdRef.current) return;
      // This user already pressed Decline on this call — never reopen the dialog
      if (declinedCallIdsRef.current.has(inv.callId)) return;
      if (isInviteDeclined(inv.callId, userId)) return;

      // Keep Join button alive even when DB table is missing
      setJoinableCalls((prev) => {
        if (prev.some((c) => c.id === inv.callId)) {
          return prev.map((c) => (c.id === inv.callId ? { ...c, with_video: inv.withVideo } : c));
        }
        return [
          ...prev,
          {
            id: inv.callId,
            kind: inv.kind,
            peer_id: inv.peerId,
            created_by: inv.callerId,
            with_video: inv.withVideo,
            ringtone: inv.ringtone,
            status: "active",
            created_at: new Date().toISOString(),
            ended_at: null,
          } satisfies CallRow,
        ];
      });

      // Two people calling each other at once — yield to the winner (no dual-call deadlock)
      if (statusRef.current === "calling" || statusRef.current === "connected") {
        const myCall = callIdRef.current;
        if (myCall && inv.callId !== myCall) {
          const myCreator = lastCallRowRef.current?.created_by ?? userId;
          if (shouldYieldCall(myCreator, myCall, inv.callerId, inv.callId)) {
            void setMemberState(myCall, userId, "left").catch(() => undefined);
            stopInviteRing(myCall);
            stopRoomAnnounce(myCall, true);
            broadcastInviteCancel(myCall, userId);
            localCleanup();
            peerIdRef.current = inv.callerId;
            lastCallRowRef.current = {
              id: inv.callId,
              kind: inv.kind,
              peer_id: inv.peerId,
              created_by: inv.callerId,
              with_video: inv.withVideo,
              ringtone: inv.ringtone,
              status: "active",
              created_at: new Date().toISOString(),
              ended_at: null,
            };
            void enterCallRef.current(inv.callId, inv.withVideo).catch(() => undefined);
            return;
          }
          broadcastInviteDeclined(inv.callId, userId, inv.callerId);
        }
        return;
      }
      if (statusRef.current === "incoming" && incomingRef.current?.callId === inv.callId) return;
      // Already showing a different incoming call — don't thrash the UI
      if (statusRef.current === "incoming" && incomingRef.current) return;
      setIncoming({
        callId: inv.callId,
        callerId: inv.callerId,
        withVideo: inv.withVideo,
        ringtone: inv.ringtone,
      });
      setIncomingVideo(inv.withVideo);
      setCallerRingtone(inv.ringtone);
      statusRef.current = "incoming";
      setStatus("incoming");
      announceRingBack(inv.callId, inv.callerId);
    };

    const handleCancel = (c: { callId: string }) => {
      setJoinableCalls((prev) => prev.filter((row) => row.id !== c.callId));
      if (incomingRef.current?.callId === c.callId) {
        stopRingtone();
        setIncoming(null);
        setIncomingVideo(false);
        if (statusRef.current === "incoming") {
          statusRef.current = "idle";
          setStatus("idle");
        }
      }
    };

    const handleDeclined = () => {
      // We are the caller — someone declined; nothing to reopen on our side
    };

    // Callee replied with THEIR ringtone — the caller plays that one
    const handleRingBack = (p: { callId?: string; to?: string; ringtone?: string }) => {
      if (!p?.callId || !p.ringtone || p.to !== userIdRef.current) return;
      if (callIdRef.current && callIdRef.current !== p.callId) return;
      setPeerRingtone(p.ringtone);
    };

    const handleRoomOpen = (row: CallRow) => {
      if (!row?.id || row.id === callIdRef.current || row.created_by === userId) return;
      setJoinableCalls((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]));
    };

    const handleRoomClose = (p: { callId: string }) => {
      setJoinableCalls((prev) => prev.filter((c) => c.id !== p.callId));
      if (incomingRef.current?.callId === p.callId) {
        stopRingtone();
        setIncoming(null);
        setIncomingVideo(false);
        if (statusRef.current === "incoming") {
          statusRef.current = "idle";
          setStatus("idle");
        }
      }
    };

    const offInvite = subscribeCallInvites(handleInvite);
    const offCancel = subscribeInviteCancels(handleCancel);
    const offDeclined = subscribeInviteDeclines(handleDeclined);
    const offRingBack = subscribeRingBacks(handleRingBack);
    const offRoomOpen = subscribeRoomOpens(handleRoomOpen);
    const offRoomClose = subscribeRoomCloses(handleRoomClose);
    const offInbox = ensurePersonalInviteInbox(userId, handleInvite, handleCancel, handleDeclined);

    void loadOpenCalls(true);
    return () => {
      offInvite();
      offCancel();
      offDeclined();
      offRingBack();
      offRoomOpen();
      offRoomClose();
      offInbox();
      supabase.removeChannel(ch);
    };
  }, [announceRingBack, loadOpenCalls, userId]);

  const enteringRef = useRef(false);

  const enterCall = useCallback(
    async (callId: string, video: boolean) => {
      if (!userId || enteringRef.current) return;
      enteringRef.current = true;
      try {
        if (callIdRef.current && callIdRef.current !== callId) {
          const prev = callIdRef.current;
          void setMemberState(prev, userId, "left")
            .then(() => countJoinedMembers(prev))
            .then((n) => {
              if (n === 0) return endCallRoom(prev);
              return undefined;
            })
            .catch(() => undefined);
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
        if (at) {
          at.enabled = true;
          micTrackRef.current = at;
        }
        if (vt) {
          vt.enabled = true;
          camTrackRef.current = vt;
        }

        // UI first — never block the call on database round-trips
        callIdRef.current = callId;
        setCurrentCallId(callId);
        setWithVideo(video);
        // Are WE the one who placed this call? (we then hear the callee's ringtone)
        setOutgoing(
          Boolean(
            lastCallRowRef.current &&
              lastCallRowRef.current.id === callId &&
              lastCallRowRef.current.created_by === userId
          )
        );
        withVideoRef.current = video;
        callStartedAtRef.current = Date.now();
        setIncoming(null);
        setIncomingVideo(false);
        statusRef.current = "calling";
        setStatus("calling");
        setSharingScreen(false);
        setPeerSharingScreen(false);
        sharersRef.current.clear();
        declinedCallIdsRef.current.delete(callId);

        // Network path starts immediately; DB is best-effort (table may be missing)
        const joined = joinChannel(callId);
        void setMemberState(callId, userId, "joined").catch(() => undefined);
        void setCallActive(callId).catch(() => undefined);
        await joined;
        try {
          callChannelRef.current?.send({
            type: "broadcast",
            event: "joined",
            payload: { from: userId, callId },
          });
        } catch {}
        // Kick discovery right away — don't wait for DB round-trips
        const chNow = callChannelRef.current;
        if (chNow) {
          const st = chNow.presenceState() as Record<string, { userId?: string }[]>;
          for (const key of Object.keys(st)) {
            for (const e of st[key] ?? []) {
              if (e?.userId && e.userId !== userId) discoverPeer(e.userId);
            }
          }
        }
        // DM: nudge the known peer immediately (presence may not list them yet) —
        // this is what makes "the other side joined" connect fast
        if (peerIdRef.current) discoverPeer(peerIdRef.current);
        void logCallEvent(`${video ? "Video" : "Audio"} call started`, peerIdRef.current);

        const announceRow: CallRow =
          lastCallRowRef.current?.id === callId
            ? lastCallRowRef.current
            : {
                id: callId,
                kind: "dm",
                peer_id: peerIdRef.current,
                created_by: userId,
                with_video: video,
                ringtone: getSavedRingtone(),
                status: "active",
                created_at: new Date().toISOString(),
                ended_at: null,
              };
        startRoomAnnounce(announceRow);

        void getJoinedPeers(callId, userId)
          .then((peers) => {
            peers.forEach((p) => discoverPeer(p));
          })
          .catch(() => undefined);
        setJoinableCalls((prev) => prev.filter((c) => c.id !== callId));
      } finally {
        enteringRef.current = false;
      }
    },
    [discoverPeer, joinChannel, localCleanup, logCallEvent, userId]
  );

  enterCallRef.current = enterCall;

  const startDmCall = useCallback(
    async (peerId: string, video: boolean) => {
      if (!userId || !peerId || peerId === userId) return;
      if (statusRef.current !== "idle") {
        throw new Error("You are already in a call. Hang up first.");
      }
      peerIdRef.current = peerId;
      const call = await createCall({
        createdBy: userId,
        kind: "dm",
        peerId,
        inviteeIds: [peerId],
        withVideo: video,
      });
      if (!call) throw new Error("Could not create the call room — server error. Please try again.");
      // Web Push to the other side — rings even when their tab is closed/backgrounded
      void pushNotify(
        peerId,
        "Whisperwind",
        `Incoming ${video ? "video" : "audio"} call — answer now`,
        `call-${call.id}`,
        [500, 200, 500, 200, 700]
      );
      lastCallRowRef.current = call;
      await enterCall(call.id, video);
    },
    [enterCall, userId]
  );

  const startGroupCall = useCallback(
    async (inviteeIds: string[], video: boolean) => {
      if (!userId) return;
      if (statusRef.current !== "idle") {
        throw new Error("You are already in a call. Hang up first.");
      }
      if (!inviteeIds.length) {
        throw new Error("Add at least one friend before starting a group call.");
      }
      peerIdRef.current = null;
      const call = await createCall({
        createdBy: userId,
        kind: "group",
        peerId: null,
        inviteeIds,
        withVideo: video,
      });
      if (!call) throw new Error("Could not create the call room — server error. Please try again.");
      // Ring every invitee even when their Phone tab is closed/backgrounded
      for (const id of inviteeIds) {
        void pushNotify(
          id,
          "Whisperwind",
          `You are invited to a ${video ? "video" : "audio"} call — join now`,
          `call-${call.id}`,
          [500, 200, 500, 200, 700]
        );
      }
      lastCallRowRef.current = call;
      await enterCall(call.id, video);
    },
    [enterCall, userId]
  );

  const accept = useCallback(() => {
    if (!incoming) return Promise.resolve();
    if (enteringRef.current || statusRef.current !== "incoming") return Promise.resolve();
    peerIdRef.current = incoming.callerId;
    // Close the dialog + stop ringtone immediately so the button feels instant
    const id = incoming.callId;
    setIncoming(null);
    setIncomingVideo(false);
    statusRef.current = "calling";
    setStatus("calling");
    stopRingtone();
    // We are the CALLEE here — refresh our row so enterCall knows outgoing=false
    lastCallRowRef.current = joinableCalls.find((c) => c.id === id) ?? null;
    return enterCall(id, incoming.withVideo);
  }, [enterCall, incoming, joinableCalls]);

  const decline = useCallback(async () => {
    if (!userId || !incoming) return;
    const id = incoming.callId;
    const caller = incoming.callerId;

    // UI first — never wait on the network (this was hanging the Decline button)
    declinedCallIdsRef.current.add(id);
    setIncoming(null);
    setIncomingVideo(false);
    setStatus("idle");
    stopRingtone();
    try {
      navigator.vibrate?.(0);
    } catch {}

    peerIdRef.current = caller;
    void logCallEvent("Missed call", caller);
    broadcastInviteDeclined(id, userId, caller);
    void setMemberState(id, userId, "declined").catch(() => undefined);
    void loadOpenCalls(true);
  }, [incoming, loadOpenCalls, logCallEvent, userId]);

  const joinCall = useCallback(
    async (callId: string) => {
      const row = joinableCalls.find((c) => c.id === callId);
      lastCallRowRef.current = row ?? null;
      if (row) peerIdRef.current = row.created_by === userId ? row.peer_id : row.created_by;
      await enterCall(callId, row?.with_video ?? false);
    },
    [enterCall, joinableCalls, userId]
  );

  // Hangup leaves YOUR seat only — room stays open so others/you can Join later
  const hangup = useCallback(async () => {
    const me = userIdRef.current;
    const callId = callIdRef.current;
    const startedAt = callStartedAtRef.current;
    stopRingtone();
    if (me && callId) {
      void setMemberState(callId, me, "left").catch(() => undefined);
      // Missing call_members table returns 0 — also trust live remote streams
      const remoteCount = remoteRef.current.size;
      void countJoinedMembers(callId)
        .then((dbN) => {
          const others = Math.max(remoteCount, Math.max(0, dbN - 1));
          if (others !== 0) return undefined;
          return endCallRoom(callId).then(() => {
            stopInviteRing(callId);
            stopRoomAnnounce(callId, true);
            broadcastInviteCancel(callId, me);
          });
        })
        .catch(() => undefined);
      void logCallEnd(callId, startedAt, withVideoRef.current);
    }
    localCleanup();
    void loadOpenCalls(true);
  }, [loadOpenCalls, localCleanup, logCallEnd]);

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
    if (!localRef.current) return;
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

  // Heal signaling: re-trickle ICE + re-discover peers until media actually flows.
  // discoverPeer/makeOffer are guarded — a healthy link is never renegotiated.
  useEffect(() => {
    if (status !== "calling" && status !== "connected") return;
    if (!userId) return;
    const t = window.setInterval(() => {
      const callId = callIdRef.current;
      if (!callId || !localRef.current) return;
      for (const [id, pc] of pcsRef.current) {
        if (pc.connectionState === "connected") continue;
        // Answer broadcast may have been dropped — resend our last answer so the
        // offerer can apply it. Without this, both sides hang in offer state forever.
        const ld = pc.localDescription;
        if (!ld || !pc.signalingState) continue;
        if (ld.type === "answer" && pc.signalingState === "have-remote-offer") {
          send({ to: id, kind: "answer", sdp: ld });
        }
        if (ld.type === "offer" && pc.signalingState === "have-local-offer") {
          const last = lastOfferSentRef.current.get(id) ?? 0;
          if (Date.now() - last > 1200) {
            lastOfferSentRef.current.set(id, Date.now());
            send({ to: id, kind: "offer", sdp: ld });
          }
          sendStoredIce(id);
        } else {
          sendStoredIce(id);
        }
      }
      // Stop only when real MEDIA arrived (an empty placeholder stream from
      // createPeer must not blind the heal loop)
      let hasMedia = false;
      remoteRef.current.forEach((s) => {
        if (s.getTracks().length) hasMedia = true;
      });
      if (hasMedia) return;
      void getJoinedPeers(callId, userId)
        .then((peers) => peers.forEach((p) => discoverPeer(p)))
        .catch(() => undefined);
      const ch = callChannelRef.current;
      if (ch) {
        const state = ch.presenceState() as Record<string, { userId?: string }[]>;
        for (const key of Object.keys(state)) {
          for (const e of state[key] ?? []) {
            if (e?.userId && e.userId !== userId) discoverPeer(e.userId);
          }
        }
      }
    }, 900);
    return () => window.clearInterval(t);
  }, [status, userId, discoverPeer, send, sendStoredIce]);

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
    outgoing,
    peerRingtone,
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
