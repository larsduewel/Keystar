"use client";

import { Users } from "lucide-react";
import { Portrait } from "@/components/ui/eve-image";
import { MultiSelect } from "@/components/ui/multi-select";
import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { skillsQueryString, type SkillsFilters, type SkillsView } from "../filters";

export function SkillsFilterBar({
  filters,
  characters,
  showView,
}: {
  filters: SkillsFilters;
  characters: { id: number; name: string; group?: string }[];
  /** "My characters" / corporation switch, for viewers with corporation access. */
  showView: boolean;
}) {
  const { t } = useI18n();
  const { navigate } = usePendingNavigation();
  const apply = (overrides: Partial<SkillsFilters>) => navigate(skillsQueryString(filters, overrides));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showView && (
        <Segmented<SkillsView>
          label={t.skills.view.label}
          value={filters.view}
          // Selected characters may not exist in the other view.
          onChange={(view) => apply({ view, characters: [] })}
          options={[
            { value: "own", label: t.skills.view.own, title: t.skills.view.ownHint },
            { value: "corp", label: t.skills.view.corp, title: t.skills.view.corpHint },
          ]}
        />
      )}
      {characters.length > 1 && (
        <MultiSelect
          label={t.skills.filters.characters}
          allLabel={t.common.multiSelect.all}
          icon={<Users className="size-3.5 text-accent" aria-hidden />}
          selected={filters.characters}
          onApply={(v) => apply({ characters: v.map(Number) })}
          options={characters.map((c) => ({
            value: c.id,
            label: c.name,
            group: c.group,
            leading: <Portrait id={c.id} size={20} />,
          }))}
        />
      )}
    </div>
  );
}
