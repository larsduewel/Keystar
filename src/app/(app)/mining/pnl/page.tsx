import { Box, Clock, Coins, Info, Pickaxe, ReceiptText, Scale, Wallet } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { StatTile } from "@/components/ui/stat-tile";
import { getI18n } from "@/i18n/server";
import type { Formatter } from "@/lib/format";
import { CHART_CLASS_COLOR } from "@/modules/mining/class-colors";
import { PnlChart } from "@/modules/mining/pnl/components/pnl-chart";
import { PnlFilterBar } from "@/modules/mining/pnl/components/pnl-filter-bar";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { SignedIsk } from "@/modules/mining/pnl/components/signed-isk";
import { pnlQueryString } from "@/modules/mining/pnl/filters";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import {
  getActivityStats,
  getExpenseRows,
  getFeeRows,
  getIncomeRows,
  getManualDaily,
  getPriceRules,
  getSaleRows,
  getWalletStatus,
} from "@/modules/mining/pnl/queries";
import { buildPnlReport } from "@/modules/mining/pnl/report";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.pnl.metaTitle.overview };
}

/** f.compact() with a typographic minus. */
function signed(f: Formatter, value: number) {
  return `${value < 0 ? "−" : ""}${f.compact(Math.abs(value))}`;
}

function hoursValue(f: Formatter, h: number) {
  return h >= 10 ? f.integer(h) : f.number(h, 1);
}

export default async function MiningPnlPage({ searchParams }: PageProps<"/mining/pnl">) {
  const ctx = await pnlPageContext(await searchParams);
  const { t, f } = await getI18n();
  const m = t.pnl.overview;
  const { filters, scope, user } = ctx;
  const characters = user.characters.map((c) => ({ characterId: c.characterId, name: c.name }));

  const fromSales = ctx.incomeSource === "sales";
  const [income, sales, expenses, fees, manual, activity, rules, wallet] = await Promise.all([
    getIncomeRows(scope),
    fromSales ? getSaleRows(scope) : [],
    getExpenseRows(scope),
    fromSales ? getFeeRows(scope) : [],
    getManualDaily(scope, user.characterIds),
    getActivityStats(scope),
    getPriceRules(user.id),
    getWalletStatus(user.id),
  ]);
  const report = buildPnlReport({ ...filters, incomeSource: ctx.incomeSource, income, sales, expenses, fees, manual, activity, characters });
  const { totals } = report;
  // Costs waiting for review: purchases and broker fees.
  const suggestedCosts = {
    count: report.purchases.suggested.count + report.fees.suggested.count,
    amount: report.purchases.suggested.amount + report.fees.suggested.amount,
  };
  const query = pnlQueryString(filters, { bucket: "day", page: 1 });
  const walletOn = wallet.filter((w) => w.granted).length;
  const hasData = income.length > 0 || sales.length > 0 || expenses.length > 0 || fees.length > 0 || manual.length > 0;
  const ratePct = scope.ratePct;
  const rate = ratePct !== 100 ? f.percent(ratePct / 100, Number.isInteger(ratePct) ? 0 : 1) : null;
  const hours = (h: number) => t.pnl.hours(hoursValue(f, h));
  const incomeHint = [rate ? m.tiles.rate(rate) : null, rules.length ? m.tiles.rules(rules.length) : null]
    .filter(Boolean)
    .join(" · ");
  const margin = totals.income > 0 ? `${totals.net < 0 ? "−" : ""}${f.percent(Math.abs(totals.net / totals.income), 0)}` : null;

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.pnl.title}
          description={m.description}
          actions={<PnlTabs current="overview" query={pnlQueryString(filters, { bucket: "day", status: "mining", page: 1 })} />}
        />

        <PnlFilterBar filters={filters} presets={ctx.presets} characters={characters} showBucket />

        {!hasData ? (
          <Glass>
            <EmptyState
              icon={Pickaxe}
              title={m.empty.title}
              action={
                <ButtonLink href="/mining/pnl/settings" variant="primary">
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
                icon={Scale}
                className="col-span-2 lg:col-span-4 xl:col-span-4"
                label={m.tiles.net(f.shortDate(filters.from), f.shortDate(filters.to))}
                value={signed(f, totals.net)}
                unit="ISK"
                hint={m.tiles.netHint(f.compact(totals.income), f.compact(totals.expenses), margin)}
              />
              <StatTile
                className="xl:col-span-2"
                icon={Coins}
                label={m.tiles.income}
                value={f.compact(totals.income)}
                unit="ISK"
                hint={
                  !fromSales ? (
                    incomeHint || ctx.valuationLabel
                  ) : report.sales.suggested.count > 0 ? (
                    <Link
                      href={`/mining/pnl/income?${pnlQueryString(filters, { status: "suggested", bucket: "day", page: 1 })}`}
                      className="text-accent hover:underline"
                    >
                      {m.tiles.salesSuggested(report.sales.suggested.count, f.compact(report.sales.suggested.amount))}
                    </Link>
                  ) : (
                    m.tiles.fromSales(report.sales.counted.count, f.compact(totals.minedIncome))
                  )
                }
              />
              <StatTile
                className="xl:col-span-2"
                icon={ReceiptText}
                label={m.tiles.expenses}
                value={f.compact(totals.expenses)}
                unit="ISK"
                hint={
                  suggestedCosts.count > 0 ? (
                    <Link
                      href={`/mining/pnl/expenses?${pnlQueryString(filters, { status: "suggested", bucket: "day", page: 1 })}`}
                      className="text-accent hover:underline"
                    >
                      {m.tiles.suggested(suggestedCosts.count, f.compact(suggestedCosts.amount))}
                    </Link>
                  ) : totals.manual > 0 ? (
                    m.tiles.manual(f.compact(totals.manual))
                  ) : undefined
                }
              />
              <StatTile
                className="xl:col-span-2"
                icon={Clock}
                label={m.tiles.iskPerHour}
                value={report.iskPerHour.gross === null ? "—" : f.compact(report.iskPerHour.gross)}
                unit={report.iskPerHour.gross === null ? undefined : "ISK"}
                hint={
                  report.iskPerHour.gross === null
                    ? m.tiles.noActivity
                    : m.tiles.iskPerHourHint(signed(f, report.iskPerHour.net ?? 0), hours(report.activity.wallClockHours))
                }
              />
              <StatTile
                className="xl:col-span-2"
                icon={Box}
                label={m.tiles.costPerM3}
                value={report.costPerM3 === null ? "—" : f.unitPrice(report.costPerM3).replace(" ISK", "")}
                unit={report.costPerM3 === null ? undefined : "ISK"}
                hint={m.tiles.mined(f.volume(totals.volume))}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel className="xl:col-span-8" title={m.chartTitle[filters.bucket]} subtitle={m.chartSubtitle}>
                <PnlChart buckets={report.buckets} bucket={filters.bucket} />
              </Panel>
              <Panel
                className="xl:col-span-4"
                title={m.expenses.title}
                subtitle={m.expenses.subtitle}
                actions={
                  <ButtonLink href={`/mining/pnl/expenses?${query}`} size="sm">
                    {m.expenses.review}
                  </ButtonLink>
                }
              >
                {report.byCategory.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-3">{m.expenses.empty}</p>
                ) : (
                  <ul className="space-y-2.5 text-sm">
                    {report.byCategory.map((c) => (
                      <li key={c.category} className="flex items-center justify-between gap-3">
                        <span className="text-ink-2">{t.pnl.categories[c.category].label}</span>
                        <span className="font-semibold tabular-nums">{f.compact(c.amount)}</span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-3 border-t border-surface-contrast/8 pt-2.5 text-xs text-ink-3">
                      <span>{m.expenses.split}</span>
                      <span className="tabular-nums">
                        {f.compact(totals.wallet)} · {f.compact(totals.manual)}
                      </span>
                    </li>
                  </ul>
                )}
                {walletOn === 0 && (
                  <p className="mt-4 flex items-start gap-1.5 border-t border-surface-contrast/8 pt-3 text-xs text-ink-3">
                    <Wallet className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      {m.expenses.walletOff(
                        <Link href="/mining/pnl/settings" className="text-accent hover:underline">
                          {m.expenses.enable}
                        </Link>,
                      )}
                    </span>
                  </p>
                )}
              </Panel>
            </div>

            {/* Side by side only on wide screens: German numbers and labels need the room. */}
            <div className="grid gap-4 2xl:grid-cols-12">
              <Panel className="2xl:col-span-7" title={m.byCharacter.title} subtitle={m.byCharacter.subtitle}>
                <div className="overflow-x-auto">
                  <table className="ks-table">
                    <thead>
                      <tr>
                        <th>{m.columns.character}</th>
                        <th className="num">{m.columns.income}</th>
                        <th className="num">{m.columns.volume}</th>
                        <th className="num">{m.columns.active}</th>
                        <th className="num">{m.columns.iskPerHour}</th>
                        <th className="num">{m.columns.expenses}</th>
                        <th className="num">{m.columns.net}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.characters.map((c) => (
                        <tr key={c.characterId ?? "account"}>
                          <td>
                            {c.characterId === null ? (
                              <span className="whitespace-nowrap text-ink-3">{t.pnl.accountWide}</span>
                            ) : (
                              <span className="flex items-center gap-2.5 whitespace-nowrap text-ink">
                                <Portrait id={c.characterId} size={24} />
                                {c.name ?? t.pnl.characterFallback(c.characterId)}
                              </span>
                            )}
                          </td>
                          <td className="num">{c.income ? f.compact(c.income) : "—"}</td>
                          <td className="num text-ink-2">{c.volume ? f.compact(c.volume) : "—"}</td>
                          <td className="num text-ink-2">{c.hours ? hours(c.hours) : "—"}</td>
                          <td className="num text-ink-2">{c.iskPerHour === null ? "—" : f.compact(c.iskPerHour)}</td>
                          <td className="num text-ink-2">{c.expenses ? f.compact(c.expenses) : "—"}</td>
                          <td className="num">
                            <SignedIsk value={c.net} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel
                className="2xl:col-span-5"
                title={m.byActivity.title}
                subtitle={m.byActivity.subtitle[report.allocation ?? "none"]}
              >
                {report.activities.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-3">{m.byActivity.empty}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="ks-table">
                      <thead>
                        <tr>
                          <th>{m.columns.activity}</th>
                          <th className="num">{m.columns.income}</th>
                          <th className="num">{m.columns.iskPerHour}</th>
                          <th className="num">{m.columns.expenses}</th>
                          <th className="num">{m.columns.net}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.activities.map((a) => (
                          <tr key={a.activity}>
                            <td>
                              <span className="flex items-center gap-2">
                                <span className="size-2.5 rounded-[3px]" style={{ background: CHART_CLASS_COLOR[a.activity] }} aria-hidden />
                                {t.mining.chartClasses[a.activity]}
                              </span>
                            </td>
                            <td className="num">{a.income ? f.compact(a.income) : "—"}</td>
                            <td className="num text-ink-2">{a.iskPerHour === null ? "—" : f.compact(a.iskPerHour)}</td>
                            <td className="num text-ink-2">{a.expenses ? f.compact(a.expenses) : "—"}</td>
                            <td className="num">
                              <SignedIsk value={a.net} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <Panel title={m.how.title}>
              <ul className="grid gap-3 text-xs text-ink-2 md:grid-cols-2">
                <li className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>
                    {fromSales
                      ? m.how.incomeSales(f.compact(totals.minedIncome))
                      : m.how.income(
                          ctx.valuationLabel,
                          rate,
                          totals.baseIncome !== totals.income ? f.compact(totals.baseIncome) : null,
                        )}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>{m.how.expenses()}</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>
                    {m.how.iskPerHour(
                      hours(report.activity.wallClockHours),
                      hours(report.activity.characterHours),
                      report.activity.trackedSince ? f.shortDate(report.activity.trackedSince.toISOString().slice(0, 10)) : null,
                      f.percent(report.activity.measuredShare, 0),
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>{m.how.costPerM3(totals.unpricedRows)}</span>
                </li>
              </ul>
            </Panel>
          </PendingFrame>
        )}
      </div>
    </PendingProvider>
  );
}
