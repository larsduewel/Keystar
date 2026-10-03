"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { validBrowserStats } from "../browser-stats";
import type { ScanProgress } from "../scans";

const MAX_POLL_MS = 20 * 60_000;

const busy = (p: ScanProgress["pending"]) => p.stats + p.newest + p.deeper > 0;

/**
 * Keeps a scan page current while the worker reads zKillboard: polls a small
 * progress endpoint (faster while statistics are pending) and refreshes the
 * server-rendered page only when something changed.
 */
type BrowserPreview = { kills: number; losses: number };
const LoadingContext = createContext<{ busy: boolean; pilots: number[]; previews: Record<number, BrowserPreview> }>({ busy: false, pilots: [], previews: {} });

export function IntelLoadingOverlay({ pilotId, showPreview = false }: { pilotId?: number; showPreview?: boolean }) {
  const progress = useContext(LoadingContext);
  const loading = pilotId === undefined ? progress.busy : progress.pilots.includes(pilotId);
  const { t, f } = useI18n();
  const preview = showPreview && pilotId !== undefined ? progress.previews[pilotId] : undefined;
  if (!loading) return null;
  return <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-space-900/60 backdrop-blur-[1px]" role="status">
    <LoaderCircle className="size-5 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
    {preview && <p className="px-3 text-center text-3xs text-ink-2">{t.intel.pilotPage.browserPreview(f.integer(preview.kills), f.integer(preview.losses))}</p>}
    <span className="sr-only">{t.intel.pilotPage.loading}</span>
  </div>;
}

export function ScanProgressPoller({ scanId, initial, children }: { scanId: string; initial: ScanProgress; children: ReactNode }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [previews, setPreviews] = useState<Record<number, BrowserPreview>>({});
  const [, startTransition] = useTransition();
  const version = useRef(initial.version);
  const pending = useRef(initial.pending);
  const browserAttempted = useRef(new Set<number>());
  const done = initial.status === "ready" && !busy(initial.pending);
  const [stopped, setStopped] = useState(done);

  useEffect(() => {
    if (stopped) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const controller = new AbortController();
    const browserQueue: number[] = [];
    let active = 0;
    let eligible = new Set<number>();
    let pausedUntil = 0;
    const browserTimer = setInterval(() => {
      if (cancelled || document.visibilityState !== "visible" || active >= 4 || Date.now() < pausedUntil) return;
      const characterId = browserQueue.shift();
      if (!characterId) return;
      active++;
      fetch(`https://zkillboard.com/api/stats/characterID/${characterId}/kills/`, { signal: controller.signal })
        .then(async response => {
          if (response.status === 429 || response.status >= 500) {
            const seconds = Number(response.headers.get("Retry-After"));
            pausedUntil = Date.now() + Math.max(30_000, Number.isFinite(seconds) ? seconds * 1000 : 0);
            return;
          }
          if (!response.ok) return;
          const stats = await response.json();
          if (cancelled) return;
          // Private, ephemeral preview only: never upload browser data.
          if (eligible.has(characterId) && validBrowserStats(characterId, stats)) {
            setPreviews(previous => ({ ...previous, [characterId]: { kills: Number(stats.shipsDestroyed), losses: Number(stats.shipsLost) } }));
          }
        }).catch(() => { /* Worker remains the fallback for blocked CORS or failed requests. */ })
        .finally(() => { active--; });
    }, 100);
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/intel/scans/${scanId}`, { cache: "no-store" });
          if (res.ok) {
            const next = (await res.json()) as ScanProgress;
            eligible = new Set(next.browserStats ?? []);
            // Worker-verified statistics supersede browser previews.
            setPreviews(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => eligible.has(Number(id)))));
            for (const id of next.browserStats ?? []) {
              if (!browserAttempted.current.has(id)) { browserAttempted.current.add(id); browserQueue.push(id); }
            }
            pending.current = next.pending;
            setProgress(next);
            if (next.version !== version.current) {
              version.current = next.version;
              startTransition(() => router.refresh());
            }
            if (next.status === "ready" && !busy(next.pending)) {
              setStopped(true);
              return;
            }
          }
        } catch {
          // Network hiccup: try again on the next tick.
        }
      }
      if (Date.now() - started > MAX_POLL_MS) {
        setStopped(true);
        return;
      }
      const p = pending.current;
      timer = setTimeout(tick, p.stats ? 2000 : p.newest ? 4000 : 10_000);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(browserTimer);
      controller.abort();
    };
  }, [scanId, stopped, router]);

  return <LoadingContext.Provider value={{ busy: busy(progress.pending), pilots: progress.pendingPilots, previews }}>{children}</LoadingContext.Provider>;
}
