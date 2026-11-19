"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Languages, Palette } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { THEMES } from "@/lib/themes";
import { translateText } from "@/lib/i18n";

/**
 * 登录/注册等未登录页面的语言与外观切换
 * 固定在页面右上角，选择后立即生效并写入 Cookie
 */
export default function AuthPreferences() {
  const { locale, setLocale, locales } = useLocale();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState<"locale" | "theme" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const localeLabel = translateText("语言", locale) ?? "语言";
  const themeLabel = translateText("外观", locale) ?? "外观";

  const triggerClass =
    "grid size-9 place-items-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:text-slate-900";

  return (
    <div ref={ref} className="fixed right-4 top-4 z-30 flex items-center gap-2">
      {/* 语言 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => (v === "locale" ? null : "locale"))}
          aria-label={localeLabel}
          aria-haspopup="menu"
          aria-expanded={open === "locale"}
          title={localeLabel}
          className={triggerClass}
        >
          <Languages className="size-4" strokeWidth={1.8} />
        </button>
        {open === "locale" && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            {locales.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === locale}
                data-no-translate
                onClick={() => {
                  setLocale(item.id);
                  setOpen(null);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition hover:bg-slate-50 ${
                  item.id === locale ? "font-medium text-brand-600" : "text-slate-600"
                }`}
              >
                {item.label}
                {item.id === locale && <Check className="size-4" strokeWidth={2.4} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 外观 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => (v === "theme" ? null : "theme"))}
          aria-label={themeLabel}
          aria-haspopup="menu"
          aria-expanded={open === "theme"}
          title={themeLabel}
          className={triggerClass}
        >
          <Palette className="size-4" strokeWidth={1.8} />
        </button>
        {open === "theme" && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === theme}
                onClick={() => {
                  setTheme(item.id);
                  setOpen(null);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-slate-50 ${
                  item.id === theme ? "font-medium text-brand-600" : "text-slate-600"
                }`}
              >
                <span
                  aria-hidden
                  className={`size-4 shrink-0 rounded-full bg-gradient-to-br ${item.swatch}`}
                />
                <span className="flex-1 text-left">
                  {translateText(item.label, locale) ?? item.label}
                </span>
                {item.id === theme && <Check className="size-4" strokeWidth={2.4} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
