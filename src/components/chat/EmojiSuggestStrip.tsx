import { useEffect, useState } from "react";

import { topEmojis } from "@/lib/emojiLibrary";

export function EmojiSuggestStrip({ onPick, version }: { onPick: (emoji: string) => void; version: number }) {
  const [list, setList] = useState<string[]>(() => topEmojis(12));

  useEffect(() => {
    setList(topEmojis(12));
  }, [version]);

  return (
    <div className="scroll-soft mb-2 flex items-center gap-1 overflow-x-auto pb-1">
      {list.map((emoji) => (
        <button
          key={emoji}
          type="button"
          title="Add to message"
          onClick={() => onPick(emoji)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg transition hover:bg-white/15 active:scale-90"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}