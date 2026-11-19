"use client";

import dynamic from "next/dynamic";
import EditorSkeleton from "@/components/editor-skeleton";

/**
 * TipTap + ProseMirror 体积较大，统一异步加载，
 * 避免编辑器代码拖慢所在页面首屏；骨架屏与编辑器同尺寸，防止加载完成后布局跳动。
 */
const Editor = dynamic(() => import("@/components/editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

export const CompactEditor = dynamic(() => import("@/components/editor"), {
  ssr: false,
  loading: () => <EditorSkeleton compact />,
});

export default Editor;
