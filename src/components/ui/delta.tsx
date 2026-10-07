"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Signed change vs a named period; colour = direction × "up is good", always with an arrow. */
export function Delta({ value, period, upIsGood = true }: { value: number | null; period: string; upIsGood?: boolean }) {
  const { t, f } = useI18n();
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-xs text-ink-3">{t.common.delta.noData(period)}</span>;
  }
  const flat = Math.abs(value) < 0.005;
  const good = flat ? null : value > 0 === upIsGood;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs max-sm:flex-wrap">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold tabular-nums",
          good === null ? "text-ink-2" : good ? "text-good-text" : "text-critical-text",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {value > 0 ? "+" : ""}
        {f.percent(value, 1)}
      </span>
      <span className="text-ink-3 whitespace-nowrap">{t.common.delta.vs(period)}</span>
    </span>
  );
}

/** Compact signed chip for table cells, e.g. "+18" / "+1.234". */
export function DeltaChip({ value, upIsGood = true }: { value: number; upIsGood?: boolean }) {
  const { f } = useI18n();
  if (!value) return <span className="text-ink-3">—</span>;
  const good = value > 0 === upIsGood;
  return (
    <span
      className={cn(
        "inline-flex min-w-8 justify-center rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums ring-1 ring-inset",
        good ? "bg-good/15 text-good-text ring-good/30" : "bg-critical/15 text-critical-text ring-critical/30",
      )}
    >
      {value > 0 ? "+" : "−"}
      {f.integer(Math.abs(value))}
    </span>
  );
}
