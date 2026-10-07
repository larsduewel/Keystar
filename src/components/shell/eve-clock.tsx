"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

/** EVE time is UTC. */
export function EveClock() {
  const { t } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Set on the client only (avoids a server/client hydration mismatch).
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000 * 15);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const time = now ? now.toISOString().slice(11, 16) : "--:--";
  return (
    <div
      className="flex h-8 items-center gap-2 rounded-md border border-surface-contrast/[0.08] bg-surface-contrast/[0.03] px-3 text-xs"
      title={t.shell.eveTime}
    >
      <Clock3 className="size-3.5 text-accent" aria-hidden />
      <span className="eve-label text-2xs text-ink-3 max-sm:hidden">EVE</span>
      <span className="font-mono font-medium tabular-nums text-ink">{time}</span>
    </div>
  );
}
