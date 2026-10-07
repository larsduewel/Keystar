import { Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { SortableTable } from "@/components/ui/sortable-table";
import { requirePermission } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { env } from "@/core/env";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { DATE_PRESETS, isoDate } from "@/lib/dates";
import type { Formatter } from "@/lib/format";
import { KILL_COLOR, LOSS_COLOR } from "@/modules/killboard/colors";
import { IskBreakdownPanel } from "@/modules/killboard/components/isk-breakdown";
import { KillboardHeader, NoCorporation, NoKillmails } from "@/modules/killboard/components/page-header";
import { PeriodStats } from "@/modules/killboard/components/period-stats";
import { RecentActivity } from "@/modules/killboard/components/recent-activity";
import { RewriteReportButton } from "@/modules/killboard/components/rewrite-button";
import { SituationReportPanel } from "@/modules/killboard/components/situation-report";
import { SystemBars } from "@/modules/killboard/components/system-bars";
import { Awards, MvpCard, RunnersUp } from "@/modules/killboard/components/top-pilots";
import { killboardWindows, parseKillboardFilters, rangeLabel } from "@/modules/killboard/filters";
import { KILLBOARD_PERMISSIONS } from "@/modules/killboard/module";
import { getKillboardStatus, getPilots, getRecentActivity, getShips, getTopSystems, getTotals } from "@/modules/killboard/queries";
import { getLatestReport } from "@/modules/killboard/report/generate";
import { pilotEntityRow, shipEntityRow, tableColumns } from "@/modules/killboard/table-rows";
import { rewriteSituationReport } from "./actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.killboard.page.metaTitle };
}

export default async function KillboardPage({ searchParams }: PageProps<"/killboard">) {
  const user = await requirePermission(KILLBOARD_PERMISSIONS.view);
  const { t, f } = await getI18n();
  const tk = t.killboard;
  const settings = await getSettings();
  const corpId = settings["corp.homeCorporationId"];
  if (!corpId) return <NoCorporation />;

  const today = isoDate(new Date());
  const period = parseKillboardFilters(await searchParams, today);
  const w = killboardWindows(period, today);
  const [corp, totals, week, prevWeek, killSystems, lossSystems, recent, ships, pilots, report, status] = await Promise.all([
    getCorporation(corpId),
    getTotals(corpId, w.period),
    getTotals(corpId, w.week),
    getTotals(corpId, w.prevWeek),
    getTopSystems(corpId, w, "kills"),
    getTopSystems(corpId, w, "losses"),
    getRecentActivity(corpId, w.period, 10),
    getShips(corpId, w),
    getPilots(corpId, w),
    getLatestReport(corpId),
    getKillboardStatus(corpId),
  ]);

  const canManage = user.can(KILLBOARD_PERMISSIONS.manage);
  const corpName = corp ? `${corp.name} [${corp.ticker}]` : tk.fallback.corporation(corpId);
  const weekLabel = rangeLabel(w.week, f.locale);
  const periodLabel = rangeLabel(w.period, f.locale);
  const presets = DATE_PRESETS.map((p) => ({ id: p.id, label: t.common.datePresets[p.id], ...p.range(today) }));
  const header = <KillboardHeader corpId={corpId} corpName={corpName} period={period} presets={presets} />;

  if (status.killmails === 0) {
    return (
      <div className="space-y-6">
        {header}
        <NoKillmails status={status} corpName={corpName} />
      </div>
    );
  }

  const columns = tableColumns(t);
  const shipRows = ships.map((s) => shipEntityRow(s, t));
  const pilotRows = pilots.map((p) => pilotEntityRow(p, t));

  return (
    <PendingProvider>
      <div className="space-y-6">
        {header}

        <PendingFrame className="space-y-6">
          <PeriodStats totals={totals} week={week} prevWeek={prevWeek} weekLabel={weekLabel} />

          {pilots.some((p) => p.kills > 0) && (
            <Panel title={tk.topPilots.title} subtitle={tk.topPilots.mostKills(periodLabel)}>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <MvpCard pilot={pilots[0]} period={periodLabel} />
                <RunnersUp pilots={pilots.slice(1, 5).filter((p) => p.kills > 0)} />
              </div>
              <div className="mt-5">
                <Awards pilots={pilots} />
              </div>
            </Panel>
          )}

          <Panel id="pilot-efficiency" title={tk.pilotTable.title} subtitle={tk.pilotTable.subtitle(pilotRows.length, corp?.ticker || null)}>
            <SortableTable entityLabel={tk.pilotTable.entity} columns={columns.pilots} rows={pilotRows} defaultSort="kills" initialRows={10} />
          </Panel>

          <SituationReportPanel
            stored={report}
            canManage={canManage}
            claudeConfigured={Boolean(env().ANTHROPIC_API_KEY)}
            actions={canManage ? <RewriteReportButton action={rewriteSituationReport} /> : undefined}
          />

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title={tk.systems.title.kills} subtitle={tk.systems.subtitle("kills", week.kills, signed(week.kills - prevWeek.kills, f))}>
              <SystemBars rows={killSystems} color={KILL_COLOR} unit="kills" upIsGood />
            </Panel>
            <Panel title={tk.systems.title.losses} subtitle={tk.systems.subtitle("losses", week.losses, signed(week.losses - prevWeek.losses, f))}>
              <SystemBars rows={lossSystems} color={LOSS_COLOR} unit="losses" upIsGood={false} />
            </Panel>
            <IskBreakdownPanel totals={totals} />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-12">
            <Panel title={tk.recent.title} subtitle={tk.recent.subtitle} className="xl:col-span-5">
              <RecentActivity rows={recent} />
            </Panel>
            <Panel title={tk.ships.effectiveTitle} subtitle={tk.ships.effectiveSubtitle} className="xl:col-span-7">
              <SortableTable entityLabel={tk.ships.entity} columns={columns.effective} rows={shipRows} defaultSort="net" initialRows={10} />
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title={tk.ships.usedTitle} subtitle={tk.ships.usedSubtitle}>
              <SortableTable
                entityLabel={tk.ships.entity}
                columns={columns.used}
                rows={ships.filter((s) => s.kills > 0).map((s) => shipEntityRow(s, t))}
                defaultSort="kills"
              />
            </Panel>
            <Panel title={tk.ships.lostTitle} subtitle={tk.ships.lostSubtitle}>
              <SortableTable
                entityLabel={tk.ships.entity}
                columns={columns.lost}
                rows={ships.filter((s) => s.losses > 0).map((s) => shipEntityRow(s, t))}
                defaultSort="losses"
              />
            </Panel>
          </div>
        </PendingFrame>

        <p className="text-xs text-ink-3">
          {tk.page.footer({
            synced: status.lastSyncAt ? f.relativeTime(status.lastSyncAt) : null,
            since: status.since ? f.date(status.since) : null,
            week: weekLabel,
            prevWeek: rangeLabel(w.prevWeek, f.locale),
          })}
          {status.lastError && <span className="text-critical-text"> {tk.page.lastSyncError(status.lastError)}</span>}
        </p>
      </div>
    </PendingProvider>
  );
}

function signed(n: number, f: Formatter): string {
  return n > 0 ? `+${f.integer(n)}` : n < 0 ? `−${f.integer(Math.abs(n))}` : "±0";
}
