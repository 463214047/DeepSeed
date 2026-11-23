"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;

function isImageUrl(value: string): boolean {
  return /^https?:\/\/[^\s"<>]+$/i.test(value) || /^\/uploads\/[^\s"<>]+$/i.test(value);
}

/**
 * 插入图片下拉面板：链接输入 + 点击/拖拽上传，选中即上传并插入，不再弹窗。
 */
export default function ImagePickerDropdown({
  onClose,
  onPick,
}: {
  onClose: () => void;
  /** 返回最终图片地址（可多张） */
  onPick: (urls: string[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    if (busy) return;

    const picked = files.slice(0, MAX_FILES);
    const overLimit = files.length > MAX_FILES ? `最多 ${MAX_FILES} 张，已忽略多余的图片` : "";

    const valid: File[] = [];
    let nextError = "";
    for (const file of picked) {
      if (!IMAGE_TYPES.has(file.type)) {
        nextError = nextError || "仅支持 JPG / PNG / WebP";
        continue;
      }
      if (file.size > MAX_BYTES) {
        nextError = nextError || "单张图片不能超过 5MB";
        continue;
      }
      valid.push(file);
    }

    if (valid.length === 0) {
      setError(nextError || overLimit);
      return;
    }

    setBusy(true);
    setError(nextError || overLimit);
    try {
      const urls: string[] = [];
      for (const file of valid) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload?kind=screenshot", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          url?: string;
        };
        if (!res.ok || !data.ok || !data.url) {
          setError(data.message ?? `「${file.name}」上传失败`);
          setBusy(false);
          return;
        }
        urls.push(data.url);
      }
      onPick(urls);
      onClose();
    } catch {
      setError("上传失败，请稍后重试");
      setBusy(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (incoming.length > 0) void upload(incoming);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const incoming = Array.from(e.dataTransfer.files ?? []);
    if (incoming.length > 0) void upload(incoming);
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const link = url.trim();
    if (!link) return;
    if (!isImageUrl(link)) {
      setError("请输入 http(s) 图片链接");
      return;
    }
    onPick([link]);
    onClose();
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute left-0 top-[calc(100%+6px)] z-30 w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10"
    >
      <form onSubmit={submitUrl} className="flex items-center gap-2">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder="粘贴图片链接..."
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/10 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="h-9 shrink-0 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          插入
        </button>
      </form>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(e) => {
          const nextTarget = e.relatedTarget;
          if (!(nextTarget instanceof Node) || !e.currentTarget.contains(nextTarget)) {
            setDragging(false);
          }
        }}
        onDrop={handleDrop}
        className={`mt-3 flex min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition ${
          dragging
            ? "border-brand-400 bg-brand-50/60"
            : "border-slate-300 bg-white hover:border-brand-300 hover:bg-slate-50/60"
        } ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          multiple
          onChange={handleFileInput}
          disabled={busy}
          className="sr-only"
        />
        <ImageIcon className="size-7 text-brand-500" strokeWidth={1.6} />
        <span className="text-sm text-brand-600">
          {busy ? "上传中…" : "点击选择或拖拽图片（可多张）"}
        </span>
        <span className="text-xs text-slate-400">点击或拖拽到此 · 可多选</span>
      </label>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
