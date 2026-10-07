import { Gem, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Portrait } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { SecurityStatus } from "@/components/ui/security";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { CHART_CLASSES, toChartClasses } from "@/modules/mining/class-colors";
import { MiningFilterBar } from "@/modules/mining/components/filter-bar";
import { miningQueryString } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { miningPageContext } from "@/modules/mining/page-context";
import { getFilterOptions, getObserverSummaries, miningScope } from "@/modules/mining/queries";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.mining.observers.metaTitle };
}

export default async function ObserversPage({ searchParams }: PageProps<"/mining/observers">) {
  await requirePermission(MINING_PERMISSIONS.viewCorp);
  const ctx = await miningPageContext(await searchParams);
  const { t, f } = await getI18n();
  const text = t.mining.observers;
  const { filters, valuation } = ctx;
  const [observers, options] = await Promise.all([
    getObserverSummaries(filters, valuation, ctx.homeCorporationId),
    // Refineries are corporation-wide whatever view the overview was left in.
    getFilterOptions(miningScope(ctx.user, ctx.homeCorporationId)),
  ]);

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.mining.module.nav.observers}
          description={text.description}
        />
        <MiningFilterBar filters={filters} options={options} presets={ctx.presets} showMetric={false} showSource={false} />

        {ctx.homeCorporationId === null ? (
          <Glass>
            <EmptyState icon={Gem} title={text.noHomeCorp.title}>
              {text.noHomeCorp.body}
            </EmptyState>
          </Glass>
        ) : observers.length === 0 ? (
          <Glass>
            <EmptyState icon={Gem} title={text.noObservers.title}>
              {text.noObservers.body((role) => (
                <strong>{role}</strong>
              ))}
            </EmptyState>
          </Glass>
        ) : (
          <PendingFrame className="grid gap-4 xl:grid-cols-2">
            {observers.map((o) => {
              const classes = toChartClasses(o.byClass);
              const total = Object.values(classes).reduce((a, b) => a + b, 0);
              return (
                <Glass key={o.observerId} className="px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <SecurityStatus value={o.security} />
                        <h2 className="truncate text-lg font-semibold">{o.name ?? text.structure(o.observerId)}</h2>
                      </div>
                      <div className="mt-1 text-xs text-ink-3">
                        {o.systemName ?? text.unknownSystem} · {text.lastActivity(o.lastUpdated ?? "—")}
                      </div>
                    </div>
                    <Link
                      href={`/mining/ledger?${miningQueryString(filters, { source: "observer", view: "corp", page: 1 })}`}
                      className="shrink-0 text-xs text-accent hover:underline"
                    >
                      {text.ledgerLink}
                    </Link>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-ink-3">{text.value}</div>
                      <div className="text-xl font-semibold">{f.isk(o.value)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-ink-3">{text.volume}</div>
                      <div className="text-xl font-semibold">{f.volume(o.volume)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-ink-3">{text.pilots}</div>
                      <div className="flex items-center gap-2 text-xl font-semibold">
                        {f.integer(o.miners)}
                        {o.foreignMiners > 0 && (
                          <Badge tone="warning">
                            <TriangleAlert className="size-3" aria-hidden /> {text.outsideCorpCount(o.foreignMiners)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {total > 0 && (
                    <div className="mt-4 flex h-2 gap-[2px] overflow-hidden rounded-full">
                      {CHART_CLASSES.filter((c) => classes[c.id] > 0).map((c) => (
                        <div
                          key={c.id}
                          className="h-full first:rounded-l-full last:rounded-r-full"
                          style={{ width: `${(classes[c.id] / total) * 100}%`, background: c.color }}
                          title={`${t.mining.chartClasses[c.id]}: ${f.isk(classes[c.id])}`}
                        />
                      ))}
                    </div>
                  )}

                  <ul className="mt-5 space-y-1.5">
                    {o.topMiners.map((m) => (
                      <li key={m.characterId} className="flex items-center gap-2.5 text-sm">
                        <Portrait id={m.characterId} size={24} />
                        <span className="min-w-0 flex-1 truncate">
                          {m.name}
                          {m.foreign && <span className="ml-1.5 text-xs text-warning">{text.outsideCorp}</span>}
                        </span>
                        <span className="text-xs text-ink-3 tabular-nums">{text.units(f.compact(m.quantity))}</span>
                        <span className="w-24 text-right font-semibold tabular-nums">{f.isk(m.value)}</span>
                      </li>
                    ))}
                    {o.topMiners.length === 0 && <li className="text-sm text-ink-3">{text.noMining}</li>}
                  </ul>
                </Glass>
              );
            })}
          </PendingFrame>
        )}
      </div>
    </PendingProvider>
  );
}
