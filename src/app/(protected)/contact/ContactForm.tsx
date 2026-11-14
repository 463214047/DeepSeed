"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Send, TriangleAlert } from "lucide-react";
import Editor from "@/components/editor";

export default function ContactForm() {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<null | { ok: boolean; msg: string }>(null);
  const [toastVisible, setToastVisible] = useState(false);

  // 轻提醒：淡入弹出，停留后淡出
  useEffect(() => {
    if (!toast) {
      setToastVisible(false);
      return;
    }

    const duration = toast.ok ? 2400 : 3400;
    setToastVisible(false);
    // 双 rAF：确保初始（隐藏）状态真正绘制过一帧，过渡才有起点，否则会瞬间出现
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setToastVisible(true));
    });
    const hide = setTimeout(() => setToastVisible(false), duration);
    const clear = setTimeout(() => setToast(null), duration + 320);

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      clearTimeout(hide);
      clearTimeout(clear);
    };
  }, [toast]);

  // TipTap 空文档是 "<p></p>"，视为没有内容
  const trimmedBody = body.trim();
  const hasBody = trimmedBody.length > 0 && !/^<p>\s*<\/p>$/i.test(trimmedBody);

  async function submit() {
    if (!hasBody) return setToast({ ok: false, msg: "请填写内容" });

    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAdmin: true, content: trimmedBody }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ ok: true, msg: "已送达，管理会尽快处理。" });
        // 发送成功后保留编辑内容，方便用户继续补充或复制
      } else {
        setToast({ ok: false, msg: data.message ?? "发送失败" });
      }
    } catch {
      setToast({ ok: false, msg: "网络错误，请稍后重试" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Editor
        content={body}
        onChange={setBody}
        compact
        placeholder="请描述你的问题…"
        contentClassName="h-[300px] overflow-y-auto"
      />

      {/* 轻提醒 — 挂到 body，避免被父级 transform / backdrop-filter 影响而抖动 */}
      {toast &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className={`dsToast pointer-events-none fixed left-1/2 top-20 z-[100] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl px-6 py-3.5 text-sm font-semibold text-white ring-1 ring-white/25 transition-[opacity,translate] duration-300 ease-out ${
              toast.ok
                ? "bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 shadow-[0_16px_40px_-10px_var(--brand-500)]"
                : "bg-gradient-to-r from-brand-600 via-brand-700 to-brand-800 shadow-[0_16px_40px_-10px_var(--brand-700)]"
            } ${toastVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/25">
              {toast.ok ? (
                <Check className="size-4" strokeWidth={3} />
              ) : (
                <TriangleAlert className="size-4" strokeWidth={2.4} />
              )}
            </span>
            {toast.msg}
          </div>,
          document.body,
        )}

      {/* 底部按钮 */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !hasBody}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" strokeWidth={1.8} />
          {submitting ? "发送中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
