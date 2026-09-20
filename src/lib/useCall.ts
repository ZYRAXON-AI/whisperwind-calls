import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
  ],
};

export type CallStatus = "idle" | "calling" | "incoming" | "connected";

export function useCall(userId: string | null) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [withVideo, setWithVideo] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [sharingAudio, setSharingAudio] = useState(false);
  const [peerOnline, setPeerOnline] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const sysAudioRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pendingOffers = useRef<Map<string, RTCSessionDescriptionInit>>(new Map());
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const send = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      channelRef.current?.send({ type: "broadcast", event, payload: { ...payload } });
    },
    [],
  );

  const cleanup = useCallback(() => {
    pcsRef.current.forEach((pc) => {
      pc.getSenders().forEach((s) => s.track?.stop());
      pc.close();
    });
    pcsRef.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.getTracks().forEach((t) => t.stop());
    sysAudioRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    localRef.current = null;
    screenRef.current = null;
    sysAudioRef.current = null;
    camTrackRef.current = null;
    micTrackRef.current = null;
    pendingOffers.current.clear();
    pendingIce.current.clear();
    setLocalStream(null);
    setRemoteStreams(new Map());
    setStatus("idle");
    setSharingScreen(false);
    setSharingAudio(false);
    setMicOn(true);
    setCamOn(true);
    setMinimized(false);
    setIncomingFrom(null);
  }, []);

  const createPeerFor = useCallback(
    (peerId: string) => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE);
      const remote = new MediaStream();
      pcsRef.current.set(peerId, pc);

      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => {
          if (!remote.getTracks().includes(t)) remote.addTrack(t);
        });
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(peerId, new MediaStream(remote.getTracks()));
          return next;
        });
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) send("ice", { from: userId, to: peerId, candidate: e.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          pcsRef.current.delete(peerId);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
          });
        }
      };

      if (localRef.current) {
        localRef.current.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
      }

      return pc;
    },
    [send, userId],
  );

  const getLocal = useCallback(async (video: boolean) => {
    localRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
    });
    localRef.current = stream;
    micTrackRef.current = stream.getAudioTracks()[0] ?? null;
    camTrackRef.current = stream.getVideoTracks()[0] ?? null;
    setLocalStream(stream);
    return stream;
  }, []);

  const joinRoom = useCallback(async (video?: boolean) => {
    if (!userId) return;
    if (!localRef.current) return;
    send("join", { from: userId, video: video ?? withVideo });
    setStatus("calling");
  }, [send, userId, withVideo]);

  const startCall = useCallback(
    async (video: boolean) => {
      if (!userId) return;
      setWithVideo(video);
      await getLocal(video);
      await joinRoom(video);
    },
    [getLocal, joinRoom, userId],
  );

  const accept = useCallback(
    async (peerId: string, video: boolean) => {
      if (!userId) return;
      setWithVideo(video);
      const stream = await getLocal(video);
      const pc = createPeerFor(peerId);
      const offer = pendingOffers.current.get(peerId);
      if (offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        pendingOffers.current.delete(peerId);
        const candidates = pendingIce.current.get(peerId) ?? [];
        for (const c of candidates) await pc.addIceCandidate(c).catch(() => {});
        pendingIce.current.delete(peerId);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send("answer", { from: userId, to: peerId, sdp: answer });
      setIncomingFrom(null);
      setStatus("connected");
    },
    [createPeerFor, getLocal, send, userId],
  );

  const hangup = useCallback(() => {
    send("hangup", { from: userId });
    cleanup();
  }, [cleanup, send, userId]);

  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
  }, []);

  const stopScreenShare = useCallback(async () => {
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    setSharingScreen(false);
    if (camTrackRef.current) {
      for (const [, pc] of pcsRef.current) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(camTrackRef.current).catch(() => {});
      }
    }
  }, []);

  const shareScreen = useCallback(async () => {
    if (pcsRef.current.size === 0) return;
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
    screenRef.current = display;
    const track = display.getVideoTracks()[0];
    if (!track) return;
    track.contentHint = "detail";
    for (const [, pc] of pcsRef.current) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(track).catch(() => {});
        const params = sender.getParameters();
        params.encodings = [{ maxBitrate: 6_000_000, maxFramerate: 60 }];
        await sender.setParameters(params).catch(() => {});
      }
    }
    setSharingScreen(true);
    track.onended = () => void stopScreenShare();
  }, [stopScreenShare]);

  const stopAudioShare = useCallback(async () => {
    sysAudioRef.current?.getTracks().forEach((t) => t.stop());
    sysAudioRef.current = null;
    await audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setSharingAudio(false);
    if (micTrackRef.current) {
      for (const [, pc] of pcsRef.current) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) await sender.replaceTrack(micTrackRef.current).catch(() => {});
      }
    }
  }, []);

  const shareDeviceAudio = useCallback(async () => {
    if (pcsRef.current.size === 0) return;
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const sys = display.getAudioTracks()[0];
    if (!sys) {
      display.getTracks().forEach((t) => t.stop());
      throw new Error("no-audio");
    }
    display.getVideoTracks().forEach((t) => t.stop());
    sysAudioRef.current = new MediaStream([sys]);

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(new MediaStream([sys])).connect(dest);
    if (micTrackRef.current) {
      ctx.createMediaStreamSource(new MediaStream([micTrackRef.current])).connect(dest);
    }
    const mixed = dest.stream.getAudioTracks()[0] ?? null;
    for (const [, pc] of pcsRef.current) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) await sender.replaceTrack(mixed).catch(() => {});
    }
    setSharingAudio(true);
    sys.onended = () => void stopAudioShare();
  }, [stopAudioShare]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("zyraxon-room", {
      config: { broadcast: { self: false }, presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        if (payload.from === userId) return;
        if (payload.to && payload.to !== userId) return;
        const peerId = payload.from as string;
        if (pcsRef.current.has(peerId)) return;
        pendingOffers.current.set(peerId, payload.sdp);
        setWithVideo(Boolean(payload.video));
        setIncomingFrom(peerId);
        setStatus("incoming");
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (payload.from === userId) return;
        if (payload.to && payload.to !== userId) return;
        const peerId = payload.from as string;
        const pc = pcsRef.current.get(peerId);
        if (!pc || pc.signalingState === "stable") return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const candidates = pendingIce.current.get(peerId) ?? [];
        for (const c of candidates) await pc.addIceCandidate(c).catch(() => {});
        pendingIce.current.delete(peerId);
        setStatus("connected");
      })
      .on("broadcast", { event: "ice" }, async ({ payload }) => {
        if (payload.from === userId) return;
        if (payload.to && payload.to !== userId) return;
        const peerId = payload.from as string;
        const pc = pcsRef.current.get(peerId);
        if (!pc || !pc.remoteDescription) {
          const list = pendingIce.current.get(peerId) ?? [];
          list.push(payload.candidate);
          pendingIce.current.set(peerId, list);
          return;
        }
        await pc.addIceCandidate(payload.candidate).catch(() => {});
      })
      .on("broadcast", { event: "join" }, async ({ payload }) => {
        if (payload.from === userId) return;
        const peerId = payload.from as string;
        if (pcsRef.current.has(peerId)) return;
        if (!localRef.current) {
          await getLocal(Boolean(payload.video));
        }
        const pc = createPeerFor(peerId);
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        send("offer", { from: userId, to: peerId, sdp: offer, video: Boolean(payload.video) });
        setStatus("connected");
      })
      .on("broadcast", { event: "hangup" }, ({ payload }) => {
        if (payload.from === userId) return;
        const peerId = payload.from as string;
        const pc = pcsRef.current.get(peerId);
        if (pc) {
          pc.close();
          pcsRef.current.delete(peerId);
        }
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
        if (pcsRef.current.size === 0) cleanup();
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPeerOnline(Object.keys(state).filter((k) => k !== userId).length);
      })
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [accept, cleanup, createPeerFor, getLocal, send, userId]);

  return {
    status,
    withVideo,
    micOn,
    camOn,
    sharingScreen,
    sharingAudio,
    peerOnline,
    minimized,
    incomingFrom,
    localStream,
    remoteStreams,
    startCall,
    accept,
    hangup,
    toggleMic,
    toggleCam,
    shareScreen,
    stopScreenShare,
    shareDeviceAudio,
    stopAudioShare,
    setMinimized,
  };
}
