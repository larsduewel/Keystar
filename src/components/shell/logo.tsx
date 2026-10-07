import { useId } from "react";
import { cn } from "@/lib/utils";

/** Keystar mark: a four-point star set in a keystone. Gradient ids are per instance, so several marks can share a page. */
export function KeystarMark({ className }: { className?: string }) {
  const id = useId();
  const stone = `${id}stone`;
  const star = `${id}star`;
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id={stone} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fd6ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#2f6fb5" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={star} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2d1" />
          <stop offset="0.55" stopColor="#f2b950" />
          <stop offset="1" stopColor="#c47f1c" />
        </linearGradient>
      </defs>
      <path d="M10 6h28l6 36H4z" fill={`url(#${stone})`} stroke="rgba(190,230,255,0.6)" strokeWidth="1.2" strokeLinejoin="round" />
      <path
        d="M24 11 L27.2 21.8 L38 25 L27.2 28.2 L24 39 L20.8 28.2 L10 25 L20.8 21.8 Z"
        fill={`url(#${star})`}
        style={{ filter: "drop-shadow(0 0 6px rgba(242,185,80,0.65))" }}
      />
    </svg>
  );
}

export function KeystarWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <KeystarMark />
      <div className="leading-none">
        <div className="font-display text-[1.35rem] font-bold tracking-[0.18em] text-ink">KEYSTAR</div>
        <div className="mt-0.5 text-3xs tracking-[0.22em] text-ink-3 uppercase">Corporation Command</div>
      </div>
    </div>
  );
}
