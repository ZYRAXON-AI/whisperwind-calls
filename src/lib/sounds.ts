// Notification & ringtone sounds that work in background tabs and mobile devices.
// Ringtones loop a pre-rendered WebAudio buffer (AudioBufferSourceNode.loop=true).
// Buffer sources are NOT throttled in hidden background tabs the way setInterval is,
// so the callee keeps hearing the ring continuously until they answer or hang up.
let ctx: AudioContext | null = null;
let ringSource: AudioBufferSourceNode | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let ringWatchdog: ReturnType<typeof setInterval> | null = null;
let activeRingtone = "";
const ringBufferCache = new Map<string, AudioBuffer>();
// YouTube ringtone (yt:VIDEOID) plays via a hidden looping audio iframe
const ytFrames = new Set<HTMLIFrameElement>();

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Keep audio alive when tab becomes visible again (background suspends AudioContext)
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const c = audio();
      if (c && c.state === "suspended") void c.resume();
    }
  });
}

export function unlockSound() {
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const osc = c.createOscillator();
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.01);
}

function tone(
  freq: number,
  start: number,
  duration: number,
  volume = 0.22,
  type: OscillatorType = "sine"
) {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = c.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

// Soft ascending chime — plays when a message is sent or received
export function playMessageSound() {
  unlockSound();
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  tone(784, 0, 0.12, 0.16, "sine"); // G5
  tone(988, 0.07, 0.14, 0.15, "sine"); // B5
  tone(1318.5, 0.15, 0.24, 0.17, "triangle"); // E6
}

// Louder ring for incoming calls (survives brief AudioContext pauses)
export function playCallAlert() {
  unlockSound();
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  tone(880, 0, 0.2, 0.35, "triangle");
  tone(1108, 0.18, 0.2, 0.35, "triangle");
  tone(1318, 0.36, 0.3, 0.4, "sine");
}

// ---------------- Ringtone presets ----------------
// notes are rendered into a looping AudioBuffer so the ring is CONTINUOUS:
// no setInterval, no gaps, immune to background-tab timer throttling.
export type RingNote = {
  f: number; // frequency Hz
  t: number; // start offset (seconds into the loop)
  d: number; // duration (seconds)
  v?: number; // volume 0..1 (default 0.25)
  w?: number; // wave: 0 sine (default) | 1 triangle | 2 sawtooth
};

export type RingtonePreset = {
  id: string;
  name: string;
  description: string;
  notes: RingNote[];
};

export const RINGTONE_PRESETS: RingtonePreset[] = [
  {
    id: "classic",
    name: "Zyraxon Classic",
    description: "Standard high-frequency classic chime",
    notes: [
      { f: 660, t: 0, d: 0.35, v: 0.3 },
      { f: 880, t: 0.4, d: 0.45, v: 0.3 },
    ],
  },
  {
    id: "romantic",
    name: "Romantic Melody",
    description: "Sweet harp and soft romantic ring",
    notes: [
      { f: 523.25, t: 0.0, d: 0.2, v: 0.25, w: 1 }, // C5
      { f: 659.25, t: 0.18, d: 0.2, v: 0.25, w: 1 }, // E5
      { f: 783.99, t: 0.36, d: 0.3, v: 0.25, w: 1 }, // G5
      { f: 1046.5, t: 0.58, d: 0.45, v: 0.28 }, // C6
    ],
  },
  {
    id: "cyber",
    name: "Cyber Pulse",
    description: "Futuristic high-tech synth cyber ring",
    notes: [
      { f: 440, t: 0, d: 0.12, v: 0.22, w: 2 },
      { f: 880, t: 0.12, d: 0.12, v: 0.22, w: 2 },
      { f: 1760, t: 0.24, d: 0.2, v: 0.18 },
      { f: 1320, t: 0.48, d: 0.25, v: 0.2, w: 2 },
    ],
  },
  {
    id: "lofi",
    name: "Lo-Fi Dream",
    description: "Relaxing soft dream chimes",
    notes: [
      { f: 392, t: 0.0, d: 0.3, v: 0.25 }, // G4
      { f: 587.33, t: 0.25, d: 0.35, v: 0.25 }, // D5
      { f: 659.25, t: 0.55, d: 0.4, v: 0.25, w: 1 }, // E5
    ],
  },
  {
    id: "marimba",
    name: "Bright Marimba",
    description: "iPhone-style lively marimba melody",
    notes: [
      { f: 659.25, t: 0, d: 0.15, v: 0.3 },
      { f: 587.33, t: 0.15, d: 0.15, v: 0.3 },
      { f: 523.25, t: 0.3, d: 0.18, v: 0.3 },
      { f: 783.99, t: 0.5, d: 0.35, v: 0.35 },
    ],
  },
  {
    id: "ambient",
    name: "Zen Bells",
    description: "Calming crystal bells",
    notes: [
      { f: 1046.5, t: 0.0, d: 0.4, v: 0.2 },
      { f: 1318.51, t: 0.3, d: 0.4, v: 0.2 },
      { f: 1567.98, t: 0.6, d: 0.5, v: 0.25 },
    ],
  },
];

const STORAGE_KEY = "zyraxon_my_ringtone";

export function getSavedRingtone(): string {
  if (typeof window === "undefined") return "classic";
  return localStorage.getItem(STORAGE_KEY) || "classic";
}

export function setSavedRingtone(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, id);
}

// Play a YouTube ringtone (yt:VIDEOID) via ONE hidden looping iframe.
// Browsers block unmuted iframe autoplay until a user gesture, so we keep a
// looping native "ringing" melody running underneath — the callee is guaranteed
// to HEAR the call even if the music video can't auto-play.
function playYoutubeRingtone(videoId: string) {
  if (typeof document === "undefined") return;
  stopYoutubeRingtone();
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;bottom:0;border:none;";
  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&controls=0&disablekb=1&playsinline=1&mute=0`;
  iframe.allow = "autoplay; fullscreen";
  iframe.allowFullscreen = true;
  iframe.title = "ringtone";
  document.body.appendChild(iframe);
  ytFrames.add(iframe);
}

function stopYoutubeRingtone() {
  ytFrames.forEach((f) => {
    try {
      f.remove();
    } catch {}
  });
  ytFrames.clear();
}

// Render one preset's notes into a cached AudioBuffer (a single looping voice)
function renderRingBuffer(c: AudioContext, presetId: string, notes: RingNote[]): AudioBuffer {
  const key = `${presetId}:${c.sampleRate}`;
  const cached = ringBufferCache.get(key);
  if (cached) return cached;
  const end = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0) + 0.2;
  const sr = c.sampleRate;
  const len = Math.max(1, Math.ceil(end * sr));
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (const n of notes) {
    const w = n.w ?? 0;
    const v = n.v ?? 0.25;
    const startS = Math.max(0, Math.floor(n.t * sr));
    const durS = Math.max(1, Math.ceil(n.d * sr));
    for (let i = 0; i < durS; i++) {
      const idx = startS + i;
      if (idx >= len) break;
      const tt = i / sr;
      // quick attack + release so each note has a musical envelope
      const attack = Math.min(1, tt / 0.02);
      const release = Math.max(0, Math.min(1, (n.d - tt) / 0.15));
      let sample: number;
      if (w === 1) sample = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * n.f * tt));
      else if (w === 2) sample = 2 * ((n.f * tt) % 1) - 1;
      else sample = Math.sin(2 * Math.PI * n.f * tt);
      data[idx] += sample * v * attack * release;
    }
  }
  ringBufferCache.set(key, buf);
  return buf;
}

// Only a watchdog that resumes a suspended context — the loop itself never stops.
// Chrome does NOT throttle a playing AudioBufferSourceNode in a hidden tab, so the
// loop keeps ringing; we only need to rescue context suspension (iOS/mobile).
function startWatchdog() {
  if (ringWatchdog) return;
  ringWatchdog = setInterval(() => {
    const c = ctx;
    if (!c) return;
    if (c.state === "suspended") void c.resume();
  }, 1200);
}

function stopLoopSource() {
  if (ringWatchdog) {
    clearInterval(ringWatchdog);
    ringWatchdog = null;
  }
  const s = ringSource;
  ringSource = null;
  activeRingtone = "";
  if (s) {
    try {
      s.stop();
    } catch {}
    try {
      s.disconnect();
    } catch {}
  }
}

// Start an endlessly looping version of a preset on the shared context.
// requestedId keeps the idempotency key == what the user asked for (e.g. yt:ID).
function startLoopRing(preset: RingtonePreset, requestedId?: string) {
  stopLoopSource();
  const c = audio();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = renderRingBuffer(c, preset.id, preset.notes);
  src.loop = true;
  const gain = c.createGain();
  gain.gain.value = 1;
  gain.connect(c.destination);
  src.connect(gain);
  src.start();
  ringSource = src;
  activeRingtone = requestedId ?? preset.id;
  startWatchdog();
}

// Play the caller-selected ringtone (preset id or yt:VIDEOID)
export function startRingtone(presetId?: string) {
  const id = presetId || getSavedRingtone();
  unlockSound();
  const c = audio();
  if (!c) return;
  // Already looping this exact tone with a live context — don't restart (no gaps)
  if (activeRingtone === id && ringSource && ctx?.state === "running") return;
  if (id.startsWith("yt:")) {
    stopLoopSource();
    playYoutubeRingtone(id.slice(3));
    startLoopRing(RINGTONE_PRESETS[0]!, id);
    return;
  }
  const preset = RINGTONE_PRESETS.find((p) => p.id === id) || RINGTONE_PRESETS[0]!;
  stopLoopSource();
  startLoopRing(preset, id);
}

export function stopRingtone() {
  stopLoopSource();
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = null;
  stopYoutubeRingtone();
}

export function previewRingtone(presetId: string) {
  stopRingtone();
  if (presetId.startsWith("yt:")) {
    playYoutubeRingtone(presetId.slice(3));
    startLoopRing(RINGTONE_PRESETS[0]!, presetId);
  } else {
    startLoopRing(
      RINGTONE_PRESETS.find((p) => p.id === presetId) ?? RINGTONE_PRESETS[0]!,
      presetId
    );
  }
  previewTimer = setTimeout(() => {
    stopRingtone();
  }, 1700);
}

export async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

// System notification via ServiceWorker (required on Android PWA).
// force=true → also show while page is visible (calls, important alerts).
export function notify(
  title: string,
  body: string,
  opts?: { force?: boolean; tag?: string; vibrate?: number[] | number }
) {
  if (typeof document === "undefined") return;
  if (!opts?.force && document.visibilityState === "visible") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const tag = opts?.tag ?? "zyraxon";
  const notificationOpts: NotificationOptions = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag,
    renotify: true,
  };

  const show = () => {
    try {
      if ("serviceWorker" in navigator && navigator.serviceWorker) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification(title, notificationOpts))
          .catch(() => {
            try {
              new Notification(title, notificationOpts);
            } catch {}
          });
      } else {
        new Notification(title, notificationOpts);
      }
    } catch {}
  };

  show();

  try {
    const vib = opts?.vibrate ?? [180, 90, 180];
    navigator.vibrate?.(vib);
  } catch {}
}