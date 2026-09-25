import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type CallRow,
  createCall,
  endCallRoom,
  fetchMyOpenCalls,
  setCallActive,
  startInviteRing,
  stopInviteRing,
  startRoomAnnounce,
  stopRoomAnnounce,
  subscribeCallInvites,
  subscribeInviteCancels,
  subscribeRoomOpens,
  subscribeRoomCloses,
  broadcastRingBack,
  broadcastInviteDeclined,
} from "./calls";
import { startRingtone, stopRingtone, unlockSound, getSavedRingtone } from "./sounds";
import { pushNotify } from "./push";
import { requestMediaPermissions } from "./permissions";

export type CallStatus = "idle" | "calling" | "incoming" | "connected";

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

export function useCall(userId: string | null) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [withVideo, setWithVideo] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [sharingScreen, setSharingScreen] = useState(false);
  const [peerSharingScreen, setPeerSharingScreen] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
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
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const channelRef = useRef<any>(null);
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
    remoteStreamsRef.current = {};
    pendingCandidatesRef.current.clear();
    stopInviteRing();
    stopRoomAnnounce();

    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch {}
      channelRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams({});
    setSharingScreen(false);
    setPeerSharingScreen(false);
    setMicOn(true);
    setCamOn(true);
    setIncoming(null);
    setIncomingVideo(false);
    setCallerRingtone(undefined);
    setPeerRingtone(undefined);
    enteringRef.current = false;
    stopRingtone();
  }, []);

  const acquireMedia = useCallback(async (video: boolean): Promise<MediaStream> => {
    unlockSound();
    const res = await requestMediaPermissions({ audio: true, video });
    if (!res.stream) throw new Error(res.error || "Media access failed");
    localStreamRef.current = res.stream;
    setLocalStream(res.stream);
    setMicOn(true);
    setCamOn(video);
    return res.stream;
  }, []);

  const makeOffer = useCallback(async (targetPeerId: string, pc: RTCPeerConnection) => {
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
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
      if (peerMapRef.current.has(targetPeerId)) return peerMapRef.current.get(targetPeerId)!;
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 1,
        bundlePolicy: "max-bundle",
      });
      peerMapRef.current.set(targetPeerId, pc);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
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
        remoteStreamsRef.current = {
          ...remoteStreamsRef.current,
          [targetPeerId]: currentStream,
        };
        setRemoteStreams({ ...remoteStreamsRef.current });

        if (statusRef.current !== "connected") {
          statusRef.current = "connected";
          setStatus("connected");
          stopRingtone();
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected" && statusRef.current !== "connected") {
          statusRef.current = "connected";
          setStatus("connected");
          stopRingtone();
        } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          const next = { ...remoteStreamsRef.current };
          delete next[targetPeerId];
          remoteStreamsRef.current = next;
          setRemoteStreams(next);
        }
      };

      if (isInitiator) void makeOffer(targetPeerId, pc);
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
      if (!pc) pc = createPeer(from, false);
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
        console.warn("Signaling error:", err);
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
            if (payload?.userId && payload.userId !== userId) createPeer(payload.userId, true);
          })
          .on("broadcast", { event: "screen" }, ({ payload }) => {
            if (payload?.userId && payload.userId !== userId) {
              setPeerSharingScreen(!!payload.screenOn);
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
              const next = { ...remoteStreamsRef.current };
              delete next[payload.userId];
              remoteStreamsRef.current = next;
              setRemoteStreams(next);
            }
          })
          .subscribe(async (s) => {
            if (s === "SUBSCRIBED") {
              ch.send({ type: "broadcast", event: "joined", payload: { userId } });
            }
          });

        channelRef.current = ch;
        void setCallActive(targetCallId);
      } finally {
        enteringRef.current = false;
      }
    },
    [acquireMedia, handleSig, createPeer, userId]
  );

  const startDmCall = useCallback(
    async (peerId: string, video: boolean) => {
      if (!userId || !peerId || peerId === userId) return;
      if (statusRef.current !== "idle") throw new Error("You are already in a call. Hang up first.");
      isCallerRef.current = true;
      const call = await createCall({
        createdBy: userId,
        kind: "dm",
        peerId,
        inviteeIds: [peerId],
        withVideo: video,
      });
      if (!call) throw new Error("Could not create call room.");
      void pushNotify(
        peerId,
        "Zyraxon",
        `Incoming ${video ? "video" : "audio"} call`,
        `call-${call.id}`,
        [500, 200, 500]
      );
      await enterCall(call.id, video);
    },
    [enterCall, userId]
  );

  const startGroupCall = useCallback(
    async (inviteeIds: string[], video: boolean) => {
      if (!userId) return;
      if (statusRef.current !== "idle") throw new Error("You are already in a call. Hang up first.");
      isCallerRef.current = true;
      const call = await createCall({
        createdBy: userId,
        kind: "group",
        peerId: null,
        inviteeIds: inviteeIds.length ? inviteeIds : [userId],
        withVideo: video,
      });
      if (!call) throw new Error("Could not create group call room.");
      await enterCall(call.id, video);
    },
    [enterCall, userId]
  );

  const joinCall = useCallback(
    async (cId: string) => {
      isCallerRef.current = false;
      await enterCall(cId, false);
    },
    [enterCall]
  );

  const accept = useCallback(async () => {
    if (!incomingRef.current) return;
    const { callId: cId, withVideo: v, callerId } = incomingRef.current;
    isCallerRef.current = false;
    stopRingtone();
    broadcastRingBack(cId, callerId, getSavedRingtone());
    await enterCall(cId, v);
  }, [enterCall]);

  const decline = useCallback(() => {
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
    if (channelRef.current) {
      try {
        channelRef.current.send({
          type: "broadcast",
          event: "leave",
          payload: { userId: userIdRef.current },
        });
      } catch {}
    }
    if (curCallId) {
      void endCallRoom(curCallId);
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
      setMicOn(audioTrack.enabled);
    }
  }, []);

  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCamOn(videoTrack.enabled);
    }
  }, []);

  const shareScreen = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Your browser does not support screen sharing.");
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always", frameRate: { ideal: 30, max: 60 } } as any,
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrackRef.current = screenTrack;

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
      setSharingScreen(true);
      channelRef.current?.send({
        type: "broadcast",
        event: "screen",
        payload: { userId: userIdRef.current, screenOn: true },
      });
      screenTrack.onended = () => {
        void stopScreenShare();
      };
    } catch (err) {
      console.warn("Screen share cancelled:", err);
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
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
    setSharingScreen(false);
    channelRef.current?.send({
      type: "broadcast",
      event: "screen",
      payload: { userId: userIdRef.current, screenOn: false },
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const unsubInvites = subscribeCallInvites((inv) => {
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
    });

    const unsubCancels = subscribeInviteCancels((c) => {
      if (incomingRef.current?.callId === c.callId) {
        stopRingtone();
        setIncoming(null);
        setStatus("idle");
        statusRef.current = "idle";
      }
    });

    const unsubRooms = subscribeRoomOpens((row) => {
      if (row.id !== callIdRef.current && row.created_by !== userId) {
        setJoinableCalls((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]));
      }
    });

    const unsubCloses = subscribeRoomCloses(({ callId: cId }) => {
      if (cId) setJoinableCalls((prev) => prev.filter((r) => r.id !== cId));
    });

    void fetchMyOpenCalls(userId).then((res) => {
      if (res) setJoinableCalls(res.map((r) => r.call));
    });

    return () => {
      unsubInvites();
      unsubCancels();
      unsubRooms();
      unsubCloses();
    };
  }, [userId]);

  return {
    status,
    isCaller: isCallerRef.current,
    outgoing: status === "calling" && isCallerRef.current,
    withVideo,
    localStream,
    remoteStreams,
    callId,
    incoming,
    incomingVideo,
    callerRingtone,
    peerRingtone,
    joinableCalls,
    micOn,
    camOn,
    sharingScreen,
    peerSharingScreen,
    startDmCall,
    startGroupCall,
    joinCall,
    accept,
    decline,
    acceptCall: accept,
    declineCall: decline,
    hangup,
    toggleMic,
    toggleCam,
    shareScreen,
    stopScreenShare,
  };
}
