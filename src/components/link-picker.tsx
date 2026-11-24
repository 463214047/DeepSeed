"use client";

import { useState } from "react";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s"'<>]+$/i.test(value);
}

/**
 * 插入链接下拉面板：显示文字 + 链接地址，确定后由外部拼成 BBCode 插入。
 */
export default function LinkPicker({
  initialText = "",
  onClose,
  onPick,
}: {
  /** 打开时若编辑器有选中文字，作为默认显示文字 */
  initialText?: string;
  onClose: () => void;
  onPick: (href: string, label: string) => void;
}) {
  const [label, setLabel] = useState(initialText);
  const [href, setHref] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = href.trim();
    if (!isHttpUrl(url)) {
      setError("请输入以 http:// 或 https:// 开头的链接");
      return;
    }
    onPick(url, label.trim());
  }

  return (
    <form
      onSubmit={submit}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute left-0 top-[calc(100%+6px)] z-30 w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10"
    >
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        autoComplete="off"
        autoFocus
        placeholder="文本"
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/10"
      />
      <input
        type="url"
        inputMode="url"
        value={href}
        onChange={(e) => {
          setHref(e.target.value);
          setError("");
        }}
        autoComplete="off"
        spellCheck={false}
        placeholder="链接"
        className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/10"
      />

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={!href.trim()}
          className="h-9 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          确定
        </button>
      </div>
    </form>
  );
}
