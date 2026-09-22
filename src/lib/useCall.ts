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
  const [peerSharingScreen, setPeerSharingScreen] = useState(false);
  const [sharingAudio, setSharingAudio] = useState(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
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
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    localRef.current = null;
    screenRef.current = null;
    camTrackRef.current = null;
    micTrackRef.current = null;
    pendingOffer.current = null;
    pendingIce.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("idle");
    setSharingScreen(false);
    setPeerSharingScreen(false);
    setSharingAudio(false);
    setMicOn(true);
    setCamOn(true);
  }, []);

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection(ICE);
    const remote = new MediaStream();
    setRemoteStream(remote);

    // সবসময় অডিও ও ভিডিও উভয়ের ট্রান্সসিভার রেডি রাখা
    pc.addTransceiver("audio", { direction: "sendrecv" });
    pc.addTransceiver("video", { direction: "sendrecv" });

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        e.streams[0].getTracks().forEach((t) => {
          if (!remote.getTracks().includes(t)) remote.addTrack(t);
        });
      } else if (e.track) {
        if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
      }
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
      });
      localRef.current = stream;
      micTrackRef.current = stream.getAudioTracks()[0] ?? null;
      camTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      // যদি ক্যামেরা পারমিশন না থাকে শুধু অডিও নিয়ে ব্যাকআপ
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localRef.current = stream;
      micTrackRef.current = stream.getAudioTracks()[0] ?? null;
      setLocalStream(stream);
      return stream;
    }
  }, []);

  const startCall = useCallback(
    async (video: boolean) => {
      if (!userId) return;
      setWithVideo(video);
      setStatus("calling");
      const stream = await getLocal(video);
      const pc = createPeer();

      // অডিও ও ভিডিও ট্র্যাক সেন্ডারে যুক্ত করা
      const senders = pc.getSenders();
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      if (audioTrack) {
        const audioSender = senders.find((s) => s.track?.kind === "audio" || (!s.track && s.init?.direction?.includes("send")));
        if (audioSender) await audioSender.replaceTrack(audioTrack);
        else pc.addTrack(audioTrack, stream);
      }

      if (videoTrack) {
        const videoSender = senders.find((s) => s.track?.kind === "video" || (!s.track && s.init?.direction?.includes("send")));
        if (videoSender) await videoSender.replaceTrack(videoTrack);
        else pc.addTrack(videoTrack, stream);
      }

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

    const senders = pc.getSenders();
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    if (audioTrack) {
      const audioSender = senders.find((s) => s.track?.kind === "audio");
      if (audioSender) await audioSender.replaceTrack(audioTrack);
      else pc.addTrack(audioTrack, stream);
    }
    if (videoTrack) {
      const videoSender = senders.find((s) => s.track?.kind === "video");
      if (videoSender) await videoSender.replaceTrack(videoTrack);
      else pc.addTrack(videoTrack, stream);
    }

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

  // স্ক্রিন শেয়ার বন্ধ করা
  const stopScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    setSharingScreen(false);

    const sender = pc?.getSenders().find((s) => s.track?.kind === "video" || s.init?.direction?.includes("send"));
    if (sender) {
      await sender.replaceTrack(camTrackRef.current ?? null);
    }
    send("screen_status", { from: userId, sharing: false });
  }, [send, userId]);

  // ফুল কোয়ালিটি স্ক্রিন শেয়ার (ডেস্কটপ, লিনাক্স এবং সমর্থিত মোবাইল)
  const shareScreen = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert("Screen sharing is not supported on this mobile browser. Please use Chrome on Desktop/Android.");
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });

      screenRef.current = display;
      const track = display.getVideoTracks()[0];
      if (!track) return;
      track.contentHint = "detail";

      const sender = pc.getSenders().find((s) => s.track?.kind === "video" || s.init?.direction?.includes("send"));
      if (sender) {
        await sender.replaceTrack(track);
      } else {
        pc.addTrack(track, display);
      }

      setSharingScreen(true);
      send("screen_status", { from: userId, sharing: true });

      track.onended = () => {
        void stopScreenShare();
      };
    } catch {
      // User cancelled
    }
  }, [send, stopScreenShare, userId]);

  // রিয়েল-টাইম সিগন্যালিং চ্যানেল
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("zyraxon-room", { config: { broadcast: { self: false } } });

    channel
      .on("broadcast", { event: "offer" }, ({ payload }) => {
        if (status !== "idle") return;
        pendingOffer.current = payload.sdp;
        setIncomingVideo(Boolean(payload.video));
        setStatus("incoming");
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const c of pendingIce.current) await pcRef.current.addIceCandidate(c).catch(() => {});
        pendingIce.current = [];
        setStatus("connected");
      })
      .on("broadcast", { event: "ice" }, async ({ payload }) => {
        const candidate = new RTCIceCandidate(payload.candidate);
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(candidate).catch(() => {});
        } else {
          pendingIce.current.push(candidate);
        }
      })
      .on("broadcast", { event: "screen_status" }, ({ payload }) => {
        setPeerSharingScreen(Boolean(payload.sharing));
      })
      .on("broadcast", { event: "hangup" }, () => {
        cleanup();
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      cleanup();
    };
  }, [cleanup, status, userId]);

  return {
    status,
    withVideo,
    incomingVideo,
    micOn,
    camOn,
    sharingScreen,
    peerSharingScreen,
    sharingAudio,
    localStream,
    remoteStream,
    startCall,
    accept,
    hangup,
    toggleMic,
    toggleCam,
    shareScreen,
    stopScreenShare,
  };
}
