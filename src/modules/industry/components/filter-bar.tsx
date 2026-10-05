"use client";

import { Building2, Hammer, MapPin, RotateCcw, Users } from "lucide-react";
import { Portrait } from "@/components/ui/eve-image";
import { MultiSelect } from "@/components/ui/multi-select";
import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { displaySecurity } from "@/core/eve/images";
import { useI18n } from "@/i18n/client";
import { FILTER_ACTIVITIES, JOB_STATES, type IndustryActivity, type JobState } from "../activities";
import { industryQueryString, type IndustryFilters } from "../filters";
import type { IndustryFilterOptions } from "../queries";

export function IndustryFilterBar({ filters, options }: { filters: IndustryFilters; options: IndustryFilterOptions }) {
  const { t } = useI18n();
  const m = t.industry;
  const { navigate } = usePendingNavigation();
  const all = t.common.multiSelect.all;
  const apply = (overrides: Partial<IndustryFilters>) => navigate(industryQueryString(filters, { ...overrides, page: 1 }));

  // Like the other pickers, offer only activities that appear in the viewer's jobs (plus any still selected).
  const seen = new Set<IndustryActivity>([...options.activities, ...filters.activities]);
  const activities = [...FILTER_ACTIVITIES, "other" as const].filter((a) => seen.has(a));
  const isFiltered = filters.characters.length + filters.activities.length + filters.systems.length + filters.locations.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<JobState>
        label={m.filters.state}
        value={filters.state}
        onChange={(state) => apply({ state })}
        options={JOB_STATES.map((s) => ({ value: s, label: m.states[s].label, title: m.states[s].hint }))}
      />

      {options.characters.length > 1 && (
        <MultiSelect
          label={m.filters.characters}
          allLabel={all}
          icon={<Users className="size-3.5 text-accent" aria-hidden />}
          selected={filters.characters}
          onApply={(v) => apply({ characters: v.map(Number) })}
          options={options.characters.map((c) => ({ value: c.id, label: c.name, leading: <Portrait id={c.id} size={20} /> }))}
        />
      )}

      <MultiSelect
        label={m.filters.activity}
        allLabel={all}
        icon={<Hammer className="size-3.5 text-accent" aria-hidden />}
        selected={filters.activities}
        onApply={(v) => apply({ activities: v as IndustryActivity[] })}
        options={activities.map((a) => ({ value: a, label: m.activities[a] }))}
      />

      <MultiSelect
        label={m.filters.system}
        allLabel={all}
        icon={<MapPin className="size-3.5 text-accent" aria-hidden />}
        selected={filters.systems}
        onApply={(v) => apply({ systems: v.map(Number) })}
        options={options.systems.map((s) => ({
          value: s.id,
          label: s.name,
          hint: s.security === null ? undefined : displaySecurity(s.security),
        }))}
      />

      <MultiSelect
        label={m.filters.location}
        allLabel={all}
        icon={<Building2 className="size-3.5 text-accent" aria-hidden />}
        selected={filters.locations}
        onApply={(v) => apply({ locations: v.map(Number) })}
        options={options.locations.map((l) => ({ value: l.id, label: l.name, hint: l.systemName ?? undefined }))}
      />

      {isFiltered && (
        <button
          type="button"
          onClick={() => apply({ characters: [], activities: [], systems: [], locations: [] })}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-ink-3 transition hover:bg-surface-contrast/6 hover:text-ink"
        >
          <RotateCcw className="size-3.5" aria-hidden /> {m.filters.reset}
        </button>
      )}
    </div>
  );
}
