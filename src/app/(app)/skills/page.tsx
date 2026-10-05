import { AlarmClock, CirclePause, GraduationCap, Settings2, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { SkillCharacterCard } from "@/modules/skills/components/character-card";
import { SkillsFilterBar } from "@/modules/skills/components/filter-bar";
import { parseSkillsFilters } from "@/modules/skills/filters";
import { SKILLS_MANAGE_HREF, SKILLS_PERMISSIONS } from "@/modules/skills/module";
import { canViewCorpSkills, getSkillsOverview, skillsScope } from "@/modules/skills/queries";
import { summarizeQueue } from "@/modules/skills/queue";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.skills.metaTitle.overview };
}

export default async function SkillsPage({ searchParams }: PageProps<"/skills">) {
  const user = await requirePermission(SKILLS_PERMISSIONS.viewOwn, SKILLS_PERMISSIONS.viewCorp);
  const { t, f } = await getI18n();
  const s = t.skills;
  const settings = await getSettings();
  const home = settings["corp.homeCorporationId"];
  const filters = parseSkillsFilters(await searchParams);
  const scope = skillsScope(user, home, filters.view);
  const showView = canViewCorpSkills(user, home);
  const now = new Date();

  // The picker lists everyone in the view; the cards only the picked characters.
  const all = await getSkillsOverview(scope);
  const picked = new Set(filters.characters);
  const characters = picked.size ? all.characters.filter((c) => picked.has(c.characterId)) : all.characters;
  const summaries = characters
    .filter((c) => c.queueEnabled && c.queueSyncedAt)
    .map((c) => summarizeQueue(all.queues.get(c.characterId) ?? [], now));
  const lastSync = characters.reduce<Date | null>(
    (latest, c) => (c.queueSyncedAt && (!latest || c.queueSyncedAt > latest) ? c.queueSyncedAt : latest),
    null,
  );

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={s.module.navSection}
          title={s.metaTitle.overview}
          description={s.page.description}
          actions={
            <>
              {lastSync && <span className="text-xs text-ink-3">{s.page.synced(f.relativeTime(lastSync, now))}</span>}
              <ButtonLink href={SKILLS_MANAGE_HREF} size="sm">
                <Settings2 className="size-3.5" aria-hidden /> {s.page.settings}
              </ButtonLink>
            </>
          }
        />

        <SkillsFilterBar
          filters={filters}
          showView={showView}
          characters={all.characters.map((c) => ({ id: c.characterId, name: c.name }))}
        />

        <PendingFrame className="space-y-6">
          {characters.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label={s.stats.characters} value={f.integer(characters.length)} icon={Users} />
              <StatTile
                label={s.stats.training}
                value={f.integer(summaries.filter((q) => q.status === "training" || q.status === "ending-soon").length)}
                icon={GraduationCap}
              />
              <StatTile
                label={s.stats.endingSoon}
                value={f.integer(summaries.filter((q) => q.status === "ending-soon").length)}
                icon={AlarmClock}
              />
              <StatTile
                label={s.stats.idle}
                value={f.integer(summaries.filter((q) => q.status === "paused" || q.status === "empty").length)}
                icon={CirclePause}
              />
            </div>
          )}

          {characters.length === 0 ? (
            <Glass>
              {all.characters.length > 0 ? (
                <EmptyState icon={Users} title={s.empty.filtered} />
              ) : scope.corp ? (
                <EmptyState icon={Users} title={s.empty.corp.title}>
                  {s.empty.corp.body}
                </EmptyState>
              ) : (
                <EmptyState icon={GraduationCap} title={s.empty.own.title}>
                  {s.empty.own.body}
                </EmptyState>
              )}
            </Glass>
          ) : (
            <div className="grid gap-4 2xl:grid-cols-2">
              {characters.map((c) => (
                <SkillCharacterCard
                  key={c.characterId}
                  character={c}
                  queue={all.queues.get(c.characterId) ?? []}
                  t={s}
                  f={f}
                  now={now}
                  expanded={characters.length === 1}
                />
              ))}
            </div>
          )}
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
