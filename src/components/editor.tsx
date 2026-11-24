// src/components/editor.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/components/language-provider";
import EmojiPicker from "@/components/emoji-picker";
import LinkPicker from "@/components/link-picker";
import { DEFAULT_LOCALE, loadLocaleData, translateText } from "@/lib/i18n";
import { renderBBCode } from "@/lib/bbcode";

// 弹窗只在打开时才用得到，单独拆成异步 chunk
const ImagePickerDropdown = dynamic(() => import("@/components/image-picker-dropdown"), {
  ssr: false,
});

type EditMode = "text" | "bbcode";

const PREVIEW_CLASS =
  "prose prose-slate max-w-none break-words " +
  "prose-headings:font-bold prose-headings:tracking-tight " +
  "prose-blockquote:border-l-4 prose-blockquote:border-brand-300 " +
  "prose-blockquote:bg-brand-50/50 prose-blockquote:py-1 prose-blockquote:not-italic " +
  "prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 " +
  "prose-code:before:content-none prose-code:after:content-none " +
  "prose-img:rounded-xl prose-img:border prose-img:border-slate-200";

/** 普通文本模式：全部当纯文本，只转义并保留换行 */
function toPlainHtml(src: string): string {
  return src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
}

function toHtml(src: string, mode: EditMode): string {
  return mode === "bbcode" ? renderBBCode(src) : toPlainHtml(src);
}

export default function Editor({
  content,
  onChange,
  placeholder,
  compact = false,
  collapsibleToolbar = false,
  contentClassName,
}: {
  content: string;
  /** 内容变化时回调，仍是 HTML（由 BBCode 实时渲染得到），上层存储与展示无需改动 */
  onChange: (html: string) => void;
  /** 占位文案 */
  placeholder?: string;
  /** 紧凑模式：更矮的编辑区与更小的内边距 */
  compact?: boolean;
  /** 工具栏默认隐藏，点击「格式」按钮展开 */
  collapsibleToolbar?: boolean;
  /** 追加到输入区的样式（如固定高度 + 内部滚动，避免内容增减时容器高度跳动） */
  contentClassName?: string;
}) {
  const { locale } = useLocale();

  // 词典按需加载：切到非简体中文时先拉取词典，再翻译占位文案
  const [translatedPlaceholder, setTranslatedPlaceholder] = useState("");
  useEffect(() => {
    if (!placeholder || locale === DEFAULT_LOCALE) return;
    let alive = true;
    void loadLocaleData(locale).then(() => {
      if (!alive) return;
      setTranslatedPlaceholder(translateText(placeholder, locale) ?? "");
    });
    return () => {
      alive = false;
    };
  }, [locale, placeholder]);

  const localizedPlaceholder =
    locale !== DEFAULT_LOCALE && translatedPlaceholder ? translatedPlaceholder : placeholder;

  // 输入区始终是纯文本，普通文本模式下不解析任何语法
  const [source, setSource] = useState(content);
  // 默认普通文本模式，可切换到 BBCode 模式使用 [b] 等标签
  const [mode, setMode] = useState<EditMode>("text");
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkInitialText, setLinkInitialText] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);
  const linkWrapRef = useRef<HTMLDivElement>(null);

  // 点击编辑器外的区域或按 Esc 关闭图片 / 表情 / 链接下拉
  useEffect(() => {
    if (!imagePickerOpen && !emojiPickerOpen && !linkPickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!imageWrapRef.current?.contains(target)) setImagePickerOpen(false);
      if (!emojiWrapRef.current?.contains(target)) setEmojiPickerOpen(false);
      if (!linkWrapRef.current?.contains(target)) setLinkPickerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setImagePickerOpen(false);
      setEmojiPickerOpen(false);
      setLinkPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [imagePickerOpen, emojiPickerOpen, linkPickerOpen]);

  /** 更新源码，同时按当前模式向上层输出 HTML，保证现有存储 / 展示逻辑不变 */
  const update = useCallback(
    (next: string) => {
      setSource(next);
      onChange(toHtml(next, mode));
    },
    [onChange, mode],
  );

  /** 切换模式时用同一份内容重新输出一次 */
  const switchMode = useCallback(
    (next: EditMode) => {
      setMode(next);
      // 回到普通文本时收起预览
      if (next === "text") setPreviewOpen(false);
      onChange(toHtml(source, next));
    },
    [source, onChange],
  );

  /** 在光标处插入片段；有选中内容时用 before/after 包住（wrapSelection=false 则直接替换选中） */
  const insert = useCallback(
    (before: string, after = "", wrapSelection = true) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = wrapSelection ? source.slice(start, end) : "";
      const text = before + selected + after;
      const caret = selected ? start + before.length + selected.length : start + before.length;

      textarea.focus();
      textarea.setSelectionRange(start, end);

      // 必须走浏览器的编辑管线插入：直接 setState 改 value 会清空原生撤销栈，
      // 导致点完工具栏按钮后 Ctrl+Z 无法回退
      let inserted = false;
      try {
        inserted = document.execCommand("insertText", false, text);
      } catch {
        inserted = false;
      }

      if (!inserted) {
        const next = source.slice(0, start) + text + source.slice(end);
        setSource(next);
        onChange(toHtml(next, mode));
      }

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    },
    [source, onChange, mode],
  );

  const wrap = useCallback((tag: string) => insert(`[${tag}]`, `[/${tag}]`), [insert]);

  const showToolbar = !collapsibleToolbar || toolbarOpen;

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white [[data-background=tohru]_&]:bg-transparent">
        {collapsibleToolbar && !showToolbar && (
          <div className="flex justify-end rounded-t-2xl px-2 py-1">
            <button
              type="button"
              onClick={() => setToolbarOpen(true)}
              aria-expanded={false}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <span aria-hidden="true" className="font-serif text-sm leading-none">
                Aa
              </span>
              格式
            </button>
          </div>
        )}

        {showToolbar && (
          <div className="flex flex-wrap items-center gap-1 rounded-t-2xl border-b border-slate-100 bg-slate-50/70 px-2 py-2">
            {mode === "bbcode" && (
              <>
                <ToolbarButton onClick={() => wrap("quote")} label="引用">
                  <IconQuote />
                </ToolbarButton>
                <ToolbarButton onClick={() => insert("[spoiler=标题]", "[/spoiler]")} label="折叠块">
                  <IconSpoiler />
                </ToolbarButton>

                <Divider />

                {/* 表情 */}
                <div ref={emojiWrapRef} className="relative">
                  <ToolbarButton
                    onClick={() => setEmojiPickerOpen((open) => !open)}
                    active={emojiPickerOpen}
                    label="表情"
                  >
                    <IconEmoji />
                  </ToolbarButton>
                  {emojiPickerOpen && (
                    <EmojiPicker onPick={(emoji) => insert(emoji, "")} />
                  )}
                </div>

                {/* 包裹一层相对定位容器，下拉面板以按钮为锚点 */}
                <div ref={imageWrapRef} className="relative">
                  <ToolbarButton
                    onClick={() => setImagePickerOpen((open) => !open)}
                    active={imagePickerOpen}
                    label="插入图片"
                  >
                    <IconImage />
                  </ToolbarButton>
                  {imagePickerOpen && (
                    <ImagePickerDropdown
                      onClose={() => setImagePickerOpen(false)}
                      onPick={(urls) => {
                        insert(urls.map((url) => `[img]${url}[/img]`).join("\n"));
                      }}
                    />
                  )}
                </div>

                {/* 插入链接 */}
                <div ref={linkWrapRef} className="relative">
                  <ToolbarButton
                    onClick={() => {
                      const textarea = textareaRef.current;
                      const selected = textarea
                        ? source.slice(textarea.selectionStart, textarea.selectionEnd)
                        : "";
                      setLinkInitialText(selected);
                      setLinkPickerOpen((open) => !open);
                    }}
                    active={linkPickerOpen}
                    label="插入链接"
                  >
                    <IconLink />
                  </ToolbarButton>
                  {linkPickerOpen && (
                    <LinkPicker
                      initialText={linkInitialText}
                      onClose={() => setLinkPickerOpen(false)}
                      onPick={(href, label) => {
                        insert(label ? `[url=${href}]${label}[/url]` : `[url]${href}[/url]`, "", false);
                        setLinkPickerOpen(false);
                      }}
                    />
                  )}
                </div>

                <Divider />

                <ToolbarButton
                  onClick={() => setPreviewOpen((open) => !open)}
                  active={previewOpen}
                  label="预览"
                >
                  <IconEye />
                </ToolbarButton>
              </>
            )}

            <div className="ml-auto flex items-center gap-1">
              {/* 普通文本 / BBCode 模式切换 */}
              <ToolbarButton
                onClick={() => switchMode(mode === "bbcode" ? "text" : "bbcode")}
                active={mode === "bbcode"}
                label={mode === "bbcode" ? "切换到普通文本" : "切换到 BBCode"}
              >
                <IconCode />
              </ToolbarButton>
              {collapsibleToolbar && (
                <button
                  type="button"
                  onClick={() => setToolbarOpen(false)}
                  aria-expanded={true}
                  aria-label="收起格式工具栏"
                  title="收起格式工具栏"
                  className="ml-1 grid size-8 place-items-center rounded-md text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900"
                >
                  <IconChevronUp />
                </button>
              )}
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={source}
          onChange={(e) => update(e.target.value)}
          placeholder={localizedPlaceholder}
          spellCheck={false}
          className={`w-full resize-none border-0 bg-transparent font-mono leading-relaxed text-slate-800 outline-none placeholder:font-sans placeholder:text-slate-400 ${
            compact ? "min-h-[140px] px-4 py-3 text-sm" : "min-h-[400px] px-5 py-4 text-sm"
          } ${contentClassName ?? ""} ${mode === "bbcode" && previewOpen ? "hidden" : "block"}`}
        />

        {/* 预览直接替换输入区，保持同样高度避免布局跳动 */}
        {mode === "bbcode" && previewOpen && (
          <div
            className={`overflow-y-auto ${
              compact ? "min-h-[140px] px-4 py-3 text-sm" : "min-h-[400px] px-5 py-4 text-sm"
            } ${contentClassName ?? ""}`}
          >
            <div
              className={PREVIEW_CLASS}
              // renderBBCode 内部已做 HTML 转义与 url / color / size 白名单校验
              dangerouslySetInnerHTML={{ __html: renderBBCode(source) }}
            />
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- 工具栏按钮 ---------- */
function ToolbarButton({
  children,
  active = false,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-sm transition ${
        active
          ? "bg-brand-600 text-white"
          : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-slate-200" />;
}

/* ---------- 图标 ---------- */
function IconChevronUp() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M5 12.5 10 7.5l5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M8 6H4.5A1.5 1.5 0 0 0 3 7.5v2A1.5 1.5 0 0 0 4.5 11H6v1.5A1.5 1.5 0 0 1 4.5 14H4M17 6h-3.5A1.5 1.5 0 0 0 12 7.5v2a1.5 1.5 0 0 0 1.5 1.5H15v1.5a1.5 1.5 0 0 1-1.5 1.5H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpoiler() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <rect
        x="3"
        y="5"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M3 12.5h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M7.5 8.5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconImage() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <rect
        x="3.5"
        y="4.5"
        width="13"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="7.5" cy="8" r="1.2" fill="currentColor" />
      <path
        d="m4.5 13.5 3.6-3.2a1 1 0 0 1 1.34.04l4.56 4.16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** 插入链接 */
function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 表情 */
function IconEmoji() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7.2 11.6a3.4 3.4 0 0 0 5.6 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="7.6" cy="8.2" r=".9" fill="currentColor" />
      <circle cx="12.4" cy="8.2" r=".9" fill="currentColor" />
    </svg>
  );
}

/** 模式切换图标：代码括号 </> */
function IconCode() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M5.5 6.5 2 10l3.5 3.5M14.5 6.5 18 10l-3.5 3.5M11.5 4.5l-3 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
