/**
 * 编辑器骨架屏
 *
 * 结构与真实编辑器保持一致（工具栏 32px 按钮 + 同高度编辑区），
 * 用于异步加载、编辑器实例创建前的占位，避免高度变化引起页面元素跳动。
 */
export default function EditorSkeleton({
  compact,
  contentClassName,
}: {
  compact?: boolean;
  contentClassName?: string;
}) {
  const contentHeight = contentClassName ?? (compact ? "min-h-[140px]" : "min-h-[400px]");

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white [[data-background=tohru]_&]:bg-transparent">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-2 py-2">
        {Array.from({ length: compact ? 3 : 4 }).map((_, i) => (
          <span key={i} className="h-8 min-w-8 animate-pulse rounded-md bg-slate-200/70" />
        ))}
      </div>
      <div className={`animate-pulse bg-slate-50/60 ${contentHeight}`} />
    </div>
  );
}
