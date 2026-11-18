"use client";

import dynamic from "next/dynamic";

/**
 * TipTap + ProseMirror 体积较大，统一异步加载，
 * 避免编辑器代码拖慢所在页面首屏；骨架屏与编辑器同尺寸，防止加载完成后布局跳动。
 */
const Editor = dynamic(() => import("@/components/editor"), {
  ssr: false,
  loading: () => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex h-11 items-center gap-2 border-b border-slate-100 px-3">
        <span className="size-6 animate-pulse rounded bg-slate-100" />
        <span className="size-6 animate-pulse rounded bg-slate-100" />
        <span className="size-6 animate-pulse rounded bg-slate-100" />
        <span className="size-6 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="h-[400px] animate-pulse bg-slate-50/60" />
    </div>
  ),
});

export const CompactEditor = dynamic(() => import("@/components/editor"), {
  ssr: false,
  loading: () => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex h-10 items-center gap-2 border-b border-slate-100 px-3">
        <span className="size-6 animate-pulse rounded bg-slate-100" />
        <span className="size-6 animate-pulse rounded bg-slate-100" />
        <span className="size-6 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="h-[140px] animate-pulse bg-slate-50/60" />
    </div>
  ),
});

export default Editor;
