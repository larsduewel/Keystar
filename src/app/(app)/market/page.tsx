import { AlarmClock, AlertTriangle, Coins, HandCoins, Info, Settings2, Store, Tags, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { MarketFilterBar } from "@/modules/market/components/filter-bar";
import { OrdersTable } from "@/modules/market/components/orders-table";
import { marketQueryString, parseMarketFilters } from "@/modules/market/filters";
import { MARKET_MANAGE_HREF, MARKET_PERMISSIONS } from "@/modules/market/module";
import { enabledCharacterIds, getMarketCoverage, getMarketFilterOptions, getMarketOrders, getMarketSummary } from "@/modules/market/queries";

const PAGE_SIZE = 50;

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.market.metaTitle };
}

export default async function MarketOrdersPage({ searchParams }: PageProps<"/market">) {
  const user = await requirePermission(MARKET_PERMISSIONS.viewOwn);
  const { t, f } = await getI18n();
  const m = t.market;
  const filters = parseMarketFilters(await searchParams);
  // Only characters with market access on are read; the coverage panel still counts the others.
  const scope = { ownCharacterIds: await enabledCharacterIds(user.characterIds) };
  const now = new Date();

  const [{ orders, total }, summary, options, coverage] = await Promise.all([
    getMarketOrders(filters, scope, { limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    getMarketSummary(filters, scope, now),
    getMarketFilterOptions(scope, m.filters),
    getMarketCoverage(user.characterIds),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (page: number) => `?${marketQueryString(filters, { page })}`;
  const locationMax = Math.max(1, ...summary.byLocation.map((l) => l.value));

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.trade.module.navSection}
          title={m.module.nav.orders}
          description={m.page.description}
          actions={
            <>
              {coverage.lastSync && <span className="text-xs text-ink-3">{m.page.synced(f.relativeTime(coverage.lastSync, now))}</span>}
              <ButtonLink href={MARKET_MANAGE_HREF} size="sm">
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
            <MarketFilterBar filters={filters} options={options} />

            <PendingFrame className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile icon={Tags} label={m.stats.selling} value={f.compact(summary.sellValue)} unit="ISK" hint={m.stats.sellOrders(summary.sellOrders)} />
                <StatTile icon={HandCoins} label={m.stats.buying} value={f.compact(summary.buyValue)} unit="ISK" hint={m.stats.buyOrders(summary.buyOrders)} />
                <StatTile icon={Coins} label={m.stats.escrow} value={f.compact(summary.escrow)} unit="ISK" hint={m.stats.escrowHint} />
                <StatTile
                  icon={AlarmClock}
                  label={m.stats.expiringSoon}
                  value={f.integer(summary.expiringSoon)}
                  hint={summary.nextExpiry ? m.stats.nextExpiry(f.relativeTime(summary.nextExpiry, now)) : undefined}
                />
              </div>

              {coverage.tracked === 0 ? (
                <Glass>
                  <EmptyState
                    icon={Store}
                    title={m.empty.notEnabled.title}
                    action={
                      <ButtonLink href={MARKET_MANAGE_HREF} variant="primary">
                        {m.empty.notEnabled.action}
                      </ButtonLink>
                    }
                  >
                    {m.empty.notEnabled.body}
                  </EmptyState>
                </Glass>
              ) : !options.hasOrders ? (
                <Glass>
                  <EmptyState icon={Store} title={m.empty.noOrders.title}>
                    {m.empty.noOrders.body}
                  </EmptyState>
                </Glass>
              ) : orders.length === 0 ? (
                <Glass>
                  <EmptyState icon={Store} title={m.empty.filtered} />
                </Glass>
              ) : (
                <OrdersTable
                  orders={orders}
                  t={m}
                  f={f}
                  now={now}
                  page={filters.page}
                  pages={pages}
                  pageLink={pageLink}
                  showCharacter={options.characters.length > 1}
                  openOnly={filters.view === "open"}
                />
              )}

              <div className="grid gap-4 xl:grid-cols-12">
                <Panel className="xl:col-span-7" title={m.stats.byLocation} subtitle={m.stats.byLocationHint}>
                  {summary.byLocation.length ? (
                    <ul className="space-y-2 text-sm">
                      {summary.byLocation.map((l) => (
                        <li key={l.locationId} className="space-y-1">
                          <div className="flex justify-between gap-4">
                            <span className="min-w-0 truncate text-ink-2" title={l.name ?? undefined}>
                              {l.name ?? m.table.noLocation}
                              {(l.systemName ?? l.regionName) && <span className="text-xs text-ink-3"> · {l.systemName ?? l.regionName}</span>}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              <span className="font-semibold">{f.isk(l.value)}</span>
                              <span className="text-xs text-ink-3"> · {m.stats.locationOrders(l.orders)}</span>
                            </span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-surface-contrast/10">
                            <div className="h-full rounded-full bg-accent/70" style={{ width: `${(l.value / locationMax) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-6 text-center text-sm text-ink-3">{m.empty.noOpenOrders}</p>
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
                        <Link href={MARKET_MANAGE_HREF} className="font-semibold tabular-nums hover:text-accent">
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
