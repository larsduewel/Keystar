import { CheckCheck, ChevronLeft, ChevronRight, Info, Plus, RotateCcw, Trash2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORIES, type ExpenseStatus } from "@/modules/mining/pnl/categories";
import { AutoSubmitSelect, SubmitButton } from "@/modules/mining/pnl/components/form-controls";
import { PnlFilterBar } from "@/modules/mining/pnl/components/pnl-filter-bar";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { pnlQueryString, STATUS_FILTERS } from "@/modules/mining/pnl/filters";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import { getExpenseRows, getFeeRows, getFees, getManualEntries, getPurchases, getWalletStatus } from "@/modules/mining/pnl/queries";
import { SPREAD_DAYS } from "@/modules/mining/pnl/spread";
import {
  addManualEntry,
  deleteManualEntry,
  includeAllSuggested,
  includeAllSuggestedFees,
  setFeeIncluded,
  setPurchaseCategory,
  setPurchaseIncluded,
} from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.pnl.metaTitle.expenses };
}

const PAGE_SIZE = 50;
/** Fees per page of the taxes & fees list (newest first). */
const FEE_PAGE_SIZE = 50;
const inputClass = "glass-inset h-9 w-full rounded-lg px-3 text-sm text-ink";

const statusTone: Record<ExpenseStatus, "good" | "accent" | "neutral"> = {
  counted: "good",
  suggested: "accent",
  excluded: "neutral",
  untagged: "neutral",
};

export default async function PnlExpensesPage({ searchParams }: PageProps<"/mining/pnl/expenses">) {
  const ctx = await pnlPageContext(await searchParams);
  const { t, f } = await getI18n();
  const m = t.pnl.expenses;
  const { filters, scope, user } = ctx;
  const characters = user.characters.map((c) => ({ characterId: c.characterId, name: c.name }));
  const [purchaseRows, feeRows, purchases, fees, entries, wallet] = await Promise.all([
    getExpenseRows(scope),
    getFeeRows(scope),
    getPurchases(scope, { status: filters.status, limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    // Broker fees are reviewed here, on the same status tab as the purchases; sales tax follows its sale.
    getFees(scope, { status: filters.status, kind: "brokers_fee", limit: FEE_PAGE_SIZE, offset: (filters.feePage - 1) * FEE_PAGE_SIZE }),
    getManualEntries(user.id, filters.from, filters.to),
    getWalletStatus(user.id),
  ]);

  // The status tabs cover purchases and broker fees, the two things reviewed here.
  const summary = [...purchaseRows, ...feeRows];
  const sumOf = (rows: { amount: number; count: number }[]) =>
    rows.reduce((sum, r) => ({ amount: sum.amount + r.amount, count: sum.count + r.count }), { amount: 0, count: 0 });
  const suggestedPurchases = sumOf(purchaseRows.filter((r) => r.status === "suggested")).count;
  const suggestedBrokerFees = sumOf(feeRows.filter((r) => r.status === "suggested")).count;
  const byStatus = (status: ExpenseStatus) =>
    summary
      .filter((r) => r.status === status)
      .reduce((sum, r) => ({ amount: sum.amount + r.amount, count: sum.count + r.count }), { amount: 0, count: 0 });
  const counts = Object.fromEntries((["counted", "suggested", "excluded", "untagged"] as const).map((s) => [s, byStatus(s)])) as Record<
    ExpenseStatus,
    { amount: number; count: number }
  >;
  const tabCount = (value: string) =>
    value === "mining" ? counts.counted.count + counts.suggested.count + counts.excluded.count : counts[value as ExpenseStatus].count;
  const pages = Math.max(1, Math.ceil(purchases.total / PAGE_SIZE));
  const feePages = Math.max(1, Math.ceil(fees.total / FEE_PAGE_SIZE));
  const walletOn = wallet.some((w) => w.granted || w.transactions + w.fees > 0);
  const query = pnlQueryString(filters, { page: 1 });
  const today = ctx.today;

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.pnl.metaTitle.expenses}
          description={m.description}
          actions={<PnlTabs current="expenses" query={pnlQueryString(filters, { status: "mining", page: 1 })} />}
        />

        <PnlFilterBar filters={filters} presets={ctx.presets} characters={characters} />

        <PendingFrame className="space-y-6">
          <Panel
            title={m.purchases.title}
            subtitle={m.purchases.subtitle}
            actions={
              suggestedPurchases > 0 && (
                <form action={includeAllSuggested}>
                  <input type="hidden" name="from" value={filters.from} />
                  <input type="hidden" name="to" value={filters.to} />
                  <input type="hidden" name="chars" value={filters.characters.join(",")} />
                  <SubmitButton variant="primary" title={m.purchases.includeAllHint}>
                    <CheckCheck className="size-3.5" aria-hidden /> {m.purchases.includeAll(suggestedPurchases)}
                  </SubmitButton>
                </form>
              )
            }
          >
            {!walletOn ? (
              <div className="flex flex-col items-start gap-3 py-2 text-sm text-ink-2">
                <p className="flex items-start gap-2">
                  <Wallet className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {m.purchases.walletOff}
                </p>
                <ButtonLink href="/mining/pnl/settings" size="sm" variant="primary">
                  {m.purchases.enableWallet}
                </ButtonLink>
              </div>
            ) : (
              <>
                <nav aria-label={m.purchases.statusNav} className="mb-4 flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((s) => {
                    const active = filters.status === s;
                    const amount =
                      s === "mining" ? counts.counted.amount + counts.suggested.amount + counts.excluded.amount : counts[s].amount;
                    return (
                      <Link
                        key={s}
                        href={`?${pnlQueryString(filters, { status: s, page: 1, feePage: 1 })}`}
                        aria-current={active ? "page" : undefined}
                        title={s === "mining" ? undefined : t.pnl.statuses[s].hint}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
                          active ? "glass-chip text-ink" : "text-ink-3 hover:bg-surface-contrast/5 hover:text-ink",
                        )}
                      >
                        {t.pnl.statusFilters[s]}
                        <span className="tabular-nums text-ink-3">{m.purchases.tabCount(tabCount(s), f.compact(amount))}</span>
                      </Link>
                    );
                  })}
                </nav>

                {purchases.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-3">{m.purchases.empty}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="ks-table">
                      <thead>
                        <tr>
                          <th>{m.purchases.columns.date}</th>
                          <th>{m.purchases.columns.item}</th>
                          <th className="num">{m.purchases.columns.quantity}</th>
                          <th className="num">{m.purchases.columns.total}</th>
                          <th>{m.purchases.columns.category}</th>
                          <th>{m.purchases.columns.status}</th>
                          <th className="num">{m.purchases.columns.countIt}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchases.rows.map((p) => (
                          <tr key={`${p.characterId}:${p.transactionId}`} className={cn(p.status === "excluded" && "opacity-60")}>
                            <td className="whitespace-nowrap text-ink-2 tabular-nums">{f.shortDate(p.date.slice(0, 10))}</td>
                            <td>
                              <span className="flex items-center gap-2">
                                <TypeIcon id={p.typeId} size={24} />
                                <span className="min-w-0">
                                  <span className="block max-w-[18rem] truncate text-ink">{p.typeName ?? t.pnl.typeFallback(p.typeId)}</span>
                                  <span className="block max-w-[18rem] truncate text-2xs text-ink-3">
                                    {[p.groupName, p.characterName].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="num">{f.integer(p.quantity)}</td>
                            <td className="num">
                              <span className="block font-semibold">{f.compact(p.amount)}</span>
                              <span className="block text-2xs text-ink-3">
                                {m.purchases.unitPrice(f.unitPrice(p.unitPrice).replace(" ISK", ""))}
                              </span>
                            </td>
                            <td>
                              <form action={setPurchaseCategory.bind(null, p.characterId, p.transactionId)}>
                                <AutoSubmitSelect
                                  name="category"
                                  label={m.purchases.categoryLabel}
                                  className="max-w-[13rem]"
                                  defaultValue={p.category === p.autoCategory ? "" : (p.category ?? "")}
                                >
                                  <option value="">
                                    {p.autoCategory
                                      ? m.purchases.auto(t.pnl.categories[p.autoCategory].label)
                                      : m.purchases.notMiningCost}
                                  </option>
                                  {EXPENSE_CATEGORIES.filter((c) => c !== p.autoCategory).map((c) => (
                                    <option key={c} value={c}>
                                      {t.pnl.categories[c].label}
                                    </option>
                                  ))}
                                </AutoSubmitSelect>
                              </form>
                            </td>
                            <td>
                              <Badge tone={statusTone[p.status]}>{t.pnl.statuses[p.status].label}</Badge>
                            </td>
                            <td className="num">
                              <span className="inline-flex items-center gap-1">
                                {p.status !== "counted" && (
                                  <form action={setPurchaseIncluded.bind(null, p.characterId, p.transactionId, true)}>
                                    <SubmitButton title={m.purchases.includeHint}>
                                      <Plus className="size-3.5" aria-hidden /> {m.purchases.include}
                                    </SubmitButton>
                                  </form>
                                )}
                                {(p.status === "counted" || p.status === "suggested") && (
                                  <form action={setPurchaseIncluded.bind(null, p.characterId, p.transactionId, false)}>
                                    <SubmitButton variant="ghost" title={m.purchases.excludeHint} className="px-2">
                                      <X className="size-3.5" aria-hidden />
                                      <span className="sr-only">{m.purchases.exclude}</span>
                                    </SubmitButton>
                                  </form>
                                )}
                                {p.overrideIncluded !== null && (
                                  <form action={setPurchaseIncluded.bind(null, p.characterId, p.transactionId, null)}>
                                    <SubmitButton variant="ghost" title={m.purchases.reset} className="px-2">
                                      <RotateCcw className="size-3.5" aria-hidden />
                                      <span className="sr-only">{m.purchases.reset}</span>
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
                    <span>{m.purchases.page(filters.page, pages, purchases.total)}</span>
                    <span className="flex gap-2">
                      {filters.page > 1 && (
                        <ButtonLink href={`?${pnlQueryString(filters, { page: filters.page - 1 })}`} size="sm">
                          <ChevronLeft className="size-3.5" aria-hidden /> {m.purchases.newer}
                        </ButtonLink>
                      )}
                      {filters.page < pages && (
                        <ButtonLink href={`?${pnlQueryString(filters, { page: filters.page + 1 })}`} size="sm">
                          {m.purchases.older} <ChevronRight className="size-3.5" aria-hidden />
                        </ButtonLink>
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </Panel>

          {feeRows.length > 0 && (
            <Panel
              title={m.fees.title}
              subtitle={m.fees.subtitle}
              actions={
                suggestedBrokerFees > 0 && (
                  <form action={includeAllSuggestedFees}>
                    <input type="hidden" name="from" value={filters.from} />
                    <input type="hidden" name="to" value={filters.to} />
                    <input type="hidden" name="chars" value={filters.characters.join(",")} />
                    <SubmitButton variant="primary" title={m.fees.includeAllHint}>
                      <CheckCheck className="size-3.5" aria-hidden /> {m.fees.includeAll(suggestedBrokerFees)}
                    </SubmitButton>
                  </form>
                )
              }
            >
              {ctx.incomeSource !== "sales" && (
                <p className="mb-4 flex items-start gap-2 text-sm text-ink-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {m.fees.minedNote}
                </p>
              )}
              {fees.rows.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-3">{m.fees.empty}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ks-table">
                    <thead>
                      <tr>
                        <th>{m.purchases.columns.date}</th>
                        <th>{m.fees.columns.description}</th>
                        <th className="num">{m.purchases.columns.total}</th>
                        <th>{m.purchases.columns.status}</th>
                        <th className="num">{m.purchases.columns.countIt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fees.rows.map((fee) => (
                        <tr key={`${fee.characterId}:${fee.journalId}`} className={cn(fee.status === "excluded" && "opacity-60")}>
                          <td className="whitespace-nowrap text-ink-2 tabular-nums">
                            <span className="block">{f.shortDate(fee.date.slice(0, 10))}</span>
                            <span className="block text-2xs text-ink-3">{m.fees.time(fee.date.slice(11, 16))}</span>
                          </td>
                          <td>
                            <span className="block max-w-[28rem] truncate text-ink" title={fee.description ?? undefined}>
                              {fee.description ?? m.fees.kinds.brokers_fee}
                            </span>
                            <span className="block text-2xs text-ink-3">{fee.characterName ?? t.pnl.characterFallback(fee.characterId)}</span>
                          </td>
                          <td className="num font-semibold">{f.compact(fee.amount)}</td>
                          <td>
                            <Badge tone={statusTone[fee.status]}>{t.pnl.statuses[fee.status].label}</Badge>
                          </td>
                          <td className="num">
                            <span className="inline-flex items-center gap-1">
                              {fee.status !== "counted" && (
                                <form action={setFeeIncluded.bind(null, fee.characterId, fee.journalId, true)}>
                                  <SubmitButton title={m.fees.includeHint}>
                                    <Plus className="size-3.5" aria-hidden /> {m.purchases.include}
                                  </SubmitButton>
                                </form>
                              )}
                              {fee.status !== "excluded" && (
                                <form action={setFeeIncluded.bind(null, fee.characterId, fee.journalId, false)}>
                                  <SubmitButton variant="ghost" title={m.fees.excludeHint} className="px-2">
                                    <X className="size-3.5" aria-hidden />
                                    <span className="sr-only">{m.purchases.exclude}</span>
                                  </SubmitButton>
                                </form>
                              )}
                              {fee.overrideIncluded !== null && (
                                <form action={setFeeIncluded.bind(null, fee.characterId, fee.journalId, null)}>
                                  <SubmitButton variant="ghost" title={m.purchases.reset} className="px-2">
                                    <RotateCcw className="size-3.5" aria-hidden />
                                    <span className="sr-only">{m.purchases.reset}</span>
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
              {feePages > 1 && (
                <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
                  <span>{m.fees.page(filters.feePage, feePages, fees.total)}</span>
                  <span className="flex gap-2">
                    {filters.feePage > 1 && (
                      <ButtonLink href={`?${pnlQueryString(filters, { feePage: filters.feePage - 1 })}`} size="sm">
                        <ChevronLeft className="size-3.5" aria-hidden /> {m.purchases.newer}
                      </ButtonLink>
                    )}
                    {filters.feePage < feePages && (
                      <ButtonLink href={`?${pnlQueryString(filters, { feePage: filters.feePage + 1 })}`} size="sm">
                        {m.purchases.older} <ChevronRight className="size-3.5" aria-hidden />
                      </ButtonLink>
                    )}
                  </span>
                </div>
              )}
              <p className="mt-3 text-2xs text-ink-3">{m.fees.notes}</p>
            </Panel>
          )}

          <div className="grid gap-4 xl:grid-cols-12">
            <Panel className="xl:col-span-5" title={m.add.title} subtitle={m.add.subtitle}>
              <form action={addManualEntry} className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-ink-3">
                  {m.add.date}
                  <input type="date" name="date" required defaultValue={today} max="2100-01-01" className={inputClass} />
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  {m.add.amount}
                  <input name="amount" required inputMode="decimal" placeholder={m.add.amountPlaceholder} className={inputClass} />
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  {m.add.category}
                  <select name="category" defaultValue="subscription" className={inputClass}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t.pnl.categories[c].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  {m.add.spread}
                  <select name="spreadDays" defaultValue="1" className={inputClass}>
                    {SPREAD_DAYS.map((days) => (
                      <option key={days} value={days}>
                        {t.pnl.spread(days)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  {m.add.character}
                  <select name="characterId" defaultValue="" className={inputClass}>
                    <option value="">{m.add.accountWide}</option>
                    {characters.map((c) => (
                      <option key={c.characterId} value={c.characterId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  {m.add.note}
                  <input name="description" maxLength={200} placeholder={m.add.notePlaceholder} className={inputClass} />
                </label>
                <div className="sm:col-span-2">
                  <SubmitButton variant="primary" size="md">
                    <Plus className="size-4" aria-hidden /> {m.add.submit}
                  </SubmitButton>
                </div>
              </form>
            </Panel>

            <Panel className="xl:col-span-7" title={m.manual.title} subtitle={m.manual.subtitle}>
              {entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-3">{m.manual.empty}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ks-table">
                    <thead>
                      <tr>
                        <th>{m.manual.columns.date}</th>
                        <th>{m.manual.columns.category}</th>
                        <th>{m.manual.columns.character}</th>
                        <th>{m.manual.columns.note}</th>
                        <th className="num">{m.manual.columns.amount}</th>
                        <th className="num" aria-label={m.manual.columns.actions} />
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap text-ink-2 tabular-nums">
                            {f.shortDate(e.date)}
                            {e.spreadDays > 1 && <span className="ml-1 text-2xs text-ink-3">{m.manual.spreadDays(e.spreadDays)}</span>}
                          </td>
                          <td>{t.pnl.categories[e.category].label}</td>
                          <td className="text-ink-2">
                            {e.characterId === null ? (
                              <span className="whitespace-nowrap">{m.add.accountWide}</span>
                            ) : (
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                <Portrait id={e.characterId} size={24} />
                                {e.characterName ?? t.pnl.characterFallback(e.characterId)}
                              </span>
                            )}
                          </td>
                          <td className="max-w-[16rem] truncate text-ink-2">{e.description || "—"}</td>
                          <td className="num font-semibold">{f.compact(e.amount)}</td>
                          <td className="num">
                            <form action={deleteManualEntry.bind(null, e.id)}>
                              <SubmitButton variant="ghost" title={m.manual.deleteHint}>
                                <Trash2 className="size-3.5" aria-hidden />
                              </SubmitButton>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-2xs text-ink-3">
                {m.manual.footer(
                  <Link href={`/mining/pnl?${query}`} className="text-accent hover:underline">
                    {m.manual.back}
                  </Link>,
                )}
              </p>
            </Panel>
          </div>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
