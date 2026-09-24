import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getSavedRingtone } from "@/lib/sounds";

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
  const [callerRingtone, setCallerRingtone] = useState<string>("classic");

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const statusRef = useRef<CallStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event, payload: { ...payload } });
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => {
      try {
        s.track?.stop();
      } catch {}
    });
    pcRef.current?.close();
    pcRef.current = null;

    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.getTracks().forEach((t) => t.stop());
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
    setMicOn(true);
    setCamOn(true);
    setCallerRingtone("classic");
  }, []);

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection(ICE);
    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.addTransceiver("audio", { direction: "sendrecv" });
    pc.addTransceiver("video", { direction: "sendrecv" });

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        e.streams[0].getTracks().forEach((track) => remote.addTrack(track));
      } else if (e.track) {
        remote.addTrack(e.track);
      }
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && userId) {
        send("ice_candidate", { from: userId, candidate: e.candidate.toJSON() });
      }
    };

    pcRef.current = pc;
    return pc;
  }, [send, userId]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel("zyraxon-webrtc-call", {
      config: { broadcast: { self: false } },
    });

    ch.on("broadcast", { event: "call_offer" }, async ({ payload }) => {
      if (payload.from === userId) return;
      if (statusRef.current !== "idle") {
        ch.send({ type: "broadcast", event: "call_busy", payload: { from: userId } });
        return;
      }
      setIncomingVideo(Boolean(payload.withVideo));
      setCallerRingtone((payload.ringtone as string) || "classic");
      pendingOffer.current = payload.sdp as RTCSessionDescriptionInit;
      setStatus("incoming");
    });

    ch.on("broadcast", { event: "call_answer" }, async ({ payload }) => {
      if (payload.from === userId) return;
      if (pcRef.current && payload.sdp) {
        try {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit)
          );
          while (pendingIce.current.length > 0) {
            const cand = pendingIce.current.shift();
            if (cand) await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
          }
          setStatus("connected");
        } catch {}
      }
    });

    ch.on("broadcast", { event: "ice_candidate" }, async ({ payload }) => {
      if (payload.from === userId) return;
      if (!payload.candidate) return;
      if (pcRef.current?.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate as RTCIceCandidateInit));
        } catch {}
      } else {
        pendingIce.current.push(payload.candidate as RTCIceCandidateInit);
      }
    });

    ch.on("broadcast", { event: "call_hangup" }, ({ payload }) => {
      if (payload.from !== userId) cleanup();
    });

    ch.on("broadcast", { event: "call_busy" }, ({ payload }) => {
      if (payload.from !== userId && statusRef.current === "calling") cleanup();
    });

    ch.on("broadcast", { event: "screen_status" }, ({ payload }) => {
      if (payload.from !== userId) {
        setPeerSharingScreen(Boolean(payload.sharing));
      }
    });

    ch.subscribe();
    channelRef.current = ch;

    return () => {
      cleanup();
      supabase.removeChannel(ch);
    };
  }, [userId, cleanup]);

  const startCall = useCallback(
    async (video: boolean) => {
      if (!userId) return;
      cleanup();
      setWithVideo(video);
      setStatus("calling");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
        localRef.current = stream;
        setLocalStream(stream);

        const at = stream.getAudioTracks()[0];
        const vt = stream.getVideoTracks()[0];
        if (at) micTrackRef.current = at;
        if (vt) camTrackRef.current = vt;

        const pc = createPeer();
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // কলারের নিজস্ব রিংটোন পাঠানো
        const myRingtone = getSavedRingtone();
        send("call_offer", {
          from: userId,
          sdp: offer,
          withVideo: video,
          ringtone: myRingtone,
        });
      } catch (err) {
        cleanup();
        throw err;
      }
    },
    [cleanup, createPeer, send, userId]
  );

  const accept = useCallback(async () => {
    if (!userId || !pendingOffer.current) return;
    setStatus("connected");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingVideo ? { facingMode: "user", width: { ideal: 1280 } } : false,
      });
      localRef.current = stream;
      setLocalStream(stream);

      const at = stream.getAudioTracks()[0];
      const vt = stream.getVideoTracks()[0];
      if (at) micTrackRef.current = at;
      if (vt) camTrackRef.current = vt;

      const pc = createPeer();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));
      pendingOffer.current = null;

      while (pendingIce.current.length > 0) {
        const cand = pendingIce.current.shift();
        if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      send("call_answer", { from: userId, sdp: answer });
    } catch {
      cleanup();
    }
  }, [cleanup, createPeer, incomingVideo, send, userId]);

  const hangup = useCallback(() => {
    if (userId) send("call_hangup", { from: userId });
    cleanup();
  }, [cleanup, send, userId]);

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

  const stopScreenShare = useCallback(() => {
    if (screenRef.current) {
      screenRef.current.getTracks().forEach((t) => t.stop());
      screenRef.current = null;
    }

    if (pcRef.current && camTrackRef.current) {
      const videoSender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === "video");
      if (videoSender) void videoSender.replaceTrack(camTrackRef.current);
    }

    if (localRef.current) {
      setLocalStream(new MediaStream(localRef.current.getTracks()));
    }

    setSharingScreen(false);
    if (userId) send("screen_status", { from: userId, sharing: false });
  }, [send, userId]);

  const shareScreen = useCallback(async () => {
    if (!pcRef.current || !userId) return;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });

      screenRef.current = displayStream;
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrack.contentHint = "detail";

      const videoSender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === "video");
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      } else {
        pcRef.current.addTrack(screenTrack, displayStream);
      }

      setLocalStream(displayStream);
      setSharingScreen(true);
      send("screen_status", { from: userId, sharing: true });

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch {
      stopScreenShare();
    }
  }, [pcRef, send, stopScreenShare, userId]);

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
