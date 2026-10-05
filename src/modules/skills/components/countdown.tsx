"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { durationParts } from "../queue";

/**
 * Time left until `until`, in game style ("3d 4h 12m"). Renders with the server's `now` (so hydration matches), then
 * follows the viewer's clock every 30 seconds.
 */
export function Countdown({ until, now, className }: { until: string; now: string; className?: string }) {
  const { t } = useI18n();
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
  return <span className={className}>{t.skills.duration(durationParts(new Date(until).getTime() - current))}</span>;
}
