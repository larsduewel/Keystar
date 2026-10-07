"use client";

import { Building2, RotateCcw, Users } from "lucide-react";
import { Portrait } from "@/components/ui/eve-image";
import { MultiSelect } from "@/components/ui/multi-select";
import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { marketQueryString, type MarketFilters } from "../filters";
import { ORDER_SIDES, ORDER_VIEWS, type OrderSide, type OrderView } from "../orders";
import type { MarketFilterOptions } from "../queries";

export function MarketFilterBar({ filters, options }: { filters: MarketFilters; options: MarketFilterOptions }) {
  const { t } = useI18n();
  const m = t.market;
  const { navigate } = usePendingNavigation();
  const all = t.common.multiSelect.all;
  const apply = (overrides: Partial<MarketFilters>) => navigate(marketQueryString(filters, { ...overrides, page: 1 }));
  const isFiltered = filters.side !== "all" || filters.characters.length + filters.locations.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<OrderView>
        label={m.filters.view}
        value={filters.view}
        onChange={(view) => apply({ view })}
        options={ORDER_VIEWS.map((v) => ({ value: v, label: m.views[v].label, title: m.views[v].hint }))}
      />

      <Segmented<OrderSide>
        label={m.filters.side}
        value={filters.side}
        onChange={(side) => apply({ side })}
        options={ORDER_SIDES.map((s) => ({ value: s, label: m.sides[s] }))}
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
        label={m.filters.location}
        allLabel={all}
        icon={<Building2 className="size-3.5 text-accent" aria-hidden />}
        selected={filters.locations}
        onApply={(v) => apply({ locations: v.map(Number) })}
        options={options.locations.map((l) => ({ value: l.id, label: l.name, hint: l.hint ?? undefined }))}
      />

      {isFiltered && (
        <button
          type="button"
          onClick={() => apply({ side: "all", characters: [], locations: [] })}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-ink-3 transition hover:bg-surface-contrast/6 hover:text-ink"
        >
          <RotateCcw className="size-3.5" aria-hidden /> {m.filters.reset}
        </button>
      )}
    </div>
  );
}
