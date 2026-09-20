import { useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  MonitorUp,
  Radio,
  PhoneIncoming,
  Heart,
  Minimize2,
  Maximize2,
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

function AudioPeers({ streams }: { streams: Map<string, MediaStream> }) {
  return (
    <>
      {Array.from(streams.entries()).map(([id, stream]) => (
        <AudioOnly key={id} stream={stream} />
      ))}
    </>
  );
}

function AudioOnly({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function FloatingWidget({
  call,
  onExpand,
}: {
  call: Call;
  onExpand: () => void;
}) {
  return (
    <div className="floating-widget glass-strong glow fixed bottom-24 right-4 z-[60] flex items-center gap-3 rounded-2xl px-4 py-3">
      <div className="gradient-romance flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary-foreground">
        <Heart className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold">Active Call</p>
        <p className="text-[10px] text-muted-foreground">
          {call.peerOnline} peer{call.peerOnline !== 1 ? "s" : ""} connected
        </p>
      </div>
      <button
        type="button"
        onClick={onExpand}
        className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:bg-white/15"
        aria-label="Expand call"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={call.hangup}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground transition hover:opacity-90"
        aria-label="End call"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

export function CallPanel({ call }: { call: Call }) {
  if (call.status === "idle") return null;

  if (call.status === "incoming") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-5 backdrop-blur-sm">
        <div className="glass-strong glow w-full max-w-sm rounded-3xl p-8 text-center">
          <div className="gradient-romance mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-primary-foreground">
            <Heart className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">Incoming call</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Someone wants to talk to you
          </p>
          <div className="mt-7 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => call.hangup()}
              className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground"
              aria-label="Decline"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => void call.accept(call.incomingFrom || "", call.withVideo)}
              className="gradient-romance grid h-14 w-14 place-items-center rounded-full text-primary-foreground"
              aria-label="Accept"
            >
              <PhoneIncoming className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (call.minimized) {
    return <FloatingWidget call={call} onExpand={() => call.setMinimized(false)} />;
  }

  const peerCount = call.remoteStreams.size;
  const hasVideo = call.withVideo && peerCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-xl">
      <div className="relative flex-1 overflow-hidden">
        {peerCount === 0 ? (
          <Stream stream={null} className="h-full w-full object-contain" />
        ) : peerCount === 1 ? (
          <Stream
            stream={Array.from(call.remoteStreams.values())[0]}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="grid h-full w-full gap-1 p-1" style={{
            gridTemplateColumns: peerCount <= 2 ? "1fr" : "repeat(2, 1fr)",
            gridTemplateRows: peerCount <= 4 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
          }}>
            {Array.from(call.remoteStreams.entries()).map(([id, stream]) => (
              <Stream
                key={id}
                stream={stream}
                className="h-full w-full rounded-xl object-cover"
              />
            ))}
          </div>
        )}

        {call.status === "calling" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="glass-strong glow flex flex-col items-center gap-4 rounded-3xl px-8 py-6">
              <div className="gradient-romance flex h-16 w-16 items-center justify-center rounded-2xl text-primary-foreground">
                <Heart className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium">Ringing…</p>
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
              </div>
            </div>
          </div>
        )}

        {hasVideo && (
          <div className="glass absolute bottom-4 right-4 h-36 w-24 overflow-hidden rounded-2xl sm:h-44 sm:w-32">
            <Stream stream={call.localStream} muted className="h-full w-full object-cover" />
          </div>
        )}
      </div>

      <div className="glass-strong m-3 flex flex-wrap items-center justify-center gap-3 rounded-3xl p-4">
        <button
          type="button"
          onClick={() => call.setMinimized(true)}
          aria-label="Minimize call"
          className="glass grid h-12 w-12 place-items-center rounded-full transition hover:bg-white/15"
        >
          <Minimize2 className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={call.toggleMic}
          aria-label="Microphone"
          className={`grid h-12 w-12 place-items-center rounded-full ${call.micOn ? "glass" : "bg-destructive text-destructive-foreground"}`}
        >
          {call.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>

        {call.withVideo && (
          <button
            type="button"
            onClick={call.toggleCam}
            aria-label="Camera"
            className={`grid h-12 w-12 place-items-center rounded-full ${call.camOn ? "glass" : "bg-destructive text-destructive-foreground"}`}
          >
            {call.camOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
        )}

        <button
          type="button"
          aria-label="Share screen"
          onClick={() =>
            void (call.sharingScreen ? call.stopScreenShare() : call.shareScreen()).catch(() =>
              toast.error("Screen sharing was blocked"),
            )
          }
          className={`grid h-12 w-12 place-items-center rounded-full ${call.sharingScreen ? "gradient-romance text-primary-foreground" : "glass"}`}
        >
          <MonitorUp className="h-5 w-5" />
        </button>

        <button
          type="button"
          aria-label="Share device sound"
          onClick={() =>
            void (call.sharingAudio ? call.stopAudioShare() : call.shareDeviceAudio()).catch(() =>
              toast.error("Pick a tab or screen and tick 'Share audio'"),
            )
          }
          className={`grid h-12 w-12 place-items-center rounded-full ${call.sharingAudio ? "gradient-romance text-primary-foreground" : "glass"}`}
        >
          <Radio className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={call.hangup}
          aria-label="End call"
          className="grid h-12 w-16 place-items-center rounded-full bg-destructive text-destructive-foreground"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>

      <AudioPeers streams={call.remoteStreams} />
    </div>
  );
}
