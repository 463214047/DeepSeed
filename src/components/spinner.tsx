"use client";

import { useEffect, useRef, useState } from "react";

/** 加载旋转图标 — requestAnimationFrame 驱动，不依赖 CSS keyframes */
export function Spinner({ className = "size-4" }: { className?: string }) {
  const [rot, setRot] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // 1 秒一圈 = 360°/1000ms
      setRot((r) => (r + dt * 0.36) % 360);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ transform: `rotate(${rot}deg)` }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity={0.25} />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity={0.75}
      />
    </svg>
  );
}
