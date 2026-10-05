import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { getI18n } from "@/i18n/server";
import { countBy, layoutFleet, stripMarkup } from "../logic";
import type { FleetMemberRow, FleetSummary } from "../queries";
import { FleetTree } from "./fleet-tree";

const minutesBetween = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / 60_000);

/** One live fleet: stats, composition, the wing/squad structure and recent joins and leaves. */
export async function LiveFleet({ fleet, members, now }: { fleet: FleetSummary; members: FleetMemberRow[]; now: Date }) {
  const { t, f } = await getI18n();
  const tl = t.fleet.live;
  const current = members.filter((m) => !m.leftAt);
  const groups = countBy(current, (m) => m.shipGroupId ?? 0, (m) => m.shipGroupName);
  const types = countBy(current, (m) => m.shipTypeId, (m) => m.shipName);
  const systems = countBy(current, (m) => m.solarSystemId, (m) => m.systemName);
  const layout = layoutFleet(current, fleet.wings);
  const maxGroup = Math.max(1, ...groups.map((g) => g.count));
  const bossName = fleet.bossName ?? t.fleet.fallback.character(fleet.bossCharacterId);

  const events = members
    .flatMap((m) => [
      // Joins before tracking started aren't news; everyone would show up as joined.
      ...(m.joinTime >= fleet.firstSeenAt ? [{ m, kind: "joined" as const, at: m.joinTime }] : []),
      ...(m.leftAt ? [{ m, kind: "left" as const, at: m.leftAt }] : []),
    ])
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 12);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Portrait id={fleet.bossCharacterId} size={36} />
        <h2 className="text-lg font-semibold">{tl.title(bossName)}</h2>
        {fleet.isFreeMove && <Badge tone="accent">{tl.freeMove}</Badge>}
      </div>
      {fleet.motd && (
        <p className="glass-inset rounded-lg px-4 py-2 text-sm whitespace-pre-line text-ink-2">
          <span className="eve-label mr-2 text-2xs text-ink-3">{tl.motd}</span>
          {stripMarkup(fleet.motd)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={tl.stats.members} value={f.integer(current.length)} />
        <StatTile label={tl.stats.ships} value={f.integer(types.length)} />
        <StatTile label={tl.stats.systems} value={f.integer(systems.length)} />
        <StatTile label={tl.stats.duration} value={t.fleet.duration(minutesBetween(fleet.startedAt, now))} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Panel title={tl.composition.title} subtitle={tl.composition.subtitle} className="xl:col-span-4">
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.key}>
                <div className="flex justify-between text-sm">
                  <span>{g.label ?? t.fleet.fallback.group}</span>
                  <span className="tabular-nums text-ink-2">{f.integer(g.count)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-contrast/6">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(g.count / maxGroup) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <h3 className="eve-label mt-5 mb-2 text-2xs text-ink-3">{tl.composition.ships}</h3>
          <ul className="space-y-1.5">
            {types.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <TypeIcon id={s.key} size={20} />
                <span className="min-w-0 flex-1 truncate">{s.label ?? t.fleet.fallback.type(s.key)}</span>
                <span className="tabular-nums text-ink-2">{f.integer(s.count)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={tl.structure.title} className="xl:col-span-8">
          <FleetTree layout={layout} />
        </Panel>
      </div>

      <Panel title={tl.activity.title}>
        {events.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-3">{tl.activity.none}</p>
        ) : (
          <ul className="grid gap-x-6 gap-y-1.5 text-sm md:grid-cols-2">
            {events.map((e) => (
              <li key={`${e.kind}-${e.m.characterId}`} className="flex items-center gap-2">
                <Portrait id={e.m.characterId} size={20} />
                <span className="min-w-0 truncate">{e.m.name ?? t.fleet.fallback.character(e.m.characterId)}</span>
                <span className={e.kind === "joined" ? "text-good-text" : "text-ink-3"}>{tl.activity[e.kind]}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-3">{f.relativeTime(e.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
