import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Glass } from "./glass";

// Client component (needs the viewer's language); re-exported so pages keep importing it from here.
export { Delta } from "./delta";

/** Minimal sparkline: de-emphasis line with the latest point in the accent. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 160;
  const h = 40;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-10 w-40 overflow-visible", className)} aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} className="fill-accent/8" />
      <path d={d} fill="none" stroke="var(--sparkline)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} strokeWidth={2} className="fill-accent stroke-(--chart-surface)" />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  hint,
  hero = false,
  trend,
  icon: Icon,
  href,
  active,
  title,
  className,
}: {
  label: string;
  value: string;
  /** Unit rendered smaller next to the value (e.g. "ISK", "m³"). */
  unit?: string;
  delta?: ReactNode;
  hint?: ReactNode;
  hero?: boolean;
  trend?: number[];
  icon?: LucideIcon;
  /** Makes the whole tile a link to the page behind the number. */
  href?: string;
  /**
   * For tiles that filter the page they sit on (set on every such tile): marks
   * the applied filter and keeps the scroll position.
   */
  active?: boolean;
  title?: string;
  className?: string;
}) {
  const classes = cn("flex flex-col gap-3 px-5 py-4", href && "glass-link group", className);
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-surface-contrast/[0.08] bg-surface-contrast/[0.03]">
            <Icon className="size-3.5 text-ink-2" aria-hidden />
          </span>
        )}
        <div className="eve-label text-2xs text-ink-3">{label}</div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div
          className={cn(
            "leading-none font-semibold tracking-tight whitespace-nowrap text-ink",
            // Smaller on phones, where two tiles share a row.
            hero ? "text-[3.25rem] max-sm:text-[2.25rem]" : "text-[1.75rem] max-sm:text-[1.3rem]",
          )}
        >
          {value}
          {unit && <span className={cn("ml-1.5 font-medium text-ink-2", hero ? "text-2xl" : "text-base")}>{unit}</span>}
        </div>
        {trend && <Sparkline values={trend} className="mb-1 hidden xl:block" />}
      </div>
      {/* Pinned to the bottom so values stay aligned across a row when a hint wraps. */}
      <div className="mt-auto flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1">
        {delta}
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
        {href && <ArrowRight className="ml-auto size-4 shrink-0 text-ink-3 transition-colors group-hover:text-accent" aria-hidden />}
      </div>
    </>
  );
  return href ? (
    <Glass
      as={Link}
      href={href}
      scroll={active === undefined ? undefined : false}
      aria-current={active ? "true" : undefined}
      title={title}
      className={classes}
    >
      {body}
    </Glass>
  ) : (
    <Glass className={classes}>{body}</Glass>
  );
}
