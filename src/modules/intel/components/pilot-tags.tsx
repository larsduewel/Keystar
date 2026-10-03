"use client";

import { IntelLoadingOverlay } from "./scan-progress";
import { useState, type ReactNode } from "react";

export function PilotTags({ items, legend, legendLabel }: { legend: { id: string; name: string; color: string }[]; legendLabel: string; items: { id: number; affiliationId: string; color: string; title: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <><div className="flex flex-wrap gap-1.5">
    {items.map(item => {
      const highlighted = item.affiliationId === selected;
      return <button key={item.id} type="button" aria-pressed={highlighted} title={item.title} onClick={() => setSelected(selected === item.affiliationId ? null : item.affiliationId)} style={{ backgroundColor: `color-mix(in srgb, ${item.color} ${highlighted ? 32 : 14}%, transparent)`, borderColor: highlighted ? item.color : "transparent", opacity: selected && !highlighted ? 0.45 : 1 }} className="relative inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-[opacity,background-color] focus-visible:outline-2 focus-visible:outline-accent">
        {item.content}
        <IntelLoadingOverlay pilotId={item.id} />
      </button>;
    })}
  </div>
    <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-surface-contrast/6 pt-2 text-3xs text-ink-2" aria-label={legendLabel}>
      {legend.map(group => <li key={group.id}><button type="button" aria-pressed={selected === group.id} onClick={() => setSelected(selected === group.id ? null : group.id)} className="inline-flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface-contrast/10 focus-visible:outline-2 focus-visible:outline-accent" style={{ backgroundColor: selected === group.id ? `color-mix(in srgb, ${group.color} 20%, transparent)` : undefined }}><span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: group.color }} aria-hidden /><span>{group.name}</span></button></li>)}
    </ul>
  </>;
}
