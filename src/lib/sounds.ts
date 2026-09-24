// Notification & Ringtone sounds that work in background tabs and mobile devices.
let ctx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

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

export function unlockSound() {
  const c = audio();
  if (!c) return;
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

export function playMessageSound() {
  tone(880, 0, 0.16);
  tone(1320, 0.12, 0.22);
}

// ---------------- কাস্টম রিংটোন প্রিসেটসমূহ ----------------
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
    description: "স্ট্যান্ডার্ড উচ্চ কম্পাঙ্কের ক্লাসিক চিম",
    play: () => {
      tone(660, 0, 0.35, 0.3);
      tone(880, 0.4, 0.45, 0.3);
    },
  },
  {
    id: "romantic",
    name: "Romantic Melody",
    description: "মিষ্টি হার্প ও সফট সুরের শান্ত রিং",
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
    description: "ফিউচারিস্টিক হাই-টেক সিন্থ সাইবার রিং",
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
    description: "আরামদায়ক সফট ড্রিম কাইমস",
    play: () => {
      tone(392, 0.0, 0.3, 0.25, "sine"); // G4
      tone(587.33, 0.25, 0.35, 0.25, "sine"); // D5
      tone(659.25, 0.55, 0.4, 0.25, "triangle"); // E5
    },
  },
  {
    id: "marimba",
    name: "Bright Marimba",
    description: "আইফোন-স্টাইল প্রাণবন্ত মারিম্বা মেলোডি",
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
    description: "মন শান্ত করা ক্রিস্টাল বেল",
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

// যে রিংটোন কলকারী পাঠাবে সেটি বাজাবে
export function startRingtone(presetId?: string) {
  if (ringTimer) return;
  const tune = RINGTONE_PRESETS.find((p) => p.id === (presetId || getSavedRingtone())) || RINGTONE_PRESETS[0];

  tune.play();
  ringTimer = setInterval(() => {
    tune.play();
  }, 1800);
}

export function stopRingtone() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = null;
}

export function previewRingtone(presetId: string) {
  stopRingtone();
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
  return (await Notification.requestPermission()) === "granted";
}

export function notify(title: string, body: string) {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico", tag: "zyraxon" });
  } catch {}
}
