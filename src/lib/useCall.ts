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
  const [incomingVideo, setIncomingVideo] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [sharingAudio, setSharingAudio] = useState(false);
  const [peerOnline, setPeerOnline] = useState(0);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const sysAudioRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event, payload: { ...payload } });
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
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
    pendingOffer.current = null;
    pendingIce.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("idle");
    setSharingScreen(false);
    setSharingAudio(false);
    setMicOn(true);
    setCamOn(true);
  }, []);

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection(ICE);
    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => {
        if (!remote.getTracks().includes(t)) remote.addTrack(t);
      });
      setRemoteStream(new MediaStream(remote.getTracks()));
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) send("ice", { from: userId, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") cleanup();
    };
    pcRef.current = pc;
    return pc;
  }, [cleanup, send, userId]);

  const getLocal = useCallback(async (video: boolean) => {
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

  const startCall = useCallback(
    async (video: boolean) => {
      if (!userId) return;
      setWithVideo(video);
      setStatus("calling");
      const stream = await getLocal(video);
      const pc = createPeer();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      send("offer", { from: userId, sdp: offer, video });
    },
    [createPeer, getLocal, send, userId],
  );

  const accept = useCallback(async () => {
    if (!userId || !pendingOffer.current) return;
    const video = incomingVideo;
    setWithVideo(video);
    const stream = await getLocal(video);
    const pc = createPeer();
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));
    for (const c of pendingIce.current) await pc.addIceCandidate(c).catch(() => {});
    pendingIce.current = [];
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send("answer", { from: userId, sdp: answer });
    setStatus("connected");
  }, [createPeer, getLocal, incomingVideo, send, userId]);

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
    const pc = pcRef.current;
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    setSharingScreen(false);
    const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
    if (sender && camTrackRef.current) await sender.replaceTrack(camTrackRef.current);
  }, []);

  const shareScreen = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
    screenRef.current = display;
    const track = display.getVideoTracks()[0];
    if (!track) return;
    track.contentHint = "detail";
    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender) await sender.replaceTrack(track);
    else pc.addTrack(track, display);
    const params = sender?.getParameters();
    if (sender && params) {
      params.encodings = [{ maxBitrate: 6_000_000, maxFramerate: 60 }];
      await sender.setParameters(params).catch(() => {});
    }
    setSharingScreen(true);
    track.onended = () => void stopScreenShare();
  }, [stopScreenShare]);

  const stopAudioShare = useCallback(async () => {
    const pc = pcRef.current;
    sysAudioRef.current?.getTracks().forEach((t) => t.stop());
    sysAudioRef.current = null;
    await audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setSharingAudio(false);
    const sender = pc?.getSenders().find((s) => s.track?.kind === "audio");
    if (sender && micTrackRef.current) await sender.replaceTrack(micTrackRef.current);
  }, []);

  /** Share whatever is playing on this device (YouTube, a music player, a tab) mixed with your voice. */
  const shareDeviceAudio = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
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
    const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
    if (sender) await sender.replaceTrack(mixed);
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
        if (pcRef.current) return;
        pendingOffer.current = payload.sdp;
        setIncomingVideo(Boolean(payload.video));
        setStatus("incoming");
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (payload.from === userId) return;
        const pc = pcRef.current;
        if (!pc || pc.signalingState === "stable") return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const c of pendingIce.current) await pc.addIceCandidate(c).catch(() => {});
        pendingIce.current = [];
        setStatus("connected");
      })
      .on("broadcast", { event: "ice" }, async ({ payload }) => {
        if (payload.from === userId) return;
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingIce.current.push(payload.candidate);
          return;
        }
        await pc.addIceCandidate(payload.candidate).catch(() => {});
      })
      .on("broadcast", { event: "hangup" }, ({ payload }) => {
        if (payload.from === userId) return;
        cleanup();
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
  }, [cleanup, userId]);

  return {
    status,
    withVideo,
    incomingVideo,
    micOn,
    camOn,
    sharingScreen,
    sharingAudio,
    peerOnline,
    localStream,
    remoteStream,
    startCall,
    accept,
    hangup,
    toggleMic,
    toggleCam,
    shareScreen,
    stopScreenShare,
    shareDeviceAudio,
    stopAudioShare,
  };
}
