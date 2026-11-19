"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 站内路由顶部进度条
 *
 * Next.js 客户端路由不会触发浏览器加载，页面切换没有原生反馈，
 * 这里在点击站内链接时开始走进度，URL 变化后收尾。
 * 进度用 requestAnimationFrame 匀速推进，避免定时器跳跃造成的顿挫感。
 */
export default function RouteProgress() {
  const [visible, setVisible] = useState(false);

  const barRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(false);
  const startHrefRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const setWidth = (w: number) => {
      if (barRef.current) barRef.current.style.width = `${w}%`;
    };

    const clearTimers = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (hideRef.current !== null) {
        clearTimeout(hideRef.current);
        hideRef.current = null;
      }
    };

    const finish = () => {
      clearTimers();
      activeRef.current = false;
      // 直接补满再淡出
      setWidth(100);
      hideRef.current = setTimeout(() => {
        setVisible(false);
        hideRef.current = setTimeout(() => setWidth(0), 200);
      }, 200);
    };

    const start = () => {
      if (activeRef.current) return;
      activeRef.current = true;
      startHrefRef.current = window.location.pathname + window.location.search;

      if (hideRef.current !== null) {
        clearTimeout(hideRef.current);
        hideRef.current = null;
      }

      setVisible(true);
      setWidth(8);

      // 先快后慢且永不停止：起步冲得快，之后按指数曲线无限逼近 99%，
      // 只要路由还没完成就一直在缓缓推进，不会卡在某个固定数值上
      let startTs = 0;
      const tick = (ts: number) => {
        if (!startTs) startTs = ts;
        const elapsed = ts - startTs;
        const eased = 1 - Math.exp(-elapsed / 1500);
        setWidth(8 + 91 * eased);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      // URL 变化即视为路由完成
      // 注：不能用 popstate 作为起点 —— 浏览器前进/后退时 popstate 触发时 URL 已经变了，
      // 记录的起始地址就是目标地址，永远等不到变化，进度条会卡在缓动上限直到兜底超时
      const startedAt = Date.now();
      pollRef.current = setInterval(() => {
        const href = window.location.pathname + window.location.search;
        if (href !== startHrefRef.current) {
          finish();
          return;
        }
        // 兜底：链接被拦截/跳回同一地址/出错时不会永远挂着，8 秒后直接补满
        if (Date.now() - startedAt > 8000) finish();
      }, 120);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      // 同页锚点、同地址（含查询串）不触发
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      start();
    };

    // 前进/后退由浏览器与 Router Cache 直接完成，不再起进度条；
    // 若此时正好有一个点击触发的进度在跑，直接收尾避免卡住
    const onPopState = () => {
      if (activeRef.current) finish();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        ref={barRef}
        className="h-full rounded-r-full bg-gradient-to-r from-brand-600 via-brand-500 to-brand-400"
        style={{ width: "0%" }}
      />
    </div>
  );
}
