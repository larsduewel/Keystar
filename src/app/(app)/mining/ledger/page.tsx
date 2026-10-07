import { ChevronLeft, ChevronRight, Download, KeyRound, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { SecurityStatus } from "@/components/ui/security";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { oreClassColor } from "@/modules/mining/class-colors";
import { MiningFilterBar } from "@/modules/mining/components/filter-bar";
import { LedgerDay, LedgerDaysProvider, LedgerDaysToggleAll } from "@/modules/mining/components/ledger-days";
import { miningQueryString } from "@/modules/mining/filters";
import { groupLedgerByDay } from "@/modules/mining/ledger-groups";
import { MINING_MANAGE_HREF, MINING_PERMISSIONS } from "@/modules/mining/module";
import { miningPageContext } from "@/modules/mining/page-context";
import {
  canViewCorpMining,
  getFilterOptions,
  getLedgerDayTotals,
  getLedgerRows,
  hasObservers,
} from "@/modules/mining/queries";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.mining.ledger.metaTitle };
}

const PAGE_SIZE = 50;

export default async function LedgerPage({ searchParams }: PageProps<"/mining/ledger">) {
  const ctx = await miningPageContext(await searchParams);
  const { t, f } = await getI18n();
  const l = t.mining.ledger;
  const col = t.mining.columns;
  const { filters, scope, valuation, user } = ctx;
  const offset = (filters.page - 1) * PAGE_SIZE;
  // The day totals also give the row count, so the rows query can skip its own COUNT.
  const [{ rows }, dayTotals, options, observersOnRecord] = await Promise.all([
    getLedgerRows(filters, scope, valuation, { limit: PAGE_SIZE, offset, count: false }),
    getLedgerDayTotals(filters, scope, valuation),
    getFilterOptions(scope),
    hasObservers(ctx.homeCorporationId),
  ]);
  const total = dayTotals.reduce((sum, d) => sum + d.entries, 0);
  const days = groupLedgerByDay(rows, dayTotals);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (page: number) => `?${miningQueryString(filters, { page })}`;

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.mining.module.nav.ledger}
          description={l.description}
          actions={
            <>
              <ButtonLink href={`/mining?${miningQueryString(filters, { page: 1 })}`} size="sm">
                <LayoutDashboard className="size-4" aria-hidden /> {l.overview}
              </ButtonLink>
              {user.can(MINING_PERMISSIONS.viewOwn) && (
                <ButtonLink href={MINING_MANAGE_HREF} size="sm">
                  <KeyRound className="size-4" aria-hidden /> {t.mining.access}
                </ButtonLink>
              )}
              {user.can(MINING_PERMISSIONS.export) && (
                <a
                  href={`/mining/export?${miningQueryString(filters, { page: 1 })}`}
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
          showMetric={false}
          showView={canViewCorpMining(user, ctx.homeCorporationId)}
          // Without moon drills every source shows the same rows; keep it while a URL still selects one.
          showSource={observersOnRecord || filters.source !== "all"}
        />

        <PendingFrame>
          {/* Keyed by the query: every page and filter change starts with all days expanded. */}
          <LedgerDaysProvider key={miningQueryString(filters)} dates={days.map((d) => d.date)}>
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 text-xs text-ink-3">
                <span>
                  {l.entries(total, <span className="font-semibold text-ink">{f.integer(total)}</span>)} ·{" "}
                  {ctx.valuationLabel}
                </span>
                <div className="flex items-center gap-3">
                  {days.length > 0 && <LedgerDaysToggleAll />}
                  <span>{l.pageOf(filters.page, pages)}</span>
                </div>
              </div>
              <div className="overflow-x-auto px-2 pb-2">
                <table className="ks-table">
                  <thead>
                    <tr>
                      <th>{col.character}</th>
                      <th>{col.ore}</th>
                      <th>{col.location}</th>
                      <th>{col.source}</th>
                      <th className="num">{col.units}</th>
                      <th className="num">{col.volume}</th>
                      <th className="num">{col.unitPrice}</th>
                      <th className="num">{col.value}</th>
                    </tr>
                  </thead>
                  {rows.length === 0 && (
                    <tbody>
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-ink-3">
                          {l.empty}
                        </td>
                      </tr>
                    </tbody>
                  )}
                  {days.map((day) => (
                    <LedgerDay
                      key={day.date}
                      date={day.date}
                      span={4}
                      label={
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span className="font-semibold text-ink tabular-nums">{f.date(day.date)}</span>
                          <span className="text-ink-2">{f.weekday(day.date)}</span>
                          <span className="text-xs text-ink-3">
                            {l.dayMeta(day.totals.entries, day.totals.characters)}
                            {day.rows.length < day.totals.entries && ` · ${l.dayPartial(day.rows.length, day.totals.entries)}`}
                          </span>
                        </span>
                      }
                      totals={
                        <>
                          <td className="num">{f.integer(day.totals.quantity)}</td>
                          <td className="num">{f.volume(day.totals.volume, { compact: false })}</td>
                          <td />
                          <td className="num">
                            <span className="font-semibold text-ink">{f.isk(day.totals.value)}</span>
                          </td>
                        </>
                      }
                    >
                      {day.rows.map((r, i) => (
                        <tr key={`${r.characterId}-${r.typeId}-${r.systemId}-${r.source}-${i}`}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <Portrait id={r.characterId} size={26} />
                              <div className="min-w-0 leading-tight">
                                <div className="truncate font-medium">{r.characterName}</div>
                                {r.ownerName && r.ownerName !== r.characterName && (
                                  <div className="truncate text-2xs text-ink-3">{r.ownerName}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <TypeIcon id={r.typeId} size={24} />
                              <div className="leading-tight">
                                <div className="font-medium">{r.typeName}</div>
                                <div className="flex items-center gap-1 text-2xs text-ink-3">
                                  <span className="size-1.5 rounded-full" style={{ background: oreClassColor(r.oreClass) }} aria-hidden />
                                  {t.eve.oreClasses[r.oreClass].short}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <SecurityStatus value={r.security} />
                              <div className="leading-tight">
                                <div>{r.systemName ?? l.unknownSystem}</div>
                                {r.observerName && <div className="text-2xs text-ink-3">{r.observerName}</div>}
                              </div>
                            </div>
                          </td>
                          <td>
                            <Badge tone={r.source === "observer" ? "accent" : "neutral"}>
                              {l.sourceBadge[r.source]}
                            </Badge>
                          </td>
                          <td className="num">{f.integer(r.quantity)}</td>
                          <td className="num">{f.volume(r.volume, { compact: false })}</td>
                          <td className="num text-ink-2">{r.unitPrice ? f.unitPrice(r.unitPrice) : "—"}</td>
                          <td className="num font-semibold">{f.isk(r.value)}</td>
                        </tr>
                      ))}
                    </LedgerDay>
                  ))}
                </table>
              </div>
              {pages > 1 && (
                <nav className="flex items-center justify-end gap-2 border-t border-surface-contrast/6 px-5 py-3" aria-label={l.pagination}>
                  <Link
                    href={pageLink(Math.max(1, filters.page - 1))}
                    aria-disabled={filters.page <= 1}
                    className={cn(
                      "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs",
                      filters.page <= 1 && "pointer-events-none opacity-40",
                    )}
                  >
                    <ChevronLeft className="size-4" aria-hidden /> {l.previous}
                  </Link>
                  <Link
                    href={pageLink(Math.min(pages, filters.page + 1))}
                    aria-disabled={filters.page >= pages}
                    className={cn(
                      "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs",
                      filters.page >= pages && "pointer-events-none opacity-40",
                    )}
                  >
                    {l.next} <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </nav>
              )}
            </Glass>
          </LedgerDaysProvider>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
