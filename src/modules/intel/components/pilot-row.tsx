import Link from "next/link";
import { Info, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Portrait } from "@/components/ui/eve-image";
import { getI18n } from "@/i18n/server";
import { zkillAlliance, zkillCharacter, zkillCorporation } from "@/modules/killboard/links";
import type { DisplayNames } from "../names";
import type { ScanPilot } from "../scans";
import type { PilotHistory, PilotProfile, PilotScore, Standing } from "../types";
import { PilotEvidence } from "./pilot-evidence";
import { LatestKills } from "./latest-kills";
import { IntelLoadingOverlay } from "./scan-progress";
import { ScoreBadge } from "./score";
import { StandingBadge } from "./standing-badge";

export async function HistoryChip({ history }: { history: PilotHistory | null }) {
  if (!history || history.killsOnUs + history.lossesToUs === 0) return null;
  const { t, f } = await getI18n();
  const parts = [];
  if (history.killsOnUs) parts.push(t.intel.pilot.onOurLosses(history.killsOnUs));
  if (history.lossesToUs) parts.push(t.intel.pilot.diedToUs(history.lossesToUs));
  return (
    <span title={t.intel.pilot.lastFought(f.relativeTime(history.lastAt))}>
      <Badge tone={history.killsOnUs ? "warning" : "neutral"}>
        <Swords className="size-3" aria-hidden />
        {parts.join(" · ")}
      </Badge>
    </span>
  );
}

async function ProfileStatus({ pilot }: { pilot: ScanPilot }) {
  const { t } = await getI18n();
  const p = t.intel.pilot;
  if (!pilot.profiled) return <span className="text-xs text-ink-3">{p.notProfiled}</span>;
  if (pilot.statsStatus === "none") return <span className="text-xs text-ink-3">{p.noHistory}</span>;
  if (pilot.statsStatus === "error") return <span className="text-xs text-critical-text">{p.zkillUnavailable}</span>;
  if (!pilot.statsStatus) return <span className="text-xs text-ink-3">{p.queued}</span>;
  return null;
}

/** A scanned pilot with historical evidence and direct killboard links. */
export async function PilotRow({
  pilot,
  standing,
  names,
  scanId,
}: {
  pilot: ScanPilot;
  standing: Standing;
  names: DisplayNames;
  pilotNames: Map<number, string>;
  scanId: string;
}) {
  const { t } = await getI18n();
  const p = t.intel.pilot;
  const ticker = pilot.corporationTicker ? `[${pilot.corporationTicker}]` : null;
  const history = pilot.history;
  const score = (pilot.scoreDetail as PilotScore | null) ?? null;
  const profile = (pilot.profile as PilotProfile | null) ?? null;
  return (
    <article className="glass-inset relative h-full min-w-0 rounded-xl">
      <IntelLoadingOverlay pilotId={pilot.characterId} showPreview />
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="flex w-full items-start gap-2">
          <a href={zkillCharacter(pilot.characterId)} target="_blank" rel="noopener noreferrer" aria-label={pilot.name} className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-accent"><Portrait id={pilot.characterId} size={40} /></a>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1"><a href={zkillCharacter(pilot.characterId)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-semibold text-ink hover:text-accent hover:underline" title={pilot.name}>{pilot.name}</a><Link href={`/intel/${scanId}/pilot/${pilot.characterId}`} aria-label={`${p.fullProfile}: ${pilot.name}`} title={p.fullProfile} className="shrink-0 text-ink-3 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"><Info className="size-3.5" aria-hidden /></Link></div>
            <div className="mt-0.5 truncate text-xs text-ink-3" title={pilot.corporationName ?? undefined}>
              {pilot.corporationId ? (
                <a href={zkillCorporation(pilot.corporationId)} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent" title={pilot.corporationName ?? undefined}>
                  {ticker ?? pilot.corporationName ?? p.unknownCorporation}
                </a>
              ) : (ticker ?? pilot.corporationName ?? p.unknownCorporation)}
              {pilot.allianceId && <> · <a href={zkillAlliance(pilot.allianceId)} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent" title={pilot.allianceName ?? undefined}>{pilot.allianceName ?? p.alliance(pilot.allianceId)}</a></>}
            </div>
          </div>
          <ScoreBadge score={score} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StandingBadge standing={standing} />
          <HistoryChip history={history} />
          <ProfileStatus pilot={pilot} />
        </div>
        <div className="w-full flex-1 border-y border-surface-contrast/6 py-3">
          <PilotEvidence profile={profile} names={names} />
        </div>
        <div className="grid w-full grid-cols-2 gap-2">
          {[{ label: t.intel.evidence.recentKills, loss: false }, { label: t.intel.evidence.recentLosses, loss: true }].map(({ label, loss }) => {
            const events = profile?.recent.latest.filter(event => event.isLoss === loss) ?? [];
            return (
              <div key={label} className="min-w-0">
                <h5 className="mb-1.5 text-xs text-ink-2">{label}</h5>
                {events.length ? <LatestKills events={events} names={names} limit={3} compact /> : <p className="text-3xs text-ink-3">{t.intel.evidence.noEvent}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
