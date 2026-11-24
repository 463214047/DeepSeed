"use client";

// 常用表情（8 列网格，共 64 个）
const EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
  "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘",
  "😋", "😛", "😜", "🤪", "🤨", "🧐", "🤓", "😎",
  "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁",
  "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤",
  "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱",
  "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫",
  "😶", "😐", "😑", "😬", "🙄", "😴", "🤤", "😪",
];

/** 表情下拉面板：点选后由外部插入到光标处 */
export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute left-0 top-[calc(100%+6px)] z-30 w-[320px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
    >
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            aria-label={`插入表情 ${emoji}`}
            className="grid size-9 place-items-center rounded-md text-xl leading-none transition hover:bg-slate-100 active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
