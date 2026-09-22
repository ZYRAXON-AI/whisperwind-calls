import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  MonitorUp,
  PhoneIncoming,
  Minimize2,
  Maximize2,
  Tv,
} from "lucide-react";
import { toast } from "sonner";
import type { useCall } from "@/lib/useCall";

type Call = ReturnType<typeof useCall>;

function Stream({
  stream,
  muted,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

export function CallPanel({ call }: { call: Call }) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (call.status === "idle") return null;

  // ইনকামিং কল ডায়ালগ
  if (call.status === "incoming") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-5 backdrop-blur-md">
        <div className="glass-strong glow w-full max-w-sm rounded-3xl p-8 text-center animate-bounce-short">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75" />
            <PhoneIncoming className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-xl font-bold">
            Incoming {call.incomingVideo ? "Video" : "Audio"} Call
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Ringtone ringing…</p>
          <div className="mt-8 flex justify-center gap-6">
            <button
              type="button"
              onClick={() => call.hangup()}
              className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition hover:scale-105 active:scale-95"
              aria-label="Decline"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => void call.accept()}
              className="gradient-romance grid h-14 w-14 place-items-center rounded-full text-primary-foreground shadow-lg ring-4 ring-primary/30 transition hover:scale-105 active:scale-95 animate-pulse"
              aria-label="Accept"
            >
              <PhoneIncoming className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // মিনিমাইজড মোড (ডান পাশে ফ্লোটিং ছোট উইন্ডো - নিচে চ্যাট বক্স ব্যবহারযোগ্য)
  if (isMinimized) {
    return (
      <div className="fixed bottom-20 right-4 z-50 flex w-72 flex-col overflow-hidden rounded-3xl border border-white/20 bg-background/95 p-3 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold">Call in Progress</span>
          </div>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="glass grid h-7 w-7 place-items-center rounded-full text-foreground hover:bg-white/20"
            title="Maximize call"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="relative mt-2 h-36 w-full overflow-hidden rounded-2xl bg-black">
          <Stream stream={call.remoteStream} className="h-full w-full object-cover" />
          {call.peerSharingScreen && (
            <span className="absolute top-2 left-2 rounded-lg bg-primary/80 px-2 py-0.5 text-[10px] font-bold text-white">
              Peer Screen
            </span>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-around">
          <button
            type="button"
            onClick={call.toggleMic}
            className={`grid h-9 w-9 place-items-center rounded-full ${call.micOn ? "glass" : "bg-destructive text-white"}`}
          >
            {call.micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
          {call.withVideo && (
            <button
              type="button"
              onClick={call.toggleCam}
              className={`grid h-9 w-9 place-items-center rounded-full ${call.camOn ? "glass" : "bg-destructive text-white"}`}
            >
              {call.camOn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={call.hangup}
            className="grid h-9 w-9 place-items-center rounded-full bg-destructive text-white shadow"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ফুলস্ক্রিন কল উইন্ডো
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-2xl">
      {/* টপ বার: মিনিমাইজ বাটন */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 text-sm text-white/80">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-ping" />
          <span>{call.status === "calling" ? "Ringing…" : "Connected"}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(true)}
          className="glass flex items-center gap-1.5 rounded-2xl px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition"
          title="Minimize & continue chatting"
        >
          <Minimize2 className="h-4 w-4" />
          <span>Minimize & Chat</span>
        </button>
      </div>

      {/* ভিডিও / স্ক্রিন শেয়ার এরিয়া */}
      <div className="relative flex-1 overflow-hidden p-2 sm:p-4">
        <Stream
          stream={call.remoteStream}
          className="h-full w-full rounded-3xl object-contain bg-black/40 shadow-inner"
        />

        {call.peerSharingScreen && (
          <div className="absolute top-6 left-6 flex items-center gap-2 rounded-2xl bg-black/70 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md">
            <Tv className="h-4 w-4 text-primary" />
            <span>Peer is sharing their screen</span>
          </div>
        )}

        {call.status === "calling" && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="glass rounded-3xl px-6 py-3 text-base font-semibold shadow-xl">
              Ringing… অনুগ্রহ করে অপেক্ষা করুন
            </p>
          </div>
        )}

        {/* নিজের ক্যামেরা ভিউ (Self Preview) */}
        {call.withVideo && (
          <div className="glass-strong absolute bottom-6 right-6 h-36 w-24 overflow-hidden rounded-2xl shadow-2xl sm:h-48 sm:w-36 border border-white/20">
            <Stream stream={call.localStream} muted className="h-full w-full object-cover" />
          </div>
        )}
      </div>

      {/* বটম কন্ট্রোল বার */}
      <div className="glass-strong m-4 flex flex-wrap items-center justify-center gap-4 rounded-3xl p-4 shadow-2xl">
        <button
          type="button"
          onClick={call.toggleMic}
          aria-label="Microphone"
          className={`grid h-12 w-12 place-items-center rounded-full transition ${call.micOn ? "glass hover:bg-white/15" : "bg-destructive text-destructive-foreground shadow-lg"}`}
        >
          {call.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>

        {call.withVideo && (
          <button
            type="button"
            onClick={call.toggleCam}
            aria-label="Camera"
            className={`grid h-12 w-12 place-items-center rounded-full transition ${call.camOn ? "glass hover:bg-white/15" : "bg-destructive text-destructive-foreground shadow-lg"}`}
          >
            {call.camOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
        )}

        {/* হাই-কোয়ালিটি স্ক্রিন শেয়ার বাটন */}
        <button
          type="button"
          onClick={() => {
            if (call.sharingScreen) {
              void call.stopScreenShare();
            } else {
              void call.shareScreen();
            }
          }}
          aria-label="Share Screen"
          title="Share High Quality Screen (Desktop/Mobile)"
          className={`grid h-12 w-12 place-items-center rounded-full transition ${
            call.sharingScreen
              ? "bg-primary text-primary-foreground ring-4 ring-primary/40"
              : "glass hover:bg-white/15"
          }`}
        >
          <MonitorUp className="h-5 w-5" />
        </button>

        {/* কল কাটার বাটন */}
        <button
          type="button"
          onClick={call.hangup}
          aria-label="Hang up"
          className="grid h-12 w-12 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-xl transition hover:opacity-90 active:scale-95"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
