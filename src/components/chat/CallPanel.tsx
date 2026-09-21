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
  if (call.status === "idle") return null;

  if (call.status === "incoming") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-5 backdrop-blur-sm">
        <div className="glass-strong glow w-full max-w-sm rounded-3xl p-8 text-center">
          <PhoneIncoming className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">
            Incoming {call.incomingVideo ? "video" : "audio"} call
          </h2>
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
              onClick={() => void call.accept()}
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-xl">
      <div className="relative flex-1 overflow-hidden">
        <Stream stream={call.remoteStream} className="h-full w-full object-contain" />
        {call.status === "calling" && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="glass rounded-2xl px-5 py-3 text-sm">Ringing…</p>
          </div>
        )}
        {call.withVideo && (
          <div className="glass absolute bottom-4 right-4 h-36 w-24 overflow-hidden rounded-2xl sm:h-44 sm:w-32">
            <Stream stream={call.localStream} muted className="h-full w-full object-cover" />
          </div>
        )}
      </div>

      <div className="glass-strong m-3 flex flex-wrap items-center justify-center gap-3 rounded-3xl p-4">
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
    </div>
  );
}
