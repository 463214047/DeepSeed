"use client";

import { useRef, useState } from "react";
import { CircleCheck, ImagePlus } from "lucide-react";
import { compressImage } from "@/lib/image-compress";

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
/** 原图上限（压缩前），手机原图常见 5~15MB */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** 压缩后的实际上限，与服务端一致 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;

type Item = {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  url?: string;
  message?: string;
};

function isImageUrl(value: string): boolean {
  return /^https?:\/\/[^\s"<>]+$/i.test(value) || /^\/uploads\/[^\s"<>]+$/i.test(value);
}

/** 用 XHR 上传以获得真实的进度百分比 */
function uploadWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ ok?: boolean; url?: string; message?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload?kind=screenshot");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ ok: false, message: "上传失败" });
      }
    };
    xhr.onerror = () => resolve({ ok: false, message: "网络错误，上传失败" });
    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

/**
 * 插入图片下拉面板：链接输入 + 点击/拖拽上传。
 * 上传中的文件逐条显示进度，完成后打勾，点「确认」一次性插入。
 */
export default function ImagePickerDropdown({
  onClose,
  onPick,
  maxFiles = MAX_FILES,
  inline = false,
}: {
  onClose: () => void;
  /** 返回最终图片地址（可多张） */
  onPick: (urls: string[]) => void;
  /** 单次最多可插入张数，默认 5 */
  maxFiles?: number;
  /** 常驻面板（不悬浮、不自动关闭），用于发布页等固定区域 */
  inline?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploading = items.some((item) => item.status === "uploading");
  const doneUrls = items.flatMap((item) =>
    item.status === "done" && item.url ? [item.url] : [],
  );

  function patch(id: string, next: Partial<Item>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }

  async function addFiles(files: File[]) {
    const remaining = maxFiles - items.length;
    if (remaining <= 0) {
      setError(`最多 ${maxFiles} 张`);
      return;
    }

    const picked = files.slice(0, remaining);
    const overLimit = files.length > remaining ? `最多 ${maxFiles} 张，已忽略多余的图片` : "";

    const accepted: File[] = [];
    let nextError = "";
    for (const file of picked) {
      if (!IMAGE_TYPES.has(file.type)) {
        nextError = nextError || "仅支持 JPG / PNG / WebP";
        continue;
      }
      if (file.size > MAX_SOURCE_BYTES) {
        nextError = nextError || "单张原图不能超过 20MB";
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) {
      setError(nextError || overLimit);
      return;
    }
    setError(nextError || overLimit);

    const created: Item[] = accepted.map((file, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      progress: 0,
      status: "uploading",
    }));
    setItems((prev) => [...prev, ...created]);

    for (let i = 0; i < accepted.length; i++) {
      const { id } = created[i];
      const file = accepted[i];
      // 上传前在本地压成 WebP：长边 2560、质量 0.85
      const compressed = await compressImage(file, { maxEdge: 2560, quality: 0.85 });
      // 压缩失败会原样返回，这时再按服务端的 5MB 上限兜底
      if (compressed.size > MAX_UPLOAD_BYTES) {
        patch(id, { status: "error", message: "压缩后仍超过 5MB" });
        continue;
      }
      const res = await uploadWithProgress(compressed, (percent) => patch(id, { progress: percent }));
      if (!res.ok || !res.url) {
        patch(id, { status: "error", message: res.message ?? "上传失败" });
        continue;
      }
      patch(id, { status: "done", progress: 100, url: res.url });
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (incoming.length > 0) void addFiles(incoming);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const incoming = Array.from(e.dataTransfer.files ?? []);
    if (incoming.length > 0) void addFiles(incoming);
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    const link = url.trim();
    if (!link) return;
    if (!isImageUrl(link)) {
      setError("请输入 http(s) 图片链接");
      return;
    }
    onPick([link]);
    if (inline) {
      setUrl("");
      setError("");
    } else {
      onClose();
    }
  }

  function confirm() {
    if (doneUrls.length === 0) return;
    onPick(doneUrls);
    if (inline) {
      // 常驻面板：插入后清空本次上传记录，继续等待下一批
      setItems([]);
    } else {
      onClose();
    }
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className={
        inline
          ? "w-full rounded-xl border border-slate-200 bg-white p-3"
          : "absolute left-0 top-[calc(100%+6px)] z-30 w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10"
      }
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
          autoComplete="off"
          spellCheck={false}
          placeholder="粘贴图片链接..."
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/10"
        />
        <button
          type="submit"
          disabled={!url.trim()}
          className="h-9 shrink-0 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          插入
        </button>
      </form>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          const nextTarget = e.relatedTarget;
          if (!(nextTarget instanceof Node) || !e.currentTarget.contains(nextTarget)) {
            setDragging(false);
          }
        }}
        onDrop={handleDrop}
        className={`group mt-3 flex min-h-[110px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition ${
          dragging
            ? "border-brand-400 bg-brand-50/60"
            : "border-slate-300 bg-white hover:border-brand-300 hover:bg-slate-50/60"
        } cursor-pointer`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          multiple
          onChange={handleFileInput}
          className="sr-only"
        />
        <ImagePlus
          className="size-7 text-slate-400 transition-colors group-hover:text-brand-500"
          strokeWidth={1.6}
        />
        <span className="text-sm text-slate-600 transition-colors group-hover:text-brand-600">
          点击选择或拖拽图片
        </span>
      </label>

      {items.length > 0 && (
        <ul className="mt-3 max-h-[200px] space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                  {item.name}
                </span>
                {item.status === "done" && (
                  <CircleCheck className="size-4 shrink-0 text-emerald-500" strokeWidth={2} />
                )}
                {item.status === "error" && (
                  <span className="shrink-0 text-[11px] text-red-500">失败</span>
                )}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${
                    item.status === "error" ? "bg-red-400" : "bg-emerald-500"
                  }`}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              {item.message && (
                <p className="mt-0.5 text-[11px] text-red-500">{item.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
          {error}
        </p>
      )}

      {/* 全部上传结束后才出现确认按钮 */}
      {items.length > 0 && !uploading && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={confirm}
            disabled={doneUrls.length === 0}
            className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            确认
          </button>
        </div>
      )}
    </div>
  );
}
