import { AlertTriangle, Box, CalendarDays, Coins, Download, Info, Layers3, Pickaxe, TableProperties, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { Delta, StatTile } from "@/components/ui/stat-tile";
import type { OreClass } from "@/core/eve/ore";
import { memberAuditHref } from "@/core/member-audit-filters";
import { getI18n } from "@/i18n/server";
import { delta } from "@/lib/format";
import { toChartClasses } from "@/modules/mining/class-colors";
import { ClassComposition, MemberLeaderboard, SystemTable } from "@/modules/mining/components/breakdowns";
import { OreBreakdown } from "@/modules/mining/components/ore-table";
import { DailyChart } from "@/modules/mining/components/daily-chart";
import { MiningFilterBar } from "@/modules/mining/components/filter-bar";
import { GroupByToggle } from "@/modules/mining/components/group-toggle";
import { daysBetween, miningQueryString } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { miningPageContext } from "@/modules/mining/page-context";
import {
  getCoverage,
  getDailySeries,
  getFilterOptions,
  getMemberBreakdown,
  getMiningSummary,
  getSystemBreakdown,
  getTypeBreakdown,
  canViewCorpMining,
  hasObservers,
} from "@/modules/mining/queries";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.mining.overview.metaTitle };
}

export default async function MiningPage({ searchParams }: PageProps<"/mining">) {
  const ctx = await miningPageContext(await searchParams);
  const { t, f } = await getI18n();
  const m = t.mining.overview;
  const { filters, scope, valuation, user } = ctx;

  const [summary, daily, members, types, systems, options, coverage, observersOnRecord] = await Promise.all([
    getMiningSummary(filters, scope, valuation),
    getDailySeries(filters, scope, valuation),
    getMemberBreakdown(filters, scope, valuation),
    getTypeBreakdown(filters, scope, valuation),
    getSystemBreakdown(filters, scope, valuation),
    getFilterOptions(scope),
    getCoverage(scope),
    hasObservers(ctx.homeCorporationId),
  ]);

  const { current, previous } = summary;
  const span = daysBetween(filters.from, filters.to);
  const period = m.priorPeriod(span);
  const byClass: Partial<Record<OreClass, number>> = {};
  for (const type of types) byClass[type.oreClass] = (byClass[type.oreClass] ?? 0) + type[filters.metric];
  const hasAnyData = options.characters.length > 0;
  const canSwitchView = canViewCorpMining(user, ctx.homeCorporationId);

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.mining.module.nav.overview}
          description={
            scope.corp
              ? m.description.corp
              : canSwitchView
                ? m.description.ownView
                : user.can(MINING_PERMISSIONS.viewCorp)
                ? m.description.noHomeCorp
                : m.description.own
          }
          actions={
            <>
              <ButtonLink href={`/mining/ledger?${miningQueryString(filters)}`} size="sm">
                <TableProperties className="size-4" aria-hidden /> {m.ledger}
              </ButtonLink>
              {user.can(MINING_PERMISSIONS.export) && (
                <a
                  href={`/mining/export?${miningQueryString(filters)}`}
                  className="glass-chip inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium hover:bg-surface-contrast/10"
                >
                  <Download className="size-4" aria-hidden /> {t.mining.exportCsv}
                </a>
              )}
            </>
          }
        />

        <MiningFilterBar
          filters={filters}
          options={options}
          presets={ctx.presets}
          showView={canSwitchView}
          // Without moon drills every source shows the same rows; keep it while a URL still selects one.
          showSource={observersOnRecord || filters.source !== "all"}
        />

        {!hasAnyData ? (
          <Glass>
            <EmptyState
              icon={Pickaxe}
              title={m.empty.title}
              action={
                <ButtonLink href="/characters" variant="primary">
                  {m.empty.action}
                </ButtonLink>
              }
            >
              {m.empty.body}
            </EmptyState>
          </Glass>
        ) : (
          <PendingFrame className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-12">
              <StatTile
                hero
                icon={Coins}
                className="col-span-2 lg:col-span-4 xl:col-span-4"
                label={m.valueMined(f.shortDate(filters.from), f.shortDate(filters.to))}
                value={f.compact(current.value)}
                unit="ISK"
                delta={<Delta value={delta(current.value, previous.value)} period={period} />}
                trend={daily.map((d) => d.value)}
              />
              <StatTile
                className="xl:col-span-2"
                icon={Box}
                label={m.volume}
                value={f.compact(current.volume)}
                unit="m³"
                delta={<Delta value={delta(current.volume, previous.volume)} period={period} />}
              />
              <StatTile
                className="xl:col-span-2"
                icon={Layers3}
                label={m.units}
                value={f.compact(current.quantity)}
                delta={<Delta value={delta(current.quantity, previous.quantity)} period={period} />}
              />
              <StatTile
                className="xl:col-span-2"
                icon={Users}
                label={m.activePilots}
                value={f.integer(current.miners)}
                delta={<Delta value={delta(current.miners, previous.miners)} period={period} />}
                hint={m.characters(current.characters)}
              />
              <StatTile
                className="xl:col-span-2"
                icon={CalendarDays}
                label={m.valuePerActiveDay}
                value={f.compact(current.activeDays ? current.value / current.activeDays : 0)}
                unit="ISK"
                hint={m.activeDays(current.activeDays, span)}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel
                className="xl:col-span-8"
                title={m.daily[filters.metric]}
                subtitle={filters.metric === "value" ? ctx.valuationLabel : m.eveDays}
              >
                <DailyChart
                  metric={filters.metric}
                  rows={daily.map((d) => ({ date: d.date, total: d.total, values: toChartClasses(d.byClass) }))}
                />
              </Panel>
              <Panel className="xl:col-span-4" title={m.resourceMix} subtitle={m.shareOf[filters.metric]}>
                <ClassComposition byClass={byClass} metric={filters.metric} />
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel
                className="xl:col-span-5"
                title={m.topMiners}
                subtitle={filters.groupBy === "user" ? m.topMinersGrouped : m.topMinersDrill}
                actions={<GroupByToggle filters={filters} />}
              >
                {members.length ? (
                  <MemberLeaderboard rows={members} filters={filters} canDrill />
                ) : (
                  <p className="py-8 text-center text-sm text-ink-3">{m.noMiners}</p>
                )}
              </Panel>
              <OreBreakdown
                className="xl:col-span-7"
                title={m.oreBreakdown}
                subtitle={ctx.valuationLabel}
                rows={types}
                filters={filters}
                emptyText={m.noOre}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel className="xl:col-span-7" title={m.systems} subtitle={m.systemsSubtitle}>
                <SystemTable rows={systems} filters={filters} />
              </Panel>
              <Panel className="xl:col-span-5" title={m.coverage.title} subtitle={m.coverage.subtitle}>
                <ul className="space-y-3 text-sm">
                  <li className="flex justify-between gap-4">
                    <span className="text-ink-2">{m.coverage.tracked}</span>
                    <span className="font-semibold tabular-nums">{f.integer(coverage.trackedCharacters)}</span>
                  </li>
                  {coverage.missingScope > 0 && (
                    <li className="flex items-start justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-ink-2">
                        <AlertTriangle className="size-3.5 text-warning" aria-hidden /> {m.coverage.missingScope}
                      </span>
                      <Link href="/characters" className="font-semibold text-warning tabular-nums hover:underline">
                        {f.integer(coverage.missingScope)}
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
                  {coverage.unregisteredMembers !== null && (
                    <li className="flex justify-between gap-4">
                      <span className="text-ink-2">{m.coverage.unregistered}</span>
                      <Link href={memberAuditHref(undefined, { filter: "unregistered" })} className="font-semibold tabular-nums hover:text-accent">
                        {f.integer(coverage.unregisteredMembers)}
                      </Link>
                    </li>
                  )}
                  <li className="flex justify-between gap-4">
                    <span className="text-ink-2">{m.coverage.lastLedgerSync}</span>
                    <span className="tabular-nums">{f.relativeTime(coverage.lastLedgerSync)}</span>
                  </li>
                  {scope.corp && (
                    <li className="flex justify-between gap-4">
                      <span className="text-ink-2">{m.coverage.lastObserverSync}</span>
                      <span className="tabular-nums">
                        {coverage.lastObserverSync ? f.relativeTime(coverage.lastObserverSync) : m.coverage.notConfigured}
                      </span>
                    </li>
                  )}
                  {current.unpricedRows > 0 && (
                    <li className="flex items-start gap-1.5 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {m.coverage.unpriced(current.unpricedRows)}
                    </li>
                  )}
                  <li className="flex items-start gap-1.5 border-t border-surface-contrast/8 pt-3 text-xs text-ink-3">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {m.coverage.note(ctx.valuationLabel)}
                  </li>
                </ul>
              </Panel>
            </div>
          </PendingFrame>
        )}
      </div>
    </PendingProvider>
  );
}
