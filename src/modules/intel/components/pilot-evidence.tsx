import { SystemMapLink } from "./system-map-link";
import { getI18n } from "@/i18n/server";
import type { DisplayNames } from "../names";
import type { LatestEvent, PilotProfile } from "../types";
import { cynoEvidence, eventTargetHull, latestEvidence } from "../evidence";

export async function EventEvidence({ event, names }: { event: LatestEvent | null; names: DisplayNames }) {
  const { t, f } = await getI18n();
  const e = t.intel.evidence;
  if (!event) return <span className="text-ink-3">{e.noEvent}</span>;
  const hull = eventTargetHull(event);
  const target = hull ? names.types.get(hull)?.name : null;
  return (
    <span className="block space-y-0.5">
      <span className="block font-medium text-ink">
        {target ?? t.intel.pilot.unknownHull} · {f.relativeTime(event.time)}
      </span>
      <span className="block text-ink-3"><SystemMapLink id={event.systemId}>{names.systems.get(event.systemId)?.name ?? e.unknown}</SystemMapLink></span>
      {!event.isLoss && (
        <span className="block text-ink-2">
          {e.observedHull(event.shipTypeId ? (names.types.get(event.shipTypeId)?.name ?? e.unknown) : e.unknown)}
        </span>
      )}
      <span className="block text-ink-3">{e.attackers(event.attackerCount)}</span>
    </span>
  );
}

export async function CynoEvidence({ profile }: { profile: PilotProfile | null }) {
  const { t, f } = await getI18n();
  const e = t.intel.evidence;
  const fits = cynoEvidence(profile);
  return (
    <span className="block space-y-1">
      {fits.length ? (
        fits.map((fit) => (
          <span key={fit.kind} className="block text-warning">
            <strong>{e.cynoKinds[fit.kind]}</strong> · {f.relativeTime(fit.lastAt)}
            <span className="block text-ink-3">{e.fittedLosses(fit.count)}</span>
          </span>
        ))
      ) : (
        <span className="text-ink-3">{profile?.depth === "deep" ? e.noCyno : e.unknownCyno}</span>
      )}
    </span>
  );
}

export async function PilotEvidence({
  profile,
  names,
}: {
  profile: PilotProfile | null;
  names: DisplayNames;
}) {
  const { t, f } = await getI18n();
  const e = t.intel.evidence;
  const latest = latestEvidence(profile);
  return (
    <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
      {[{ label: e.tileKill, event: latest.kill }, { label: e.tileLoss, event: latest.loss }].map(({ label, event }) => {
        const hull = event ? eventTargetHull(event) : null;
        return (
          <div key={label} className="contents">
            <span className="text-ink-3">{label}</span>
            <span className="min-w-0 text-ink">
              <span className="flex items-baseline gap-1.5">
                <span className="truncate">{event ? (hull ? (names.types.get(hull)?.name ?? e.unknown) : e.unknown) : e.noEvent}</span>
                {event && <span className="shrink-0 whitespace-nowrap text-3xs text-ink-3">· {f.relativeTime(event.time)}</span>}
              </span>
              {event && <span className="mt-0.5 block text-3xs text-ink-3"><SystemMapLink id={event.systemId}>{names.systems.get(event.systemId)?.name ?? e.unknown}</SystemMapLink> · {e.attackers(event.attackerCount)}</span>}
            </span>
          </div>
        );
      })}
      <span className="text-ink-3">{e.tileCyno}</span>
      <span className={cynoEvidence(profile).length ? "text-warning" : "text-ink-3"}>{cynoEvidence(profile).length ? cynoEvidence(profile).map(fit => <span key={fit.kind} className="block">{e.cynoKinds[fit.kind]} · {f.relativeTime(fit.lastAt)}</span>) : profile?.depth === "deep" ? e.tileNoCyno : e.unknown}</span>
    </div>
  );
}
