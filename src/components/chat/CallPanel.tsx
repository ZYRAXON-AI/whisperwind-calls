import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  Users,
} from "lucide-react";

import { Avatar } from "./Avatar";
import type { useCall } from "@/lib/useCall";
import type { Profile } from "@/lib/social";
import { unlockSound } from "@/lib/sounds";

type Call = ReturnType<typeof useCall>;

function Stream({
  stream,
  muted,
  className,
}: {
  stream: MediaStream | null | undefined;
  muted?: boolean | undefined;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    if (stream) {
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => undefined);
      }
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function RemoteAudio({ stream }: { stream: MediaStream | null | undefined }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    const kick = () => {
      unlockSound();
      el.muted = false;
      el.volume = 1;
      if (el.srcObject !== stream) el.srcObject = stream;
      for (const t of stream.getAudioTracks()) {
        try {
          t.enabled = true;
        } catch {}
      }
      void el.play().catch(() => undefined);
    };
    kick();
    const onAdd = () => kick();
    stream.addEventListener("addtrack", onAdd);
    const timer = window.setInterval(() => {
      if (el.paused || el.muted) kick();
    }, 800);
    const onGesture = () => kick();
    document.addEventListener("pointerdown", onGesture, { once: true });
    return () => {
      stream.removeEventListener("addtrack", onAdd);
      window.clearInterval(timer);
      document.removeEventListener("pointerdown", onGesture);
    };
  }, [stream]);
  if (!stream) return null;
  return <audio ref={ref} autoPlay playsInline muted={false} />;
}

function hasVideoTrack(stream: MediaStream | null | undefined) {
  return Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled));
}

function ParticipantTile({
  stream,
  name,
  profile,
  isSelf,
  sharing,
  muted,
  circle,
  className = "",
}: {
  stream?: MediaStream | null | undefined;
  name: string;
  profile?: Profile | undefined;
  isSelf?: boolean | undefined;
  sharing?: boolean | undefined;
  muted?: boolean | undefined;
  circle?: boolean | undefined;
  className?: string | undefined;
}) {
  const showVideo = hasVideoTrack(stream);
  return (
    <div
      className={`relative overflow-hidden ${
        circle ? "rounded-full" : "rounded-3xl"
      } border border-white/20 bg-black/40 shadow-inner ${className}`}
    >
      {showVideo && stream ? (
        <Stream stream={stream} muted className="h-full w-full object-contain bg-black" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
          <Avatar profile={profile} className="h-20 w-20 sm:h-24 sm:w-24" />
          <span className="max-w-full truncate text-sm font-semibold text-white/90 drop-shadow-md">{name}</span>
        </div>
      )}
      {sharing && (
        <span className="absolute top-2 left-2 flex items-center gap-1 rounded-lg bg-primary/90 px-2 py-0.5 text-[10px] font-bold text-white shadow">
          <Tv className="h-3 w-3" /> Screen
        </span>
      )}
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
        {muted ? <MicOff className="h-3 w-3 text-red-400" /> : <Mic className="h-3 w-3" />}
        <span className="max-w-[10rem] truncate">{name}{isSelf ? " (You)" : ""}</span>
      </span>
    </div>
  );
}

export function CallPanel({
  call,
  peerName = "Friend",
  profiles = {},
  callerName,
  selfProfile,
}: {
  call: Call;
  peerName?: string | undefined;
  profiles?: Record<string, Profile> | undefined;
  callerName?: string | undefined;
  selfProfile?: Profile | undefined;
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [busy, setBusy] = useState<"accept" | "decline" | "hangup" | null>(null);

  const remoteIds = useMemo(() => Object.keys(call.remoteStreams), [call.remoteStreams]);
  const participantCount = remoteIds.length + (call.localStream ? 1 : 0);
  const displayName = (id: string) =>
    profiles[id]?.display_name ?? (id && id === call.incoming?.callerId ? callerName ?? peerName : "Friend");

  if (call.status === "idle") return null;

  const remoteAudioNodes = remoteIds.map((id) => (
    <RemoteAudio key={`audio-${id}`} stream={call.remoteStreams[id]} />
  ));

  if (call.status === "incoming") {
    const fromName = callerName ?? (call.incoming ? profiles[call.incoming.callerId]?.display_name : undefined) ?? peerName;
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-5 backdrop-blur-[2px]">
        <div className="glass-strong glow w-full max-w-sm rounded-3xl p-8 text-center animate-bounce-short">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75" />
            <PhoneIncoming className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-xl font-bold">
            Incoming {call.incomingVideo ? "Video" : "Audio"} Call
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{fromName} is calling you…</p>
          <div className="mt-8 flex justify-center gap-6">
            {remoteAudioNodes}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (busy) return;
                setBusy("decline");
                void call
                  .decline()
                  .catch(() => toast.error("Could not decline the call"))
                  .finally(() => setBusy(null));
              }}
              className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-60"
              aria-label="Decline"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (busy) return;
                setBusy("accept");
                unlockSound();
                void call
                  .accept()
                  .catch((err: unknown) => {
                    toast.error(
                      err instanceof Error && err.message ? err.message : "Could not join the call"
                    );
                  })
                  .finally(() => setBusy(null));
              }}
              className="gradient-romance grid h-14 w-14 place-items-center rounded-full text-primary-foreground shadow-lg ring-4 ring-primary/30 transition hover:scale-105 active:scale-95 animate-pulse disabled:opacity-60"
              aria-label="Accept"
            >
              <PhoneIncoming className="h-6 w-6" />
            </button>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Decline will not end the call — you can Join later.
          </p>
        </div>
      </div>
    );
  }

  const controls = (
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
        title="Share Screen (Desktop & Mobile)"
        className={`grid h-12 w-12 place-items-center rounded-full transition ${
          call.sharingScreen ? "bg-primary text-primary-foreground ring-4 ring-primary/40" : "glass hover:bg-white/15"
        }`}
      >
        <MonitorUp className="h-5 w-5" />
      </button>

      <button
        type="button"
        disabled={busy === "hangup"}
        onClick={() => {
          if (busy) return;
          setBusy("hangup");
          void call
            .hangup()
            .catch(() => toast.error("Could not leave the call"))
            .finally(() => setBusy(null));
        }}
        aria-label="Leave call"
        className="grid h-12 w-12 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-xl transition hover:opacity-90 active:scale-95 disabled:opacity-60"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );

  const statusText =
    call.status === "calling"
      ? remoteIds.length > 0
        ? "Connecting…"
        : call.outgoing
          ? "Waiting for others to join…"
          : "Connecting…"
      : `Connected · ${participantCount} in call`;

  if (isMinimized) {
    const firstId = remoteIds[0];
    const firstRemote = firstId ? call.remoteStreams[firstId] : undefined;
    return (
      <div className="fixed bottom-20 right-4 z-50 flex w-72 flex-col overflow-hidden rounded-3xl border border-white/20 bg-background/95 p-3 shadow-2xl backdrop-blur-sm">
        {remoteAudioNodes}
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
          {hasVideoTrack(firstRemote ?? null) && firstRemote ? (
            <Stream stream={firstRemote} muted className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              <span className="text-xs text-white/80">{participantCount} participants · audio</span>
            </div>
          )}
          {call.peerSharingScreen && (
            <span className="absolute top-2 left-2 rounded-lg bg-primary/80 px-2 py-0.5 text-[10px] font-bold text-white">
              Screen Share
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
            onClick={() => {
              if (call.sharingScreen) {
                void call.stopScreenShare();
              } else {
                void call.shareScreen();
              }
            }}
            className={`grid h-9 w-9 place-items-center rounded-full ${call.sharingScreen ? "bg-primary text-white" : "glass"}`}
          >
            <MonitorUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void call.hangup()}
            className="grid h-9 w-9 place-items-center rounded-full bg-destructive text-white"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-[2px]">
      {remoteAudioNodes}
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <span className="text-sm font-medium">{statusText}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="glass grid h-10 w-10 place-items-center rounded-full text-white hover:bg-white/20"
            title="Minimize call"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 grid gap-4 grid-cols-1 md:grid-cols-2 overflow-auto">
        {call.localStream && (
          <ParticipantTile
            stream={call.localStream}
            name="You"
            profile={selfProfile}
            isSelf
            sharing={call.sharingScreen}
            muted={!call.micOn}
          />
        )}
        {remoteIds.map((id) => (
          <ParticipantTile
            key={id}
            stream={call.remoteStreams[id]}
            name={displayName(id)}
            profile={profiles[id]}
            sharing={call.peerSharingScreen}
            muted={false}
          />
        ))}
      </div>

      {controls}
    </div>
  );
}
