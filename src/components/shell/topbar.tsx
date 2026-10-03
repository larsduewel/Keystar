import { Radio } from "lucide-react";
import Link from "next/link";
import { CorpLogo } from "@/components/ui/eve-image";
import { isRecent } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import type { Settings } from "@/core/settings";
import { EveClock } from "./eve-clock";
import { LiveAlerts, type AlertOption } from "./live-alerts";
import { CurrentPageCrumb } from "./nav-link";
import { KeystarMark } from "./logo";

/** Docked top bar: KeyStar branding and breadcrumb on the left (corp / page), live EVE status on the right. */
export async function TopBar({
  homeCorp,
  serverStatus,
  demo,
  crumbs,
  alerts,
}: {
  homeCorp: { corporationId: number; name: string; ticker: string; memberCount: number | null } | null;
  serverStatus: Settings["eve.serverStatus"];
  demo: boolean;
  crumbs: { href: string; label: string; exact?: boolean }[];
  /** Live alerts the viewer may get (`availableAlerts`), with their text. */
  alerts: AlertOption[];
}) {
  const { t } = await getI18n();
  const fresh = serverStatus && isRecent(serverStatus.checkedAt, 15 * 60_000);
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-surface-contrast/[0.07] bg-space-950/70 px-6 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2.5 text-[0.84rem]">
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2.5 rounded-md">
          <KeystarMark className="size-7" />
          <span className="font-display text-[1.05rem] font-bold tracking-[0.2em] text-ink">KEYSTAR</span>
        </Link>
        {homeCorp ? (
          // Breadcrumb root: back to the dashboard.
          <Link href="/" className="group flex min-w-0 items-center gap-2 rounded-md">
            <CorpLogo id={homeCorp.corporationId} size={20} className="rounded" />
            <span className="truncate font-medium text-ink transition-colors group-hover:text-accent">{homeCorp.name}</span>
            <span className="rounded border border-surface-contrast/10 px-1.5 py-px font-mono text-3xs text-ink-2">
              {homeCorp.ticker}
            </span>
          </Link>
        ) : (
          <span className="text-ink-3">{t.shell.noHomeCorp}</span>
        )}
        <span className="text-ink-3">/</span>
        <CurrentPageCrumb items={crumbs} />
        {demo && (
          <span className="ml-1 rounded border border-gold/40 bg-gold/10 px-1.5 py-px font-mono text-3xs tracking-wider text-gold uppercase">
            {t.shell.demo}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {alerts.length > 0 && <LiveAlerts alerts={alerts} />}
        <div className="flex h-8 items-center gap-2 rounded-md border border-surface-contrast/[0.08] bg-surface-contrast/[0.03] px-3 text-xs">
          <Radio className={fresh ? "size-3.5 text-good-text" : "size-3.5 text-ink-3"} aria-hidden />
          <span className="text-ink-3">Tranquility</span>
          <span className="font-medium tabular-nums text-ink">
            {serverStatus ? t.shell.serverOnline(serverStatus.players) : t.common.unknown}
          </span>
        </div>
        <EveClock />
      </div>
    </header>
  );
}
