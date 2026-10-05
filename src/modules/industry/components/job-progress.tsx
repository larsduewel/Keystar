"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { durationParts, jobProgress, type JobStatus } from "../activities";

/**
 * Progress bar and time left of one job. Renders with the server's `now` (so hydration matches), then follows the
 * viewer's clock every 30 seconds, so a job that finishes while the page is open turns "ready" on its own.
 */
export function JobProgress({
  status,
  start,
  end,
  pause,
  now,
}: {
  status: JobStatus;
  start: string;
  end: string;
  pause: string | null;
  now: string;
}) {
  const { t } = useI18n();
  const m = t.industry;
  const [current, setCurrent] = useState(() => new Date(now).getTime());
  useEffect(() => {
    const tick = () => setCurrent(Date.now());
    const timer = setInterval(tick, 30_000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);

  const p = jobProgress(
    { status, startDate: new Date(start), endDate: new Date(end), pauseDate: pause ? new Date(pause) : null },
    new Date(current),
  );
  const pct = Math.round(p.fraction * 100);
  return (
    <div className="min-w-36 space-y-1">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span
          className={cn(
            "font-medium",
            p.phase === "ready" && "text-good-text",
            p.phase === "ending-soon" && "text-warning",
            p.phase === "paused" && "text-ink-3",
            p.phase === "finished" && "text-ink-3",
          )}
        >
          {p.remainingMs !== null ? m.duration(durationParts(p.remainingMs)) : m.phases[p.phase]}
        </span>
        <span className="tabular-nums text-ink-3">{pct}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-contrast/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={m.table.progress}
      >
        <div
          className={cn(
            "h-full rounded-full",
            p.phase === "ready" ? "bg-good" : p.phase === "ending-soon" ? "bg-warning" : p.phase === "finished" || p.phase === "paused" ? "bg-ink-3/50" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
