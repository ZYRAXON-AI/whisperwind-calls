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
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

// Remote audio MUST live on its own element — audio-only tiles only show avatars
function RemoteAudio({ stream }: { stream: MediaStream | null | undefined }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    el.autoplay = true;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);
  if (!stream) return null;
  return <audio ref={ref} autoPlay playsInline />;
}

function hasVideoTrack(stream: MediaStream | null | undefined) {
  return Boolean(stream?.getVideoTracks().length);
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
      } border border-white/15 bg-black/50 shadow-inner ${className}`}
    >
      {showVideo && stream ? (
        <Stream stream={stream} muted={muted} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
          <Avatar profile={profile} className="h-20 w-20 sm:h-24 sm:w-24" />
          <span className="max-w-full truncate text-sm font-semibold text-white/90">{name}</span>
        </div>
      )}
      {sharing && (
        <span className="absolute top-2 left-2 flex items-center gap-1 rounded-lg bg-primary/85 px-2 py-0.5 text-[10px] font-bold text-white">
          <Tv className="h-3 w-3" /> Screen
        </span>
      )}
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
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
    profiles[id]?.display_name ?? (id && id === call.incoming?.callerId ? callerName ?? peerName : "Someone");

  if (call.status === "idle") return null;

  // Always pump remote audio — video tiles already play sound, audio-only needs this
  const remoteAudioNodes = remoteIds.map((id) => (
    <RemoteAudio key={`audio-${id}`} stream={call.remoteStreams[id]} />
  ));

  // Incoming Call Dialog
  if (call.status === "incoming") {
    const fromName = callerName ?? (call.incoming ? profiles[call.incoming.callerId]?.display_name : undefined) ?? peerName;
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
                  .catch(() => {
                    toast.error("Could not decline the call");
                  })
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
      ? "Waiting for others to join…"
      : `Connected · ${participantCount} in call`;

  // Minimized PiP Mode
  if (isMinimized) {
    const firstId = remoteIds[0];
    const firstRemote = firstId ? call.remoteStreams[firstId] : undefined;
    return (
      <div className="fixed bottom-20 right-4 z-50 flex w-72 flex-col overflow-hidden rounded-3xl border border-white/20 bg-background/95 p-3 shadow-2xl backdrop-blur-2xl">
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
            <Stream stream={firstRemote} className="h-full w-full object-cover" />
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
            disabled={busy === "hangup"}
            onClick={() => {
              if (busy) return;
              setBusy("hangup");
              void call
                .hangup()
                .catch(() => toast.error("Could not leave the call"))
                .finally(() => setBusy(null));
            }}
            className="grid h-9 w-9 place-items-center rounded-full bg-destructive text-white shadow disabled:opacity-60"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Fullscreen Call Window — video grid or audio avatar grid
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-2xl">
      {remoteAudioNodes}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 text-sm text-white/80">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-ping" />
          <span>{statusText}</span>
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

      <div className="relative min-h-0 flex-1 overflow-hidden p-2 sm:p-4">
        {call.status === "calling" && remoteIds.length === 0 && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <p className="glass rounded-3xl px-6 py-3 text-base font-semibold shadow-xl text-white">
              {call.withVideo ? "Starting video call…" : "Starting audio call…"}
            </p>
          </div>
        )}

        {call.withVideo ? (
          /* Video: grid of remote tiles + self PiP bottom-right */
          <>
            <div className="grid h-full w-full gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${remoteIds.length > 4 ? "160px" : "240px"}, 1fr))` }}>
              {remoteIds.length === 0 ? (
                <div className="col-span-full grid h-full place-items-center">
                  <div className="flex flex-col items-center gap-3 text-white/70">
                    <Users className="h-10 w-10 text-primary" />
                    <p className="text-sm">Waiting for others to join…</p>
                  </div>
                </div>
              ) : (
                remoteIds.map((id) => (
                  <ParticipantTile
                    key={id}
                    stream={call.remoteStreams[id]}
                    name={displayName(id)}
                    profile={profiles[id]}
                    sharing={call.peerSharingScreen}
                  />
                ))
              )}
            </div>

            <div className="glass-strong absolute bottom-6 right-6 h-36 w-24 overflow-hidden rounded-2xl shadow-2xl sm:h-48 sm:w-36 border border-white/20">
              <Stream stream={call.localStream} muted className="h-full w-full object-cover" />
            </div>

            {call.peerSharingScreen && (
              <div className="absolute top-6 left-6 flex items-center gap-2 rounded-2xl bg-black/70 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md">
                <Tv className="h-4 w-4 text-primary" />
                <span>Screen is being shared</span>
              </div>
            )}
          </>
        ) : (
          /* Audio: avatar grid of all participants */
          <div className="scroll-soft grid h-full w-full content-center justify-items-center gap-4 overflow-y-auto p-4 sm:gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <ParticipantTile
              stream={call.localStream}
              name={selfProfile?.display_name ?? "You"}
              profile={selfProfile}
              isSelf
              muted={!call.micOn}
              circle
              className="mx-auto h-40 w-40 sm:h-48 sm:w-48"
            />
            {remoteIds.map((id) => (
              <ParticipantTile
                key={id}
                stream={call.remoteStreams[id]}
                name={displayName(id)}
                profile={profiles[id]}
                sharing={call.peerSharingScreen}
                circle
                className="mx-auto h-40 w-40 sm:h-48 sm:w-48"
              />
            ))}
            {remoteIds.length === 0 && (
              <div className="col-span-full text-center text-sm text-white/70">
                Waiting for others to join…
              </div>
            )}
          </div>
        )}
      </div>

      {controls}
    </div>
  );
}
