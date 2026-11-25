"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Check, Send, TriangleAlert } from "lucide-react";
import Editor from "@/components/editor";
import { Spinner } from "@/components/spinner";

export default function ContactForm() {
  const router = useRouter();
  const [body, setBody] = useState("");
  /** 发送成功后自增，靠 key 重挂编辑器来清空内部输入状态 */
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<null | { ok: boolean; msg: string }>(null);
  const [toastVisible, setToastVisible] = useState(false);

  // 轻提醒：淡入弹出，停留后淡出
  useEffect(() => {
    if (!toast) {
      // 关闭前已经先隐藏过，这里无需再 setState
      return;
    }

    const duration = toast.ok ? 2400 : 3400;
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
      const res = await fetch("/api/contact-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmedBody }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ ok: true, msg: "已提交，管理员会尽快处理。" });
        // 发送成功即清空，避免误以为没发出去而重复提交
        setBody("");
        setEditorKey((key) => key + 1);
        // 刷新服务端渲染的「我的反馈」列表
        router.refresh();
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
        key={editorKey}
        content={body}
        onChange={setBody}
        compact
 
        contentClassName="h-[300px] overflow-y-auto"
      />

      {/* 轻提醒 — 挂到 body，避免被父级 transform / backdrop-filter 影响而抖动 */}
      {toast &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className={`dsToast pointer-events-none fixed left-1/2 top-20 z-[100] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-[0_12px_32px_-10px_rgba(15,23,42,0.25)] transition-[opacity,translate] duration-300 ease-out ${
              toast.ok ? "border-emerald-200/70" : "border-red-200/70"
            } ${toastVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full ${
                toast.ok ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
              }`}
            >
              {toast.ok ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                <TriangleAlert className="size-3.5" strokeWidth={2.4} />
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
          className="flex min-w-28 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Spinner /> : <Send className="size-4" strokeWidth={1.8} />}
          {submitting ? "发送中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
