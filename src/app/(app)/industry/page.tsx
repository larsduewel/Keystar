import { AlarmClock, AlertTriangle, Coins, Factory, Info, PackageCheck, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { INDUSTRY_ACTIVITIES } from "@/modules/industry/activities";
import { IndustryFilterBar } from "@/modules/industry/components/filter-bar";
import { JobsTable } from "@/modules/industry/components/jobs-table";
import { industryQueryString, parseIndustryFilters } from "@/modules/industry/filters";
import { INDUSTRY_MANAGE_HREF, INDUSTRY_PERMISSIONS } from "@/modules/industry/module";
import { enabledCharacterIds, getIndustryCoverage, getIndustryFilterOptions, getIndustryJobs, getIndustrySummary } from "@/modules/industry/queries";

const PAGE_SIZE = 50;

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.industry.metaTitle };
}

export default async function IndustryPage({ searchParams }: PageProps<"/industry">) {
  const user = await requirePermission(INDUSTRY_PERMISSIONS.viewOwn);
  const { t, f } = await getI18n();
  const m = t.industry;
  const filters = parseIndustryFilters(await searchParams);
  // Only characters with industry access on are read; the coverage panel still counts the others.
  const scope = { ownCharacterIds: await enabledCharacterIds(user.characterIds) };
  const now = new Date();

  const [{ jobs, total }, summary, options, coverage] = await Promise.all([
    getIndustryJobs(filters, scope, { limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    getIndustrySummary(filters, scope, now),
    getIndustryFilterOptions(scope, m.filters),
    getIndustryCoverage(user.characterIds),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (page: number) => `?${industryQueryString(filters, { page })}`;
  const hasAnyJobs = options.activities.length > 0;
  const activityMix = INDUSTRY_ACTIVITIES.filter((a) => summary.byActivity[a]);

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={m.module.nav.jobs}
          description={m.page.description}
          actions={
            <>
              {coverage.lastSync && <span className="text-xs text-ink-3">{m.page.synced(f.relativeTime(coverage.lastSync, now))}</span>}
              <ButtonLink href={INDUSTRY_MANAGE_HREF} size="sm">
                <Settings2 className="size-3.5" aria-hidden /> {m.page.settings}
              </ButtonLink>
            </>
          }
        />

        {user.characterIds.length === 0 ? (
          <Glass>
            <EmptyState
              icon={Users}
              title={m.empty.noCharacters.title}
              action={
                <ButtonLink href="/characters" variant="primary">
                  {m.empty.noCharacters.action}
                </ButtonLink>
              }
            >
              {m.empty.noCharacters.body}
            </EmptyState>
          </Glass>
        ) : (
          <>
            <IndustryFilterBar filters={filters} options={options} />

            <PendingFrame className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile
                  icon={Factory}
                  label={m.stats.running}
                  value={f.integer(summary.running)}
                  hint={
                    summary.paused
                      ? m.stats.paused(summary.paused)
                      : summary.lastEndsAt
                        ? m.stats.lastEnds(f.relativeTime(summary.lastEndsAt, now))
                        : undefined
                  }
                />
                <StatTile icon={PackageCheck} label={m.stats.ready} value={f.integer(summary.ready)} />
                <StatTile icon={AlarmClock} label={m.stats.endingSoon} value={f.integer(summary.endingSoon)} />
                <StatTile icon={Coins} label={m.stats.cost} value={f.compact(summary.cost)} unit="ISK" hint={m.stats.costHint} />
              </div>

              {coverage.tracked === 0 ? (
                <Glass>
                  <EmptyState
                    icon={Factory}
                    title={m.empty.notEnabled.title}
                    action={
                      <ButtonLink href={INDUSTRY_MANAGE_HREF} variant="primary">
                        {m.empty.notEnabled.action}
                      </ButtonLink>
                    }
                  >
                    {m.empty.notEnabled.body}
                  </EmptyState>
                </Glass>
              ) : !hasAnyJobs ? (
                <Glass>
                  <EmptyState icon={Factory} title={m.empty.noJobs.title}>
                    {m.empty.noJobs.body}
                  </EmptyState>
                </Glass>
              ) : jobs.length === 0 ? (
                <Glass>
                  <EmptyState icon={Factory} title={m.empty.filtered} />
                </Glass>
              ) : (
                <JobsTable
                  jobs={jobs}
                  t={m}
                  f={f}
                  now={now}
                  page={filters.page}
                  pages={pages}
                  pageLink={pageLink}
                  showCharacter={options.characters.length > 1}
                />
              )}

              <div className="grid gap-4 xl:grid-cols-12">
                <Panel className="xl:col-span-7" title={m.stats.byActivity} subtitle={m.states[filters.state].hint}>
                  {activityMix.length ? (
                    <ul className="space-y-2 text-sm">
                      {activityMix.map((a) => {
                        const count = summary.byActivity[a] ?? 0;
                        return (
                          <li key={a} className="space-y-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-ink-2">{m.activities[a]}</span>
                              <span className="font-semibold tabular-nums">{f.integer(count)}</span>
                            </div>
                            <div className="h-1 overflow-hidden rounded-full bg-surface-contrast/10">
                              <div className="h-full rounded-full bg-accent/70" style={{ width: `${(count / Math.max(1, summary.jobs)) * 100}%` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="py-6 text-center text-sm text-ink-3">{m.empty.filtered}</p>
                  )}
                </Panel>
                <Panel className="xl:col-span-5" title={m.coverage.title} subtitle={m.coverage.subtitle}>
                  <ul className="space-y-3 text-sm">
                    <li className="flex justify-between gap-4">
                      <span className="text-ink-2">{m.coverage.tracked}</span>
                      <span className="font-semibold tabular-nums">{f.integer(coverage.tracked)}</span>
                    </li>
                    {coverage.notEnabled > 0 && (
                      <li className="flex items-start justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-ink-2" title={m.coverage.notEnabledHint}>
                          <Info className="size-3.5 text-ink-3" aria-hidden /> {m.coverage.notEnabled}
                        </span>
                        <Link href={INDUSTRY_MANAGE_HREF} className="font-semibold tabular-nums hover:text-accent">
                          {f.integer(coverage.notEnabled)}
                        </Link>
                      </li>
                    )}
                    {coverage.invalidTokens > 0 && (
                      <li className="flex items-start justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-ink-2">
                          <AlertTriangle className="size-3.5 text-critical-text" aria-hidden /> {m.coverage.invalidTokens}
                        </span>
                        <span className="font-semibold text-critical-text tabular-nums">{f.integer(coverage.invalidTokens)}</span>
                      </li>
                    )}
                    <li className="flex justify-between gap-4">
                      <span className="text-ink-2">{m.coverage.lastSync}</span>
                      <span className="tabular-nums">{f.relativeTime(coverage.lastSync, now)}</span>
                    </li>
                    <li className="flex items-start gap-1.5 border-t border-surface-contrast/8 pt-3 text-xs text-ink-3">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {m.coverage.note}
                    </li>
                  </ul>
                </Panel>
              </div>
            </PendingFrame>
          </>
        )}
      </div>
    </PendingProvider>
  );
}
