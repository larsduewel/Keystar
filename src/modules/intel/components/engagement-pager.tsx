"use client";

import { useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";

export function EngagementPager({ pages }: { pages: { id: string; label: string; content: ReactNode }[] }) {
  const { t, f } = useI18n();
  const [selectedId, setSelectedId] = useState(pages[0]?.id);
  const selected = Math.max(0, pages.findIndex(page => page.id === selectedId));
  return <>
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {pages.map((page, index) => <div key={page.id} aria-hidden={index !== selected} inert={index !== selected} className={`w-full flex-1 transition-[transform,opacity] duration-300 motion-reduce:transition-none ${index === selected ? "relative" : "absolute left-0 top-0"}`} style={{ transform: `translateX(${(index - selected) * 100}%)`, opacity: index === selected ? 1 : 0 }}>{page.content}</div>)}
    </div>
    {pages.length > 1 && <nav aria-label={t.intel.evidence.engagementPages} className="mt-3 flex flex-wrap justify-center gap-1.5 border-t border-surface-contrast/6 pt-2">
      {pages.map((page, index) => <button key={page.id} type="button" aria-label={`${t.intel.evidence.engagementPage} ${f.integer(index + 1)}: ${page.label}`} aria-current={index === selected ? "page" : undefined} title={page.label} onClick={() => setSelectedId(page.id)} className={`min-h-7 min-w-7 cursor-pointer rounded-md px-1.5 text-2xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-accent ${index === selected ? "bg-accent/20 text-accent" : "bg-surface-contrast/5 text-ink-3 hover:bg-surface-contrast/10 hover:text-ink"}`}>{f.integer(index + 1)}</button>)}
    </nav>}
  </>;
}
