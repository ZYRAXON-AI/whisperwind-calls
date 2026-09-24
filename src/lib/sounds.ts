// Notification & ringtone sounds that work in background tabs and mobile devices.
let ctx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
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
export type RingtonePreset = {
  id: string;
  name: string;
  description: string;
  play: () => void;
};

export const RINGTONE_PRESETS: RingtonePreset[] = [
  {
    id: "classic",
    name: "Zyraxon Classic",
    description: "Standard high-frequency classic chime",
    play: () => {
      tone(660, 0, 0.35, 0.3);
      tone(880, 0.4, 0.45, 0.3);
    },
  },
  {
    id: "romantic",
    name: "Romantic Melody",
    description: "Sweet harp and soft romantic ring",
    play: () => {
      tone(523.25, 0.0, 0.2, 0.25, "triangle"); // C5
      tone(659.25, 0.18, 0.2, 0.25, "triangle"); // E5
      tone(783.99, 0.36, 0.3, 0.25, "triangle"); // G5
      tone(1046.5, 0.58, 0.45, 0.28, "sine"); // C6
    },
  },
  {
    id: "cyber",
    name: "Cyber Pulse",
    description: "Futuristic high-tech synth cyber ring",
    play: () => {
      tone(440, 0, 0.12, 0.22, "sawtooth");
      tone(880, 0.12, 0.12, 0.22, "sawtooth");
      tone(1760, 0.24, 0.2, 0.18, "sine");
      tone(1320, 0.48, 0.25, 0.2, "sawtooth");
    },
  },
  {
    id: "lofi",
    name: "Lo-Fi Dream",
    description: "Relaxing soft dream chimes",
    play: () => {
      tone(392, 0.0, 0.3, 0.25, "sine"); // G4
      tone(587.33, 0.25, 0.35, 0.25, "sine"); // D5
      tone(659.25, 0.55, 0.4, 0.25, "triangle"); // E5
    },
  },
  {
    id: "marimba",
    name: "Bright Marimba",
    description: "iPhone-style lively marimba melody",
    play: () => {
      tone(659.25, 0, 0.15, 0.3, "sine");
      tone(587.33, 0.15, 0.15, 0.3, "sine");
      tone(523.25, 0.3, 0.18, 0.3, "sine");
      tone(783.99, 0.5, 0.35, 0.35, "sine");
    },
  },
  {
    id: "ambient",
    name: "Zen Bells",
    description: "Calming crystal bells",
    play: () => {
      tone(1046.5, 0.0, 0.4, 0.2, "sine");
      tone(1318.51, 0.3, 0.4, 0.2, "sine");
      tone(1567.98, 0.6, 0.5, 0.25, "sine");
    },
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

// Play a YouTube ringtone (yt:VIDEOID) — autoplay + loop hidden iframe
function playYoutubeRingtone(videoId: string) {
  if (typeof document === "undefined") return;
  stopYoutubeRingtone();
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;bottom:0;border:none;";
  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&controls=0&disablekb=1&playsinline=1`;
  iframe.allow = "autoplay";
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

// Play the caller-selected ringtone (preset id or yt:VIDEOID)
export function startRingtone(presetId?: string) {
  const id = presetId || getSavedRingtone();
  // Restart when the caller changes the tone — never stick on the old preset
  if (ringTimer) {
    stopRingtone();
  }
  unlockSound();
  const c = audio();
  if (c && c.state === "suspended") void c.resume();

  // YouTube ringtone
  if (id.startsWith("yt:")) {
    playYoutubeRingtone(id.slice(3));
    ringTimer = setInterval(() => {
      playYoutubeRingtone(id.slice(3));
    }, 12000);
    return;
  }

  const tune = RINGTONE_PRESETS.find((p) => p.id === id) || RINGTONE_PRESETS[0];

  tune.play();
  ringTimer = setInterval(() => {
    const cc = audio();
    if (cc && cc.state === "suspended") void cc.resume();
    tune.play();
  }, 1800);
}

export function stopRingtone() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = null;
  stopYoutubeRingtone();
}

export function previewRingtone(presetId: string) {
  stopRingtone();
  if (presetId.startsWith("yt:")) {
    playYoutubeRingtone(presetId.slice(3));
    previewTimer = setTimeout(() => {
      stopRingtone();
    }, 1700);
    return;
  }
  const tune = RINGTONE_PRESETS.find((p) => p.id === presetId) || RINGTONE_PRESETS[0];
  tune.play();
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
