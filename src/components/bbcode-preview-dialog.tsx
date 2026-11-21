"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { renderBBCode } from "@/lib/bbcode";

type BBCodePreviewDialogProps = {
  onClose: () => void;
  /** 确认后把解析出的 HTML 插入正文 */
  onInsert: (html: string) => void;
};

export default function BBCodePreviewDialog({ onClose, onInsert }: BBCodePreviewDialogProps) {
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  const titleId = useId();
  const sourceId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  function handlePreview() {
    const src = source.trim();
    if (!src) {
      setPreview("");
      setError("请先粘贴 BBCode 内容");
      textareaRef.current?.focus();
      return;
    }
    setError("");
    setPreview(renderBBCode(src));
  }

  function handleInsert() {
    if (!preview) return;
    onInsert(preview);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[600px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 outline-none"
      >
        <div className="sticky top-0 z-10 flex items-center justify-center border-b border-slate-100 bg-white px-6 py-5">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            BBCode 预览
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="absolute right-4 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-6 py-6">
          <label htmlFor={sourceId} className="block text-sm font-medium text-slate-700">
            BBCode 源码
          </label>
          <textarea
            id={sourceId}
            ref={textareaRef}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              // 源码变了，旧预览作废，避免插入与显示不一致
              setPreview("");
              setError("");
            }}
            rows={5}
            spellCheck={false}
            placeholder="[b]加粗[/b] [color=#e11d48]红色[/color] [url=https://example.com]链接[/url]"
            className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/10"
          />
          <p className="mt-2 text-xs text-slate-400">
            支持 [b] [i] [u] [s] [color] [size] [url] [quote] [spoiler] [code] [img]
          </p>

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">预览</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePreview}
                className="inline-flex min-w-[76px] items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
              >
                预览
              </button>
              <button
                type="button"
                onClick={handleInsert}
                disabled={!preview}
                className="inline-flex min-w-[88px] items-center justify-center rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                插入正文
              </button>
            </div>
          </div>

          <div className="mt-2 min-h-[120px] rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
            {preview ? (
              <div
                className="prose prose-sm prose-slate max-w-none break-words"
                // renderBBCode 内部已对文本做 HTML 转义、对 url / color / size 做白名单校验
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            ) : (
              <p className="text-xs text-slate-400">点击「预览」查看解析效果</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
