export type EmojiHit = { emoji: string; label: string; image?: string };

const FREQ_KEY = "zyraxon:emoji-freq";
const DEFAULTS = ["👍", "❤️", "😂", "🙏", "😍", "🔥", "✅", "😊", "🎉", "💯", "🥰", "😭"];

const SEED: Array<{ e: string; w: string }> = [
  { e: "😀", w: "grinning face smile hasi হাসি happy joy" },
  { e: "😁", w: "grin cheerful teeth smile হাসি আনন্দ" },
  { e: "😂", w: "joy laugh tears crying laughing hasi হাসি কান্না" },
  { e: "🤣", w: "rofl rolling floor laughing hasi হাসি" },
  { e: "😊", w: "smile blush sweet hasi হাসি" },
  { e: "😍", w: "heart eyes love crush ভালোবাসা সুন্দর" },
  { e: "😘", w: "kiss blowing love ভালোবাসা চুমু" },
  { e: "🥰", w: "smiling hearts love ভালোবাসা" },
  { e: "😎", w: "cool sunglasses শান্ত ঠান্ডা" },
  { e: "🤩", w: "star struck amazed wow মুগ্ধ" },
  { e: "🥳", w: "party celebration joy উদযাপন পার্টি" },
  { e: "😢", w: "crying sad tear দুঃখ কান্না" },
  { e: "😭", w: "loud crying sob কান্না দুঃখ" },
  { e: "😡", w: "angry rage রাগ" },
  { e: "😠", w: "angry face রাগ" },
  { e: "😤", w: "triumph frustrated রাগ ধোঁয়া" },
  { e: "🤔", w: "thinking think ভাবা চিন্তা" },
  { e: "🤭", w: "hand over mouth shy giggle লাজুক" },
  { e: "😳", w: "flushed embarrassed shocked লাজুক থমকে" },
  { e: "😅", w: "sweat smile nervous ঘাম" },
  { e: "🙄", w: "eye roll annoyed বিরক্ত" },
  { e: "😴", w: "sleepy tired ঘুম ক্লান্ত" },
  { e: "🤤", w: "drooling hungry yummy খাবার লোভ" },
  { e: "🤯", w: "mind blown shocked amazed অবাক ধাক্কা" },
  { e: "😱", w: "screaming fear shocked ভয় চিৎকার" },
  { e: "🤢", w: "nauseated sick অসুস্থ বমি" },
  { e: "🥺", w: "pleading puppy eyes sad request মিনতি দুঃখ" },
  { e: "😇", w: "innocent angel halo ফেরেশতা" },
  { e: "🤗", w: "hug embrace আলিঙ্গন" },
  { e: "😷", w: "mask sick ভাইরাস চলো" },
  { e: "🤒", w: "thermometer sick fever জ্বর অসুস্থ" },
  { e: "🤠", w: "cowboy hat hat টুপি" },
  { e: "🤡", w: "clown funny জোকার" },
  { e: "👻", w: "ghost spirit ভূত" },
  { e: "👽", w: "alien ufo এলিয়েন" },
  { e: "🤖", w: "robot machine রোবট" },
  { e: "👍", w: "thumbs up like yes ভালো হ্যাঁ ওকে ঠিক" },
  { e: "👎", w: "thumbs down dislike no খারাপ না" },
  { e: "👏", w: "clap applause congratulations সাবাস ধন্যবাদ" },
  { e: "🙏", w: "folded hands thank you please pray ধন্যবাদ প্রার্থনা অনুরোধ" },
  { e: "🙌", w: "raising hands celebrate victory জয় উদযাপন" },
  { e: "👌", w: "ok perfect good ঠিক আছে" },
  { e: "✌️", w: "victory peace two fingers জয় শান্তি" },
  { e: "🤞", w: "crossed fingers luck luck অশুভতা কামনা" },
  { e: "🤙", w: "call me shaka sign কল" },
  { e: "👊", w: "fist punch fight মুষ্টি" },
  { e: "✊", w: "raised fist power solidarity শক্তি প্রতিবাদ" },
  { e: "🫶", w: "heart hands love ভালোবাসা হাত" },
  { e: "💪", w: "muscle strong power শক্তি শরীরচর্চা" },
  { e: "🖐️", w: "hand open palm হাত" },
  { e: "👋", w: "wave hello hi goodbye সালাম হ্যালো bye" },
  { e: "🤝", w: "handshake agreement deal চুক্তি হাতমিলন" },
  { e: "💁", w: "tipping hand help তথ্য" },
  { e: "🙅", w: "no gesture no banghead না" },
  { e: "🙆", w: "ok gesture ok ঠিক" },
  { e: "💅", w: "nail polish sassy কাজ হাতে" },
  { e: "🫡", w: "salute respect স্যালুট সম্মান" },
  { e: "💘", w: "cupid heart love ভালোবাসা প্রেম" },
  { e: "💕", w: "two hearts love ভালোবাসা" },
  { e: "💖", w: "sparkling heart love ভালোবাসা ঝলক" },
  { e: "💗", w: "growing heart love ভালোবাসা" },
  { e: "💓", w: "beating heart beat ভালোবাসা ধুকপুক" },
  { e: "💞", w: "revolving hearts love ভালোবাসা" },
  { e: "💌", w: "love letter loveapatra ভালোবাসা চিঠি" },
  { e: "❤️", w: "red heart love ভালোবাসা লাল হৃদয়" },
  { e: "🧡", w: "orange heart love ভালোবাসা কমলা" },
  { e: "💛", w: "yellow heart love ভালোবাসা হলুদ" },
  { e: "💚", w: "green heart love ভালোবাসা সবুজ" },
  { e: "💙", w: "blue heart love ভালোবাসা নীল" },
  { e: "💜", w: "purple heart love ভালোবাসা বেগুনি" },
  { e: "🖤", w: "black heart love ভালোবাসা কালো" },
  { e: "🤍", w: "white heart love ভালোবাসা সাদা" },
  { e: "💔", w: "broken heart heartbreak ভালোবাসা ভাঙা" },
  { e: "💯", w: "hundred perfect 100 পারফেক্ট শত" },
  { e: "✨", w: "sparkles shiny magic ঝকঝকে জাদু" },
  { e: "🌟", w: "star glowing তারকা" },
  { e: "⭐", w: "star তারকা" },
  { e: "💫", w: "dizzy star orbit ঘূর্ণি" },
  { e: "🔥", w: "fire hot burn আগুন গরম" },
  { e: "⚡", w: "zap lightning power বিদ্যুৎ" },
  { e: "☀️", w: "sun sunny রোদ সূর্য" },
  { e: "🌙", w: "crescent moon night চাঁদ রাত" },
  { e: "☁️", w: "cloud মেঘ" },
  { e: "🌈", w: "rainbow color রামধনু" },
  { e: "❄️", w: "snowflake cold বরফ ঠান্ডা" },
  { e: "🌧️", w: "rainy rain বৃষ্টি" },
  { e: "🌊", w: "ocean wave সাগর ঢেউ" },
  { e: "💧", w: "droplet water পানির ফোঁটা" },
  { e: "🍀", w: "four leaf clover luck ভাগ্য" },
  { e: "🌹", w: "rose flower গোলাপ ফুল" },
  { e: "🌸", w: "cherry blossom flower ফুল" },
  { e: "🌻", w: "sunflower flower সূর্যমুখী ফুল" },
  { e: "🌺", w: "hibiscus flower ফুল" },
  { e: "💐", w: "bouquet flowers ফুলের তোড়া" },
  { e: "🍁", w: "maple leaf leaf পাতা" },
  { e: "🌿", w: "herb leaf পাতা গাছ" },
  { e: "💎", w: "gem diamond হীরা" },
  { e: "🎁", w: "gift present উপহার" },
  { e: "🎂", w: "birthday cake জন্মদিন কেক" },
  { e: "🎉", w: "party popper celebration উৎসব উদযাপন" },
  { e: "🎊", w: "confetti celebration উৎসব" },
  { e: "🎈", w: "balloon বেলুন" },
  { e: "🪅", w: "pinata party পার্টি" },
  { e: "🏆", w: "trophy win champion ট্রফি জয়" },
  { e: "🥇", w: "gold medal winner সোনা পদক" },
  { e: "🥈", w: "silver medal রুপা পদক" },
  { e: "🥉", w: "bronze medal ব্রোঞ্জ পদক" },
  { e: "⚽", w: "soccer football ফুটবল" },
  { e: "🏀", w: "basketball বাস্কেটবল" },
  { e: "🏏", w: "cricket ক্রিকেট" },
  { e: "🏆", w: "sports trophy cup trophies ট্রফি" },
  { e: "🎮", w: "video game gaming গেম" },
  { e: "🎧", w: "headphone music হেডফোন গান" },
  { e: "🎵", w: "music note song গান" },
  { e: "🎶", w: "musical notes গান" },
  { e: "🎤", w: "microphone sing মাইক গান" },
  { e: "🎬", w: "movie film cinema সিনেমা" },
  { e: "📸", w: "camera photo ছবি ক্যামেরা" },
  { e: "📷", w: "camera ছবি ক্যামেরা" },
  { e: "🎥", w: "video camera ভিডিও" },
  { e: "📱", w: "mobile phone ফোন" },
  { e: "💻", w: "laptop computer কম্পিউটার" },
  { e: "🖥️", w: "desktop computer কম্পিউটার" },
  { e: "⌨️", w: "keyboard কিবোর্ড" },
  { e: "📚", w: "book books পড়া বই" },
  { e: "📖", w: "open book বই পড়া" },
  { e: "✏️", w: "pencil লেখা পেন্সিল" },
  { e: "📝", w: "memo note লেখা নোট" },
  { e: "📌", w: "pushpin pin পিন" },
  { e: "📎", w: "paperclip ক্লিপ" },
  { e: "💡", w: "bulb idea idea আলো আইডিয়া" },
  { e: "🔔", w: "bell notification নোটিফিকেশন ঘণ্টা" },
  { e: "🔒", w: "lock locked security তালা" },
  { e: "🔓", w: "unlock open তালা খোলা" },
  { e: "🔑", w: "key চাবি" },
  { e: "💰", w: "money bag cash টাকা" },
  { e: "💵", w: "dollar banknote টাকা ডলার" },
  { e: "💳", w: "credit card কার্ড টাকা" },
  { e: "🏦", w: "bank ব্যাংক" },
  { e: "🛒", w: "shopping cart কেনাকাটা" },
  { e: "🛍️", w: "shopping bags কেনাকাটা" },
  { e: "⏰", w: "alarm clock time ঘড়ি সময়" },
  { e: "🕐", w: "clock one oclock time সময় ঘড়ি" },
  { e: "📅", w: "calendar date তারিখ" },
  { e: "✅", w: "check mark yes done সঠিক হয়েছে শেষ" },
  { e: "❌", w: "cross mark no wrong ভুল বাতিল" },
  { e: "❗", w: "exclamation important জরুরি" },
  { e: "❓", w: "question mark প্রশ্ন" },
  { e: "⭕", w: "o circle ring বৃত্ত" },
  { e: "🇧🇩", w: "bangladesh flag বাংলা দেশ" },
  { e: "🇮🇳", w: "india flag ভারত" },
  { e: "🇺🇸", w: "usa america flag আমেরিকা" },
  { e: "🌍", w: "earth globe world পৃথিবী বিশ্ব" },
  { e: "☕", w: "coffee tea কফি চা" },
  { e: "🍵", w: "tea cup চা" },
  { e: "🍕", w: "pizza পিজা" },
  { e: "🍔", w: "burger বার্গার" },
  { e: "🍟", w: "fries ফ্রাই" },
  { e: "🍦", w: "ice cream আইসক্রিম" },
  { e: "🍰", w: "cake কেক" },
  { e: "🍫", w: "chocolate চকলেট" },
  { e: "🍎", w: "apple আপেল" },
  { e: "🍉", w: "watermelon তরমুজ" },
  { e: "🍇", w: "grapes আঙুর" },
  { e: "🍌", w: "banana কলা" },
  { e: "🥭", w: "mango আম" },
  { e: "🍈", w: "melon ফুটি" },
  { e: "🌽", w: "corn ভুট্টা" },
  { e: "🥕", w: "carrot গাজর" },
  { e: "🍚", w: "rice ভাত" },
  { e: "🍛", w: "curry তরকারি" },
  { e: "🥘", w: "paella food খাবার" },
  { e: "🍲", w: "pot food stew খাবার" },
  { e: "🦐", w: "shrimp চিংড়ি" },
  { e: "🐟", w: "fish মাছ" },
  { e: "🐔", w: "chicken মুরগি" },
  { e: "🥚", w: "egg ডিম" },
  { e: "🍞", w: "bread রুটি পাঁউরুটি" },
  { e: "🧀", w: "cheese পনির" },
  { e: "🥛", w: "milk দুধ" },
  { e: "🍯", w: "honey মধু" },
  { e: "🐶", w: "dog puppy কুকুর" },
  { e: "🐱", w: "cat বিড়াল" },
  { e: "🐭", w: "mouse ইঁদুর" },
  { e: "🐹", w: "hamster হ্যামস্টার" },
  { e: "🐰", w: "rabbit খরগোশ" },
  { e: "🦊", w: "fox শিয়াল" },
  { e: "🐻", w: "bear ভালুক" },
  { e: "🐼", w: "panda পাণ্ডা" },
  { e: "🐨", w: "koala কোয়ালা" },
  { e: "🦁", w: "lion সিংহ" },
  { e: "🐯", w: "tiger বাঘ" },
  { e: "🐮", w: "cow গরু" },
  { e: "🐷", w: "pig শূকর" },
  { e: "🐸", w: "frog ব্যাঙ" },
  { e: "🐵", w: "monkey বানর" },
  { e: "🦋", w: "butterfly প্রজাপতি" },
  { e: "🐝", w: "bee মৌমাছি" },
  { e: "🦅", w: "eagle ঈগল" },
  { e: "🦉", w: "owl পেঁচা" },
  { e: "🦇", w: "bat বাদুড়" },
  { e: "🐍", w: "snake সাপ" },
  { e: "🐢", w: "turtle কচ্ছপ" },
  { e: "🐬", w: "dolphin ডলফিন" },
  { e: "🐳", w: "whale তিমি" },
  { e: "🦈", w: "shark হাঙর" },
  { e: "🐙", w: "octopus অক্টোপাস" },
  { e: "🦀", w: "crab কাঁকড়া" },
  { e: "🐌", w: "snail শামুক" },
  { e: "🌳", w: "tree গাছ" },
  { e: "🌴", w: "palm tree পাম গাছ" },
  { e: "🍃", w: "leaves পাতা" },
  { e: "🪴", w: "plant houseplant গাছপালা" },
  { e: "🏠", w: "house home বাড়ি" },
  { e: "🏡", w: "house garden বাড়ি" },
  { e: "🏙️", w: "city buildings শহর" },
  { e: "🏖️", w: "beach সৈকত" },
  { e: "⛰️", w: "mountain পাহাড়" },
  { e: "🚗", w: "car গাড়ি" },
  { e: "✈️", w: "airplane plane উড়োজাহাজ বিমান" },
  { e: "🚀", w: "rocket রকেট" },
  { e: "🚁", w: "helicopter হেলিকপ্টার" },
  { e: "⛵", w: "sailboat নৌকা" },
  { e: "🚢", w: "ship জাহাজ" },
  { e: "🚌", w: "bus বাস" },
  { e: "🚕", w: "taxi ট্যাক্সি" },
  { e: "🚲", w: "bicycle সাইকেল" },
  { e: "🏍️", w: "motorcycle মোটরসাইকেল" },
  { e: "🚨", w: "siren police জরুরি" },
  { e: "💤", w: "sleep zzz ঘুম" },
  { e: "💥", w: "collision boom বিস্ফোরণ" },
  { e: "💫", w: "dizzy ভর" },
  { e: "🫡", w: "salute স্যালুট" },
  { e: "⚓", w: "anchor নোঙর" },
];

type EmojibaseEntry = { emoji: string; words: string };

let emojibasePromise: Promise<EmojibaseEntry[]> | null = null;

function loadEmojibase(): Promise<EmojibaseEntry[]> {
  if (!emojibasePromise) {
    emojibasePromise = fetch("https://cdn.jsdelivr.net/npm/emojibase-data@3.0.0/en/data.json")
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : Promise.resolve([])))
      .then((data) => parseEmojibase(data))
      .catch(() => []);
  }
  return emojibasePromise;
}

function parseEmojibase(data: unknown): EmojibaseEntry[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const entry = row as { emoji?: unknown; shortcodes?: unknown; tags?: unknown };
    if (typeof entry["emoji"] !== "string") return [];
    const shortcodes = Array.isArray(entry["shortcodes"])
      ? (entry["shortcodes"] as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    const tags = Array.isArray(entry["tags"])
      ? (entry["tags"] as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    return [
      {
        emoji: entry["emoji"],
        words: [...shortcodes, ...tags].join(" ").toLowerCase(),
      },
    ];
  });
}

let githubPromise: Promise<Record<string, string | undefined>> | null = null;

function loadGithub(): Promise<Record<string, string | undefined>> {
  if (!githubPromise) {
    githubPromise = fetch("https://api.github.com/emojis")
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : Promise.resolve({})))
      .then((data) => (typeof data === "object" && data !== null ? (data as Record<string, string>) : {}))
      .catch(() => ({}));
  }
  return githubPromise;
}

function inferUnicode(url: string): string | null {
  const name = url.match(/unicode\/([0-9a-f_]+)\.png/);
  if (!name || !name[1]) return null;
  const codes = name[1].split("_");
  try {
    return codes
      .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
      .join("");
  } catch {
    return null;
  }
}

function rankSeed(q: string): EmojiHit[] {
  const hits: EmojiHit[] = [];
  for (const item of SEED) {
    const words = item.w.toLowerCase();
    if (words.includes(q)) hits.push({ emoji: item.e, label: words.split(" ")[0] ?? item.e });
  }
  return hits;
}

function rankEmojibase(q: string, rows: EmojibaseEntry[], seen: Set<string>): EmojiHit[] {
  const hits: EmojiHit[] = [];
  for (const row of rows) {
    if (hits.length >= 40) break;
    if (seen.has(row.emoji)) continue;
    if (row.words.includes(q)) {
      hits.push({ emoji: row.emoji, label: row.words.split(" ")[0] ?? row.emoji });
      seen.add(row.emoji);
    }
  }
  return hits;
}

export async function searchEmojis(q: string): Promise<EmojiHit[]> {
  const query = q.trim().toLowerCase().replace(/^:+|:+$/g, "");
  if (!query) return [];

  const hits = rankSeed(query);
  const seen = new Set(hits.map((h) => h.emoji));

  if (hits.length < 12) {
    const rows = await loadEmojibase();
    hits.push(...rankEmojibase(query, rows, seen));
  }

  if (hits.length === 0) {
    const github = await loadGithub();
    for (const [name, url] of Object.entries(github)) {
      if (hits.length >= 20) break;
      if (!url) continue;
      const unicode = inferUnicode(url);
      if (unicode) {
        if (seen.has(unicode)) continue;
        hits.push({ emoji: unicode, label: name });
        seen.add(unicode);
      } else {
        hits.push({ emoji: "", label: name, image: url });
      }
    }
  }

  return hits.slice(0, 48);
}

function readFreq(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FREQ_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

export function bumpEmoji(emoji: string): void {
  try {
    const freq = readFreq();
    freq[emoji] = (freq[emoji] ?? 0) + 1;
    const capped = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);
    localStorage.setItem(FREQ_KEY, JSON.stringify(Object.fromEntries(capped)));
  } catch {
    // storage unavailable, ignore
  }
}

export function topEmojis(limit = 12): string[] {
  const freq = readFreq();
  const ranked = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji]) => emoji);
  const out = ranked.slice(0, limit);
  for (const fallback of DEFAULTS) {
    if (out.length >= limit) break;
    if (!out.includes(fallback)) out.push(fallback);
  }
  return out;
}