import { SystemMapLink } from "./system-map-link";
import Link from "next/link";
import { Portrait } from "@/components/ui/eve-image";
import { getI18n } from "@/i18n/server";
import type { DisplayNames } from "../names";
import type { Sighting } from "../scans";
import type { PilotScore, Standing } from "../types";
import { ScoreBadge } from "./score";
import { StandingBadge } from "./standing-badge";

/** Pilots the corporation saw in scans recently, newest sighting first; friendlies are left out. */
export async function HostilesFeed({
  sightings,
  names,
  hidden,
}: {
  sightings: (Sighting & { standing: Standing })[];
  names: DisplayNames;
  hidden: number;
}) {
  const { t, f } = await getI18n();
  if (!sightings.length) return <p className="text-sm text-ink-3">{t.intel.feed.none}</p>;
  return (
    <div>
      <ul className="divide-y divide-surface-contrast/6">
        {sightings.map((s) => {
          const system = s.systemId ? (names.systems.get(s.systemId)?.name ?? null) : null;
          const score: PilotScore | null =
            s.tier && s.tier !== "unknown" && s.score !== null
              ? { composite: s.score, tier: s.tier as PilotScore["tier"], recencyGate: 1, dimensions: [], tags: [], excluded: null, quick: false }
              : null;
          return (
            <li key={s.characterId}>
              <Link href={`/intel/${s.scanId}/pilot/${s.characterId}`} className="flex items-center gap-3 py-2 hover:text-accent">
                <Portrait id={s.characterId} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="truncate font-medium">{s.name}</span>
                    <StandingBadge standing={s.standing} />
                  </div>
                  <div className="truncate text-xs text-ink-3">
                    {t.intel.feed.seen({ ago: f.relativeTime(s.seenAt), system: null, by: s.seenBy, times: s.times, fought: s.fought })}
                  </div>
                </div>
                <ScoreBadge score={score} />
              </Link>
              {s.systemId && system && <SystemMapLink id={s.systemId} className="mb-2 ml-10 inline-block text-xs text-ink-3">{system}</SystemMapLink>}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && <p className="mt-2 text-xs text-ink-3">{t.intel.feed.hidden(hidden)}</p>}
    </div>
  );
}
