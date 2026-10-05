import { CheckCheck, ChevronLeft, ChevronRight, Info, Plus, RotateCcw, Wallet, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { TypeIcon } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { INCOME_CATEGORIES, type ExpenseStatus } from "@/modules/mining/pnl/categories";
import { AutoSubmitSelect, SubmitButton } from "@/modules/mining/pnl/components/form-controls";
import { PnlFilterBar } from "@/modules/mining/pnl/components/pnl-filter-bar";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { pnlQueryString, STATUS_FILTERS } from "@/modules/mining/pnl/filters";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import { summarizeOreFlows } from "@/modules/mining/pnl/ore-flows";
import { getOreFlows, getSaleRows, getSales, getWalletStatus } from "@/modules/mining/pnl/queries";
import { includeAllSuggestedSales, setSaleCategory, setSaleIncluded } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.pnl.metaTitle.income };
}

const PAGE_SIZE = 50;

const statusTone: Record<ExpenseStatus, "good" | "accent" | "neutral"> = {
  counted: "good",
  suggested: "accent",
  excluded: "neutral",
  untagged: "neutral",
};

/** Wallet sales review: which sales were mining income (counted when income comes from wallet sales). */
export default async function PnlIncomePage({ searchParams }: PageProps<"/mining/pnl/income">) {
  const ctx = await pnlPageContext(await searchParams);
  const { t, f } = await getI18n();
  const m = t.pnl.income;
  const p = t.pnl.expenses.purchases;
  const { filters, scope, user } = ctx;
  const characters = user.characters.map((c) => ({ characterId: c.characterId, name: c.name }));
  const [summary, sales, wallet, oreFlows] = await Promise.all([
    getSaleRows(scope),
    getSales(scope, { status: filters.status, limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    getWalletStatus(user.id),
    getOreFlows(scope),
  ]);
  const flows = summarizeOreFlows(oreFlows);
  const fl = m.flows;
  const price = (value: number) => f.unitPrice(value).replace(" ISK", "");
  const signedUnits = (value: number) => `${value < 0 ? "−" : ""}${f.compact(Math.abs(value))}`;

  const byStatus = (status: ExpenseStatus) =>
    summary
      .filter((r) => r.status === status)
      .reduce((sum, r) => ({ amount: sum.amount + r.amount, count: sum.count + r.count }), { amount: 0, count: 0 });
  const counts = Object.fromEntries((["counted", "suggested", "excluded", "untagged"] as const).map((s) => [s, byStatus(s)])) as Record<
    ExpenseStatus,
    { amount: number; count: number }
  >;
  // Sales tax is deducted from each sale: amounts below are what the sales brought in after tax.
  const taxOf = (status: ExpenseStatus) =>
    summary.filter((r) => r.status === status).reduce((t, r) => ({ tax: t.tax + r.tax, count: t.count + r.count }), { tax: 0, count: 0 });
  const taxCounted = taxOf("counted");
  const taxPending = taxOf("suggested");
  const taxImported = summary.some((r) => r.tax > 0);
  const tabCount = (value: string) =>
    value === "mining" ? counts.counted.count + counts.suggested.count + counts.excluded.count : counts[value as ExpenseStatus].count;
  const pages = Math.max(1, Math.ceil(sales.total / PAGE_SIZE));
  const walletOn = wallet.some((w) => w.granted || w.transactions + w.fees > 0);
  const query = pnlQueryString(filters, { page: 1 });

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.pnl.metaTitle.income}
          description={m.description}
          actions={<PnlTabs current="income" query={pnlQueryString(filters, { status: "mining", page: 1 })} />}
        />

        <PnlFilterBar filters={filters} presets={ctx.presets} characters={characters} />

        {ctx.incomeSource === "mined" && walletOn && (
          <Glass className="flex items-start gap-2 rounded-2xl px-4 py-3 text-sm text-ink-2">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              {m.minedNotice(
                <Link href={`/mining/pnl/settings?${query}`} className="text-accent hover:underline">
                  {m.switchToSales}
                </Link>,
              )}
            </span>
          </Glass>
        )}

        <PendingFrame className="space-y-6">
          <Panel
            title={m.sales.title}
            subtitle={m.sales.subtitle}
            actions={
              counts.suggested.count > 0 && (
                <form action={includeAllSuggestedSales}>
                  <input type="hidden" name="from" value={filters.from} />
                  <input type="hidden" name="to" value={filters.to} />
                  <input type="hidden" name="chars" value={filters.characters.join(",")} />
                  <SubmitButton variant="primary" title={m.sales.includeAllHint}>
                    <CheckCheck className="size-3.5" aria-hidden /> {m.sales.includeAll(counts.suggested.count)}
                  </SubmitButton>
                </form>
              )
            }
          >
            {!walletOn ? (
              <div className="flex flex-col items-start gap-3 py-2 text-sm text-ink-2">
                <p className="flex items-start gap-2">
                  <Wallet className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {m.sales.walletOff}
                </p>
                <ButtonLink href="/mining/pnl/settings" size="sm" variant="primary">
                  {m.sales.enableWallet}
                </ButtonLink>
              </div>
            ) : (
              <>
                {/* Tax only on excluded or other sales doesn't count: no line for it, and it isn't "none imported". */}
                {(!taxImported || taxCounted.tax + taxPending.tax > 0) && (
                  <p className="mb-4 text-sm text-ink-2">
                    {!taxImported
                      ? m.sales.salesTax.none
                      : m.sales.salesTax.counted(f.compact(taxCounted.tax), taxCounted.count)}
                    {taxPending.tax > 0 && m.sales.salesTax.pending(f.compact(taxPending.tax))}
                  </p>
                )}
                <nav aria-label={m.sales.statusNav} className="mb-4 flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((s) => {
                    const active = filters.status === s;
                    const amount =
                      s === "mining" ? counts.counted.amount + counts.suggested.amount + counts.excluded.amount : counts[s].amount;
                    return (
                      <Link
                        key={s}
                        href={`?${pnlQueryString(filters, { status: s, page: 1 })}`}
                        aria-current={active ? "page" : undefined}
                        title={s === "mining" ? undefined : t.pnl.saleStatuses[s].hint}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
                          active ? "glass-chip text-ink" : "text-ink-3 hover:bg-surface-contrast/5 hover:text-ink",
                        )}
                      >
                        {t.pnl.saleStatusFilters[s]}
                        <span className="tabular-nums text-ink-3">{p.tabCount(tabCount(s), f.compact(amount))}</span>
                      </Link>
                    );
                  })}
                </nav>

                {sales.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-3">{m.sales.empty}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="ks-table">
                      <thead>
                        <tr>
                          <th>{p.columns.date}</th>
                          <th>{p.columns.item}</th>
                          <th className="num">{p.columns.quantity}</th>
                          <th className="num">{p.columns.total}</th>
                          <th className="num">{m.sales.columns.tax}</th>
                          <th>{p.columns.category}</th>
                          <th>{p.columns.status}</th>
                          <th className="num">{p.columns.countIt}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.rows.map((s) => (
                          <tr key={`${s.characterId}:${s.transactionId}`} className={cn(s.status === "excluded" && "opacity-60")}>
                            <td className="whitespace-nowrap text-ink-2 tabular-nums">{f.shortDate(s.date.slice(0, 10))}</td>
                            <td>
                              <span className="flex items-center gap-2">
                                <TypeIcon id={s.typeId} size={24} />
                                <span className="min-w-0">
                                  <span className="block max-w-[18rem] truncate text-ink">{s.typeName ?? t.pnl.typeFallback(s.typeId)}</span>
                                  <span className="block max-w-[18rem] truncate text-2xs text-ink-3">
                                    {[s.groupName, s.characterName].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="num">{f.integer(s.quantity)}</td>
                            <td className="num">
                              <span className="block font-semibold">{f.compact(s.amount)}</span>
                              <span className="block text-2xs text-ink-3">{p.unitPrice(f.unitPrice(s.unitPrice).replace(" ISK", ""))}</span>
                            </td>
                            <td className="num">
                              {s.tax === null ? (
                                <span className="text-ink-3">—</span>
                              ) : (
                                <>
                                  <span className="block text-ink-2">
                                    −{f.compact(s.tax)}
                                    {s.amount > 0 && <span className="text-ink-3"> ({f.percent(s.tax / s.amount, 2)})</span>}
                                  </span>
                                  <span className="block text-2xs text-ink-3">{m.sales.net(f.compact(s.amount - s.tax))}</span>
                                </>
                              )}
                            </td>
                            <td>
                              <form action={setSaleCategory.bind(null, s.characterId, s.transactionId)}>
                                <AutoSubmitSelect
                                  name="category"
                                  label={p.categoryLabel}
                                  className="max-w-[13rem]"
                                  defaultValue={s.category === s.autoCategory ? "" : (s.category ?? "")}
                                >
                                  <option value="">
                                    {s.autoCategory ? p.auto(t.pnl.incomeCategories[s.autoCategory].label) : m.sales.notMiningIncome}
                                  </option>
                                  {INCOME_CATEGORIES.filter((c) => c !== s.autoCategory).map((c) => (
                                    <option key={c} value={c}>
                                      {t.pnl.incomeCategories[c].label}
                                    </option>
                                  ))}
                                </AutoSubmitSelect>
                              </form>
                            </td>
                            <td>
                              <Badge tone={statusTone[s.status]}>{t.pnl.saleStatuses[s.status].label}</Badge>
                            </td>
                            <td className="num">
                              <span className="inline-flex items-center gap-1">
                                {s.status !== "counted" && (
                                  <form action={setSaleIncluded.bind(null, s.characterId, s.transactionId, true)}>
                                    <SubmitButton title={m.sales.includeHint}>
                                      <Plus className="size-3.5" aria-hidden /> {p.include}
                                    </SubmitButton>
                                  </form>
                                )}
                                {(s.status === "counted" || s.status === "suggested") && (
                                  <form action={setSaleIncluded.bind(null, s.characterId, s.transactionId, false)}>
                                    <SubmitButton variant="ghost" title={m.sales.excludeHint} className="px-2">
                                      <X className="size-3.5" aria-hidden />
                                      <span className="sr-only">{p.exclude}</span>
                                    </SubmitButton>
                                  </form>
                                )}
                                {s.overrideIncluded !== null && (
                                  <form action={setSaleIncluded.bind(null, s.characterId, s.transactionId, null)}>
                                    <SubmitButton variant="ghost" title={p.reset} className="px-2">
                                      <RotateCcw className="size-3.5" aria-hidden />
                                      <span className="sr-only">{p.reset}</span>
                                    </SubmitButton>
                                  </form>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {pages > 1 && (
                  <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
                    <span>{m.sales.page(filters.page, pages, sales.total)}</span>
                    <span className="flex gap-2">
                      {filters.page > 1 && (
                        <ButtonLink href={`?${pnlQueryString(filters, { page: filters.page - 1 })}`} size="sm">
                          <ChevronLeft className="size-3.5" aria-hidden /> {p.newer}
                        </ButtonLink>
                      )}
                      {filters.page < pages && (
                        <ButtonLink href={`?${pnlQueryString(filters, { page: filters.page + 1 })}`} size="sm">
                          {p.older} <ChevronRight className="size-3.5" aria-hidden />
                        </ButtonLink>
                      )}
                    </span>
                  </div>
                )}
                <p className="mt-3 text-2xs text-ink-3">
                  {m.sales.footer(
                    <Link href={`/mining/pnl?${query}`} className="text-accent hover:underline">
                      {t.pnl.expenses.manual.back}
                    </Link>,
                  )}
                </p>
              </>
            )}
          </Panel>

          {flows.rows.length > 0 && (
            <Panel title={fl.title} subtitle={fl.subtitle}>
              <p className="mb-4 text-sm text-ink-2">
                {fl.summary(
                  f.compact(flows.totals.soldIsk),
                  flows.totals.soldAtValuation > 0 ? f.compact(flows.totals.soldAtValuation) : null,
                  f.compact(flows.totals.leftValue),
                  f.volume(flows.totals.leftVolume),
                )}
              </p>
              <div className="overflow-x-auto">
                <table className="ks-table">
                  <thead>
                    <tr>
                      <th>{fl.columns.ore}</th>
                      <th className="num">{fl.columns.mined}</th>
                      <th className="num">{fl.columns.sold}</th>
                      <th className="num">{fl.columns.left}</th>
                      <th className="num">{fl.columns.got}</th>
                      <th className="num">{fl.columns.valuation}</th>
                      <th className="num">{fl.columns.isk}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flows.rows.map((r) => (
                      <tr key={r.typeId}>
                        <td>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <TypeIcon id={r.typeId} size={22} />
                            {r.typeName}
                          </span>
                        </td>
                        <td className="num">{r.mined ? f.compact(r.mined) : "—"}</td>
                        <td className="num">
                          <span className="block">{r.sold ? f.compact(r.sold) : "—"}</span>
                          {r.compressedShare > 0 && (
                            <span className="block text-2xs text-ink-3">{fl.compressed(f.percent(r.compressedShare, 0))}</span>
                          )}
                        </td>
                        <td className={cn("num", r.left < 0 ? "text-ink-3" : "text-ink-2")}>{r.left ? signedUnits(r.left) : "—"}</td>
                        <td className="num font-semibold">{r.soldUnitPrice === null ? "—" : price(r.soldUnitPrice)}</td>
                        <td className="num text-ink-2">
                          {r.valuationUnitPrice ? (
                            <>
                              {price(r.valuationUnitPrice)}
                              {r.vsValuation !== null && <span className="text-ink-3"> ({f.percent(r.vsValuation, 0)})</span>}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">{r.soldIsk ? f.compact(r.soldIsk) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-2xs text-ink-3">{fl.notes}</p>
            </Panel>
          )}
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
