// ==========================================
// ফাইল ১: src/lib/permissions.ts (সম্পূর্ণ নতুন ফাইল)
// ==========================================

export type MediaPermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

export interface PermissionStateResult {
  mic: MediaPermissionStatus;
  camera: MediaPermissionStatus;
  overlayDetected?: boolean;
}

/**
 * অ্যান্ড্রয়েড ক্রোম ব্রাউজারে ওভারলে ব্লক শনাক্তকরণ এবং নির্দেশিকা
 */
export function explainAndroidOverlayIssue(): { title: string; steps: string[] } {
  return {
    title: "মোবাইলে স্ক্রিন ওভারলে (Overlay) সক্রিয় রয়েছে",
    steps: [
      "১. আপনার স্ক্রিনের ফেসবুক মেসেঞ্জার চ্যাট-হেড (Messenger Bubble) বা স্ক্রিন রেকর্ডারের ফ্লোটিং বাটন বন্ধ করুন।",
      "২. অথবা Chrome ব্রাউজারের উপরে বাম পাশে থাকা 'Tune / Settings' আইকনে ট্যাপ করুন।",
      "৩. 'Permissions' এ ক্লিক করে Microphone ও Camera-কে সরাসরি 'Allow' করে দিন।",
    ],
  };
}

/**
 * মাইক্রোফোন ও ক্যামেরার অনুমতি বর্তমান অবস্থা যাচাই
 */
export async function checkMediaPermissions(): Promise<PermissionStateResult> {
  if (typeof window === "undefined" || !navigator.permissions) {
    return { mic: "prompt", camera: "prompt" };
  }

  let mic: MediaPermissionStatus = "prompt";
  let camera: MediaPermissionStatus = "prompt";

  try {
    const micStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
    mic = (micStatus.state as MediaPermissionStatus) || "prompt";
  } catch {
    mic = "prompt";
  }

  try {
    const camStatus = await navigator.permissions.query({ name: "camera" as PermissionName });
    camera = (camStatus.state as MediaPermissionStatus) || "prompt";
  } catch {
    camera = "prompt";
  }

  return { mic, camera };
}

/**
 * ব্যবহারকারীর ইন্টারঅ্যাকশনে নিরাপদভাবে অডিও ও ভিডিও পারমিশন গ্রহণ
 * ওভারলে ত্রুটি হলে ক্র্যাশ না করে পরিষ্কার বার্তা ফেরত পাঠায়
 */
export async function requestMediaPermissions(options: {
  audio?: boolean;
  video?: boolean;
}): Promise<{ stream: MediaStream | null; error: string | null; overlayIssue: boolean }> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      error: "আপনার ব্রাউজারে কল সাপোর্ট করে না। দয়া করে Chrome বা Edge ব্যবহার করুন।",
      overlayIssue: false,
    };
  }

  const { audio = true, video = false } = options;

  // ১. সরাসরি রিকোয়েস্ট
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false,
      video: video
        ? {
            facingMode: "user",
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          }
        : false,
    });
    return { stream, error: null, overlayIssue: false };
  } catch (err: any) {
    const message = err?.message || "";
    const name = err?.name || "";

    // অ্যান্ড্রয়েড ওভারলে বা ট্যাপজ্যাকিং সমস্যা ডিটেকশন
    const isOverlay =
      name === "NotAllowedError" &&
      (message.toLowerCase().includes("overlay") ||
        message.toLowerCase().includes("bubble") ||
        message.toLowerCase().includes("blocked"));

    // ২. ভিডিও সহ ব্যর্থ হলে শুধুমাত্র অডিও দিয়ে চেষ্টা করুন যাতে কল অন্তত সচল থাকে
    if (video) {
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return {
          stream: audioOnlyStream,
          error: "ক্যামেরা ব্লক থাকায় শুধুমাত্র অডিও কল চালু হয়েছে।",
          overlayIssue: isOverlay,
        };
      } catch {
        // দুটিই ব্যর্থ
      }
    }

    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        stream: null,
        error:
          "পারমিশন দেওয়া যায়নি। আপনার স্ক্রিনের মেসেঞ্জার বাবল বা অন্যান্য ফ্লোটিং অ্যাপ বন্ধ করে আবার চেষ্টা করুন অথবা Chrome সাইট সেটিংসে গিয়ে Allow দিন।",
        overlayIssue: true,
      };
    }

    return {
      stream: null,
      error: err?.message || "মাইক্রোফোন বা ক্যামেরার অনুমতি পাওয়া যায়নি।",
      overlayIssue: false,
    };
  }
}
