import { Brain, Settings2, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { requirePermission } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { SkillsFilterBar } from "@/modules/skills/components/filter-bar";
import { RemapCard } from "@/modules/skills/components/remap-card";
import { parseSkillsFilters } from "@/modules/skills/filters";
import { SKILLS_MANAGE_HREF, SKILLS_PERMISSIONS } from "@/modules/skills/module";
import { canViewCorpSkills, getRemapInputs, getSkillsOverview, skillsScope } from "@/modules/skills/queries";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.skills.metaTitle.remap };
}

export default async function SkillsRemapPage({ searchParams }: PageProps<"/skills/remap">) {
  const user = await requirePermission(SKILLS_PERMISSIONS.viewOwn, SKILLS_PERMISSIONS.viewCorp);
  const { t, f } = await getI18n();
  const s = t.skills;
  const settings = await getSettings();
  const home = settings["corp.homeCorporationId"];
  const filters = parseSkillsFilters(await searchParams);
  const scope = skillsScope(user, home, filters.view);
  const showView = canViewCorpSkills(user, home);
  const now = new Date();

  const all = await getSkillsOverview(scope);
  const picked = new Set(filters.characters);
  const characters = picked.size ? all.characters.filter((c) => picked.has(c.characterId)) : all.characters;
  const queued = characters.flatMap((c) => (all.queues.get(c.characterId) ?? []).map((q) => q.skillId));
  const inputs = await getRemapInputs(
    characters.map((c) => c.characterId),
    queued,
  );

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={s.module.navSection}
          title={s.metaTitle.remap}
          description={s.page.remapDescription}
          actions={
            <ButtonLink href={SKILLS_MANAGE_HREF} size="sm">
              <Settings2 className="size-3.5" aria-hidden /> {s.page.settings}
            </ButtonLink>
          }
        />

        <SkillsFilterBar
          filters={filters}
          showView={showView}
          characters={all.characters.map((c) => ({ id: c.characterId, name: c.name }))}
        />

        <PendingFrame className="space-y-4">
          {characters.length === 0 ? (
            <Glass>
              {all.characters.length > 0 ? (
                <EmptyState icon={Users} title={s.empty.filtered} />
              ) : (
                <EmptyState icon={Brain} title={s.remap.empty.title}>
                  {s.remap.empty.body}
                </EmptyState>
              )}
            </Glass>
          ) : (
            <div className="grid gap-4 2xl:grid-cols-2">
              {characters.map((c) => (
                <RemapCard
                  key={c.characterId}
                  character={c}
                  queue={all.queues.get(c.characterId) ?? []}
                  skillAttributes={inputs.skillAttributes}
                  implants={inputs.implants.get(c.characterId) ?? null}
                  implantsShared={inputs.implantsShared.has(c.characterId)}
                  t={s}
                  f={f}
                  now={now}
                />
              ))}
            </div>
          )}
          <p className="text-2xs text-ink-3">{s.remap.method}</p>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
