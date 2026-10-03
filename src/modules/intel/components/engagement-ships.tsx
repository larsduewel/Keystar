"use client";

import { useState, type ReactNode } from "react";

type Pilot = { id: number; name: string; affiliationId: string; affiliationName: string; color: string };
type Ship = { id: number; lost: number; heading: ReactNode; pilots: Pilot[] };

export function EngagementShips({ ships, legendLabel, unknown }: { ships: Ship[]; legendLabel: string; unknown: string }) {
  const groups = new Map<string, { id: string; name: string; color: string; members: Set<number> }>();
  for (const ship of ships) for (const pilot of ship.pilots) {
    const group = groups.get(pilot.affiliationId) ?? { id: pilot.affiliationId, name: pilot.affiliationName, color: pilot.color, members: new Set<number>() };
    group.members.add(pilot.id);
    groups.set(group.id, group);
  }
  const legend = [...groups.values()].sort((a, b) => b.members.size - a.members.size || a.id.localeCompare(b.id));
  const [selected, setSelected] = useState<string | null>(() => legend.find(g => !g.id.startsWith("pilot:"))?.id ?? null);
  const toggle = (id: string) => setSelected(selected === id ? null : id);
  return <>
    <ul className="mt-2 mb-3 space-y-1">
      {ships.map(ship => <li key={ship.id} className={`rounded-md px-1.5 py-1 transition-opacity ${ship.lost ? "bg-critical/10" : "bg-surface-contrast/5"}`} style={{ opacity: selected && ship.pilots.length && !ship.pilots.some(p => p.affiliationId === selected) ? 0.45 : 1 }}>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-3xs">{ship.heading}
          {ship.pilots.length ? ship.pilots.map(pilot => <button key={pilot.id} type="button" aria-pressed={selected === pilot.affiliationId} title={pilot.affiliationName} onClick={() => toggle(pilot.affiliationId)} className="max-w-full cursor-pointer break-words rounded-md border px-0.5 text-left text-3xs text-ink-2 transition-[opacity,background-color] focus-visible:outline-2 focus-visible:outline-accent" style={{ backgroundColor: `color-mix(in srgb, ${pilot.color} ${selected === pilot.affiliationId ? 32 : 14}%, transparent)`, borderColor: selected === pilot.affiliationId ? pilot.color : "transparent", opacity: selected && selected !== pilot.affiliationId ? 0.45 : 1 }}>({pilot.name})</button>) : <span className="text-3xs text-ink-3">({unknown})</span>}
        </div>
      </li>)}
    </ul>
    <ul aria-label={legendLabel} className="mt-auto flex flex-wrap gap-x-2 gap-y-1 border-t border-surface-contrast/6 pt-2 text-3xs text-ink-2">
      {legend.map(group => <li key={group.id}><button type="button" aria-pressed={selected === group.id} onClick={() => toggle(group.id)} className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-surface-contrast/10 focus-visible:outline-2 focus-visible:outline-accent" style={{ backgroundColor: selected === group.id ? `color-mix(in srgb, ${group.color} 20%, transparent)` : undefined }}><span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: group.color }} aria-hidden /><span>{group.name} · {group.members.size}</span></button></li>)}
    </ul>
  </>;
}
