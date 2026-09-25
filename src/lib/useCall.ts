// ==========================================
// ফাইল ২: src/lib/useCall.ts (সম্পূর্ণ নির্ভুল কোড)
// ==========================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CallRow,
  createCall,
  endCallRow,
  fetchCallRow,
  fetchMyOpenCalls,
  leaveCallRow,
  setCallActive,
  startInviteRing,
  startRoomAnnounce,
  subscribeToInvites,
  subscribeToRooms,
  announceRingBack,
  broadcastInviteDeclined,
} from "./calls";
import {
  startRingtone,
  stopRingtone,
  playCallConnectSound,
  playCallEndSound,
  unlockSound,
  getSavedRingtone,
} from "./sounds";
import { pushNotify } from "./push";
import { requestMediaPermissions } from "./permissions";

export type CallStatus = "idle" | "calling" | "incoming" | "connected";

export interface RemoteParticipant {
  userId: string;
  stream: MediaStream;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
}

export interface UseCallReturn {
  status: CallStatus;
  isCaller: boolean;
  withVideo: boolean;
  localStream: MediaStream | null;
  remoteParticipants: RemoteParticipant[];
  screenSharing: boolean;
  micMuted: boolean;
  camOff: boolean;
  callId: string | null;
  incoming: { callId: string; callerId: string; withVideo: boolean; ringtone?: string } | null;
  joinableCalls: CallRow[];
  callerRingtone?: string;
  peerRingtone?: string;
  outgoing: boolean;
  remoteAudioStreams: { peerId: string; stream: MediaStream }[];

  startDmCall: (peerId: string, video: boolean) => Promise<void>;
  startGroupCall: (inviteeIds: string[], video: boolean) => Promise<void>;
  joinCall: (callId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  shareScreen: () => Promise<void>;
  stopScreenShare: () => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun.services.mozilla.com"] },
  { urls: ["stun:global.stun.twilio.com:3478"] },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelay",
    credential: "openrelay",
  },
];

export function useCall(userId: string | null): UseCallReturn {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [withVideo, setWithVideo] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [screenSharing, setScreenSharing] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<{
    callId: string;
    callerId: string;
    withVideo: boolean;
    ringtone?: string;
  } | null>(null);
  const [incomingVideo, setIncomingVideo] = useState(false);
  const [callerRingtone, setCallerRingtone] = useState<string | undefined>(undefined);
  const [peerRingtone, setPeerRingtone] = useState<string | undefined>(undefined);
  const [joinableCalls, setJoinableCalls] = useState<CallRow[]>([]);

  const isCallerRef = useRef(false);
  const callIdRef = useRef<string | null>(null);
  const statusRef = useRef<CallStatus>("idle");
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteMapRef = useRef<Map<string, RemoteParticipant>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const channelRef = useRef<any>(null);
  const ringStopperRef = useRef<(() => void) | null>(null);
  const announceStopperRef = useRef<(() => void) | null>(null);
  const lastCallRowRef = useRef<CallRow | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const incomingRef = useRef(incoming);
  const userIdRef = useRef(userId);
  const enteringRef = useRef(false);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  const localCleanup = useCallback(() => {
    if (screenTrackRef.current) {
      try {
        screenTrackRef.current.stop();
      } catch {}
      screenTrackRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      localStreamRef.current = null;
    }
    for (const [, pc] of peerMapRef.current) {
      try {
        pc.close();
      } catch {}
    }
    peerMapRef.current.clear();
    remoteMapRef.current.clear();
    pendingCandidatesRef.current.clear();

    if (ringStopperRef.current) {
      ringStopperRef.current();
      ringStopperRef.current = null;
    }
    if (announceStopperRef.current) {
      announceStopperRef.current();
      announceStopperRef.current = null;
    }
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch {}
      channelRef.current = null;
    }

    setLocalStream(null);
    setRemoteParticipants([]);
    setScreenSharing(false);
    setMicMuted(false);
    setCamOff(false);
    setIncoming(null);
    setIncomingVideo(false);
    setCallerRingtone(undefined);
    setPeerRingtone(undefined);
    lastCallRowRef.current = null;
    peerIdRef.current = null;
    enteringRef.current = false;
    stopRingtone();
  }, []);

  const acquireMedia = useCallback(
    async (video: boolean): Promise<MediaStream> => {
      unlockSound();
      const res = await requestMediaPermissions({ audio: true, video });
      if (!res.stream) {
        throw new Error(res.error || "Media access failed");
      }
      localStreamRef.current = res.stream;
      setLocalStream(res.stream);
      return res.stream;
    },
    []
  );

  const makeOffer = useCallback(async (targetPeerId: string, pc: RTCPeerConnection) => {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      channelRef.current?.send({
        type: "broadcast",
        event: "sig",
        payload: { to: targetPeerId, from: userIdRef.current, type: "offer", sdp: offer.sdp },
      });
    } catch (err) {
      console.warn("Offer creation failed:", err);
    }
  }, []);

  const createPeer = useCallback(
    (targetPeerId: string, isInitiator: boolean) => {
      if (peerMapRef.current.has(targetPeerId)) {
        return peerMapRef.current.get(targetPeerId)!;
      }

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 1,
        bundlePolicy: "max-bundle",
      });

      peerMapRef.current.set(targetPeerId, pc);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }
      }

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        channelRef.current?.send({
          type: "broadcast",
          event: "sig",
          payload: {
            to: targetPeerId,
            from: userIdRef.current,
            type: "candidate",
            candidate: e.candidate.toJSON(),
          },
        });
      };

      pc.ontrack = (e) => {
        const [incomingStream] = e.streams;
        const currentStream = incomingStream || new MediaStream([e.track]);

        remoteMapRef.current.set(targetPeerId, {
          userId: targetPeerId,
          stream: currentStream,
          micOn: true,
          camOn: currentStream.getVideoTracks().length > 0,
          screenOn: false,
        });
        setRemoteParticipants(Array.from(remoteMapRef.current.values()));

        if (statusRef.current !== "connected") {
          statusRef.current = "connected";
          setStatus("connected");
          playCallConnectSound();
          stopRingtone();
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          if (statusRef.current !== "connected") {
            statusRef.current = "connected";
            setStatus("connected");
            playCallConnectSound();
            stopRingtone();
          }
        } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          remoteMapRef.current.delete(targetPeerId);
          setRemoteParticipants(Array.from(remoteMapRef.current.values()));
        }
      };

      if (isInitiator) {
        void makeOffer(targetPeerId, pc);
      }

      return pc;
    },
    [makeOffer]
  );

  const handleSig = useCallback(
    async (payload: any) => {
      if (!payload || payload.to !== userIdRef.current) return;
      const from = payload.from;
      if (!from) return;

      let pc = peerMapRef.current.get(from);
      if (!pc) {
        pc = createPeer(from, false);
      }

      try {
        if (payload.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: payload.sdp }));
          const pending = pendingCandidatesRef.current.get(from) || [];
          for (const cand of pending) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch {}
          }
          pendingCandidatesRef.current.delete(from);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channelRef.current?.send({
            type: "broadcast",
            event: "sig",
            payload: { to: from, from: userIdRef.current, type: "answer", sdp: answer.sdp },
          });
        } else if (payload.type === "answer") {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: payload.sdp }));
            const pending = pendingCandidatesRef.current.get(from) || [];
            for (const cand of pending) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
            pendingCandidatesRef.current.delete(from);
          }
        } else if (payload.type === "candidate" && payload.candidate) {
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch {}
          } else {
            const arr = pendingCandidatesRef.current.get(from) || [];
            arr.push(payload.candidate);
            pendingCandidatesRef.current.set(from, arr);
          }
        }
      } catch (err) {
        console.warn("Signaling dispatch error:", err);
      }
    },
    [createPeer]
  );

  const enterCall = useCallback(
    async (targetCallId: string, video: boolean) => {
      if (!userId || enteringRef.current) return;
      enteringRef.current = true;
      try {
        stopRingtone();
        await acquireMedia(video);

        setCallId(targetCallId);
        setWithVideo(video);
        setStatus("calling");
        statusRef.current = "calling";

        if (channelRef.current) {
          try {
            supabase.removeChannel(channelRef.current);
          } catch {}
        }

        const ch = supabase.channel(`call:${targetCallId}`, {
          config: { broadcast: { self: false } },
        });

        ch.on("broadcast", { event: "sig" }, ({ payload }) => {
          void handleSig(payload);
        })
          .on("broadcast", { event: "joined" }, ({ payload }) => {
            if (payload?.userId && payload.userId !== userId) {
              createPeer(payload.userId, true);
            }
          })
          .on("broadcast", { event: "screen" }, ({ payload }) => {
            if (payload?.userId && remoteMapRef.current.has(payload.userId)) {
              const prev = remoteMapRef.current.get(payload.userId)!;
              remoteMapRef.current.set(payload.userId, { ...prev, screenOn: !!payload.screenOn });
              setRemoteParticipants(Array.from(remoteMapRef.current.values()));
            }
          })
          .on("broadcast", { event: "leave" }, ({ payload }) => {
            if (payload?.userId) {
              const existingPc = peerMapRef.current.get(payload.userId);
              if (existingPc) {
                try {
                  existingPc.close();
                } catch {}
                peerMapRef.current.delete(payload.userId);
              }
              remoteMapRef.current.delete(payload.userId);
              setRemoteParticipants(Array.from(remoteMapRef.current.values()));
            }
          })
          .subscribe(async (s) => {
            if (s === "SUBSCRIBED") {
              ch.send({
                type: "broadcast",
                event: "joined",
                payload: { userId },
              });
            }
          });

        channelRef.current = ch;
        void setCallActive(targetCallId);
        announceStopperRef.current = startRoomAnnounce(targetCallId);
      } finally {
        enteringRef.current = false;
      }
    },
    [acquireMedia, handleSig, createPeer, userId]
  );

  const startDmCall = useCallback(
    async (peerId: string, video: boolean) => {
      if (!userId || !peerId || peerId === userId) return;
      if (statusRef.current !== "idle") {
        throw new Error("You are already in a call. Hang up first.");
      }
      isCallerRef.current = true;
      peerIdRef.current = peerId;

      const call = await createCall({
        createdBy: userId,
        kind: "dm",
        peerId,
        inviteeIds: [peerId],
        withVideo: video,
      });
      if (!call) throw new Error("Could not create call room.");

      ringStopperRef.current = startInviteRing(call.id, [peerId], video, getSavedRingtone() || undefined);
      void pushNotify(
        peerId,
        "Zyraxon",
        `Incoming ${video ? "video" : "audio"} call — answer now`,
        `call-${call.id}`,
        [500, 200, 500, 200, 700]
      );

      lastCallRowRef.current = call;
      await enterCall(call.id, video);
    },
    [enterCall, userId]
  );

  // কোনো ফ্রেন্ড অ্যাড করা না থাকলেও সরাসরি ওপেন গ্রুপ কল শুরু হবে
  const startGroupCall = useCallback(
    async (inviteeIds: string[], video: boolean) => {
      if (!userId) return;
      if (statusRef.current !== "idle") {
        throw new Error("You are already in a call. Hang up first.");
      }
      isCallerRef.current = true;
      peerIdRef.current = null;

      const call = await createCall({
        createdBy: userId,
        kind: "group",
        peerId: null,
        inviteeIds: inviteeIds.length ? inviteeIds : [userId],
        withVideo: video,
      });
      if (!call) throw new Error("Could not create group call room.");

      if (inviteeIds.length > 0) {
        ringStopperRef.current = startInviteRing(call.id, inviteeIds, video, getSavedRingtone() || undefined);
        for (const id of inviteeIds) {
          void pushNotify(id, "Zyraxon AI Space", "Incoming group call", `call-${call.id}`, [500, 200, 500]);
        }
      }

      lastCallRowRef.current = call;
      await enterCall(call.id, video);
    },
    [enterCall, userId]
  );

  const joinCall = useCallback(
    async (cId: string) => {
      isCallerRef.current = false;
      const row = await fetchCallRow(cId);
      await enterCall(cId, row?.with_video ?? false);
    },
    [enterCall]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingRef.current) return;
    const { callId: cId, withVideo: v, callerId } = incomingRef.current;
    isCallerRef.current = false;
    stopRingtone();
    announceRingBack(cId, callerId);
    await enterCall(cId, v);
  }, [enterCall]);

  const declineCall = useCallback(() => {
    if (incomingRef.current && userId) {
      broadcastInviteDeclined(incomingRef.current.callId, userId, incomingRef.current.callerId);
    }
    stopRingtone();
    setIncoming(null);
    setStatus("idle");
    statusRef.current = "idle";
  }, [userId]);

  const hangup = useCallback(() => {
    const curCallId = callIdRef.current;
    playCallEndSound();
    if (channelRef.current) {
      try {
        channelRef.current.send({
          type: "broadcast",
          event: "leave",
          payload: { userId: userIdRef.current },
        });
      } catch {}
    }
    if (curCallId && userIdRef.current) {
      if (isCallerRef.current) {
        void endCallRow(curCallId);
      } else {
        void leaveCallRow(curCallId, userIdRef.current);
      }
    }
    localCleanup();
    setStatus("idle");
    statusRef.current = "idle";
    setCallId(null);
  }, [localCleanup]);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicMuted(!audioTrack.enabled);
    }
  }, []);

  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCamOff(!videoTrack.enabled);
    }
  }, []);

  // নিখুঁত স্ক্রিন শেয়ার — কোনো কালো পর্দা ছাড়াই অন্য প্রান্তে তাৎক্ষণিক লাইভ হবে
  const shareScreen = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Your browser does not support screen sharing.");
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        } as any,
        audio: false,
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrackRef.current = screenTrack;

      // অন্য প্রান্তে সব কানেকশনে ভিডিও ট্র্যাক প্রতিস্থাপন
      for (const [, pc] of peerMapRef.current) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, displayStream);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
        }
      }

      setScreenSharing(true);
      channelRef.current?.send({
        type: "broadcast",
        event: "screen",
        payload: { userId: userIdRef.current, screenOn: true },
      });

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.warn("Screen share cancelled or failed:", err);
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenTrackRef.current) {
      try {
        screenTrackRef.current.stop();
      } catch {}
      screenTrackRef.current = null;
    }

    const originalVideoTrack = localStreamRef.current?.getVideoTracks()[0] || null;
    for (const [, pc] of peerMapRef.current) {
      const senders = pc.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === "video" || s.track === null);
      if (videoSender) {
        void videoSender.replaceTrack(originalVideoTrack);
      }
    }

    setScreenSharing(false);
    channelRef.current?.send({
      type: "broadcast",
      event: "screen",
      payload: { userId: userIdRef.current, screenOn: false },
    });
  }, []);

  // ইনভাইট এবং কল রুম লিসেনার
  useEffect(() => {
    if (!userId) return;
    const unsubInvites = subscribeToInvites(userId, {
      onInvite: (inv) => {
        if (statusRef.current !== "idle") return;
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
        startRingtone(inv.ringtone);
      },
      onCancel: (c) => {
        if (incomingRef.current?.callId === c.callId) {
          stopRingtone();
          setIncoming(null);
          setStatus("idle");
          statusRef.current = "idle";
        }
      },
      onRingBack: (p) => {
        if (p.to === userIdRef.current && p.ringtone) {
          setPeerRingtone(p.ringtone);
          startRingtone(p.ringtone);
        }
      },
      onDeclined: () => {},
    });

    const unsubRooms = subscribeToRooms({
      onRoomOpen: (row) => {
        if (row.id !== callIdRef.current && row.created_by !== userId) {
          setJoinableCalls((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]));
        }
      },
      onRoomClose: (cId) => {
        setJoinableCalls((prev) => prev.filter((r) => r.id !== cId));
      },
    });

    void fetchMyOpenCalls(userId).then(setJoinableCalls);

    return () => {
      unsubInvites();
      unsubRooms();
    };
  }, [userId]);

  const remoteAudioStreams = useMemo(() => {
    return remoteParticipants.map((p) => ({ peerId: p.userId, stream: p.stream }));
  }, [remoteParticipants]);

  return {
    status,
    isCaller: isCallerRef.current,
    withVideo,
    localStream,
    remoteParticipants,
    screenSharing,
    micMuted,
    camOff,
    callId,
    incoming,
    joinableCalls,
    callerRingtone,
    peerRingtone,
    outgoing: status === "calling" && isCallerRef.current,
    remoteAudioStreams,
    startDmCall,
    startGroupCall,
    joinCall,
    acceptCall,
    declineCall,
    hangup,
    toggleMic,
    toggleCam,
    shareScreen,
    stopScreenShare,
  };
}
