import { SystemMapLink } from "./system-map-link";
import { ExternalLink } from "lucide-react";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { SecurityStatus } from "@/components/ui/security";
import { getI18n } from "@/i18n/server";
import { KILL_COLOR, LOSS_COLOR } from "@/modules/killboard/colors";
import { zkillKill, zkillRelated } from "@/modules/killboard/links";
import type { DisplayNames } from "../names";
import type { Engagement } from "../types";

/** Fights between the home corporation and the scanned pilots, newest first. */
export async function EngagementList({
  engagements,
  names,
  pilotNames,
}: {
  engagements: Engagement[];
  names: DisplayNames;
  pilotNames: Map<number, string>;
}) {
  if (!engagements.length) return null;
  const { t, f } = await getI18n();
  const g = t.intel.engagements;
  return (
    <ol className="space-y-2">
      {engagements.map((e) => {
        const system = names.systems.get(e.systemId);
        const won = e.iskKilled >= e.iskLost;
        return (
          <li
            key={e.key}
            className="glass-inset rounded-lg border-l-[3px] px-4 py-3"
            style={{ borderLeftColor: won ? KILL_COLOR : LOSS_COLOR }}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <SystemMapLink id={e.systemId} className="font-medium text-ink">{system?.name ?? g.system(e.systemId)}</SystemMapLink>
              {system && <SecurityStatus value={system.securityStatus} />}
              <span className="text-ink-3" title={f.dateTime(e.start)}>
                {f.relativeTime(e.start)}
              </span>
              <span className="ml-auto inline-flex items-center gap-3 text-xs tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: KILL_COLOR }} aria-hidden />
                  {g.killed(e.ourKills, f.compact(e.iskKilled))}
                </span>
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: LOSS_COLOR }} aria-hidden />
                  {g.lost(e.ourLosses, f.compact(e.iskLost))}
                </span>
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {e.pilots.map((p) => (
                <span key={p.characterId} className="glass-chip inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs">
                  <Portrait id={p.characterId} size={20} />
                  {pilotNames.get(p.characterId) ?? p.characterId}
                  {p.shipTypeIds.slice(0, 2).map((id) => (
                    <TypeIcon key={id} id={id} size={16} className="rounded" />
                  ))}
                </span>
              ))}
            </div>

            {e.brought.length > 0 && (
              <div className="mt-2 text-xs text-ink-3">
                <span className="mr-1.5">{g.brought}</span>
                {e.brought.slice(0, 12).map((b) => (
                  <span key={b.shipTypeId} className="mr-2 inline-flex items-center gap-1 text-ink-2" title={names.types.get(b.shipTypeId)?.name}>
                    <TypeIcon id={b.shipTypeId} size={18} className="rounded" />
                    {b.count > 1 && <span className="tabular-nums">{f.integer(b.count)}×</span>}
                    {names.types.get(b.shipTypeId)?.name ?? t.intel.pilot.unknownHull}
                  </span>
                ))}
              </div>
            )}

            {e.others.length > 0 && (
              <div className="mt-1 text-xs text-ink-3">
                {g.with(
                  e.others
                    .map((o) => {
                      const who = (o.allianceId && names.entities.get(o.allianceId)) || (o.corporationId && names.entities.get(o.corporationId)) || g.unknown;
                      return g.fromGroup(o.pilots, who);
                    })
                    .join(", "),
                )}
              </div>
            )}

            <div className="mt-2 flex gap-3 text-xs">
              <a
                href={zkillRelated(e.systemId, e.start)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                {g.battleReport} <ExternalLink className="size-3" aria-hidden />
              </a>
              <a
                href={zkillKill(e.topKillmailId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-ink-2 hover:text-accent"
              >
                {g.biggestKill} <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
