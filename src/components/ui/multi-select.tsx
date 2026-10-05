"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Popover } from "./popover";

export interface MultiOption {
  value: number | string;
  label: string;
  group?: string;
  hint?: string;
  leading?: ReactNode;
}

/**
 * Searchable, grouped multi-select. Selection is staged locally and applied
 * when the popover closes, so picking five ores triggers one reload, not five.
 */
export function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onApply,
  icon,
}: {
  label: string;
  allLabel: string;
  options: MultiOption[];
  selected: (number | string)[];
  onApply: (values: (number | string)[]) => void;
  icon?: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<number | string>>(new Set(selected));

  const openPopover = () => {
    setDraft(new Set(selected));
    setQuery("");
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    const next = [...draft];
    const changed = next.length !== selected.length || next.some((v) => !selected.includes(v));
    if (changed) onApply(next);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const groups = useMemo(() => {
    const map = new Map<string, MultiOption[]>();
    for (const o of filtered) {
      const g = o.group ?? "";
      map.set(g, [...(map.get(g) ?? []), o]);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggle = (v: number | string) =>
    setDraft((d) => {
      const n = new Set(d);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? t.common.multiSelect.selected(1))
        : t.common.multiSelect.selected(selected.length);

  return (
    <Popover
      open={open}
      onClose={close}
      className="w-[320px]"
      trigger={
        <button
          type="button"
          onClick={() => (open ? close() : openPopover())}
          aria-expanded={open}
          className={cn(
            "glass-chip flex h-8 items-center gap-2 rounded-lg pr-3 pl-3.5 text-xs transition hover:bg-surface-contrast/10",
            selected.length > 0 && "ring-1 ring-accent/40",
          )}
        >
          {icon}
          <span className="text-ink-3">{label}</span>
          <span className="max-w-[150px] truncate font-medium text-ink">{summary}</span>
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
        </button>
      }
    >
      <div className="p-3">
        <div className="glass-inset field-focus flex items-center gap-2 rounded-lg px-3">
          <Search className="size-3.5 text-ink-3" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.common.multiSelect.search(label)}
            className="h-8 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-2xs">
          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => setDraft(new Set(filtered.map((o) => o.value)))}>
            {query ? t.common.multiSelect.selectMatches : t.common.multiSelect.selectAll}
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink" onClick={() => setDraft(new Set())}>
            <X className="size-3" aria-hidden /> {t.common.multiSelect.clear}
          </button>
        </div>
        <div className="mt-1 max-h-[320px] overflow-y-auto overscroll-contain pr-1">
          {groups.length === 0 && <div className="px-2 py-6 text-center text-xs text-ink-3">{t.common.multiSelect.noMatches}</div>}
          {groups.map(([group, items]) => (
            <div key={group} className="py-1">
              {group && <div className="eve-label px-2 pt-2 pb-1 text-2xs text-ink-3">{group}</div>}
              {items.map((o) => {
                const checked = draft.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-contrast/6"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-[5px] ring-1",
                        checked ? "bg-accent ring-accent" : "ring-surface-contrast/25",
                      )}
                    >
                      {checked && <Check className="size-3 text-space-950" strokeWidth={3} aria-hidden />}
                    </span>
                    {o.leading}
                    <span className="min-w-0 flex-1 truncate text-ink">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-2xs text-ink-3">{o.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-end border-t border-surface-contrast/8 pt-2.5">
          <button type="button" onClick={close} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-space-950">
            {t.common.multiSelect.apply(draft.size)}
          </button>
        </div>
      </div>
    </Popover>
  );
}
