import { CheckCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { INCOME_CATEGORIES } from "@/modules/mining/pnl/categories";
import { AutoSubmitSelect, SubmitButton } from "@/modules/mining/pnl/components/form-controls";
import { IncludeActions, Pager, StatusTabs } from "@/modules/mining/pnl/components/review-controls";
import { pnlQueryString, type PnlFilters } from "@/modules/mining/pnl/filters";
import type { SaleRow, SaleTxRow } from "@/modules/mining/pnl/queries";
import { reviewTotals, suggestedCount } from "@/modules/mining/pnl/review-totals";
import { statusTone } from "@/modules/mining/pnl/status-tone";
import { includeAllSuggestedSales, setSaleCategory, setSaleIncluded } from "../actions";

/** Wallet sales under review: status tabs, the sales tax line, one page of sales with their category and include/exclude controls. */
export async function SalesPanel({
  filters,
  summary,
  sales,
  pageSize,
  walletOn,
  overviewHref,
}: {
  filters: PnlFilters;
  /** Every sale in the range, per status: behind the tabs and the sales tax line. */
  summary: SaleRow[];
  sales: { rows: SaleTxRow[]; total: number };
  pageSize: number;
  /** At least one character imports its wallet (or has imported it before). */
  walletOn: boolean;
  /** The P&L overview on the same filters, linked from the footer. */
  overviewHref: string;
}) {
  const { t } = await getI18n();
  const m = t.pnl.income.sales;
  const tt = t.pnl.toast;
  const suggested = suggestedCount(summary);
  const pages = Math.max(1, Math.ceil(sales.total / pageSize));
  return (
    <Panel
      title={m.title}
      subtitle={m.subtitle}
      actions={
        suggested > 0 && (
          <ActionForm action={includeAllSuggestedSales} success={tt.salesIncluded(suggested)} failed={tt.failed} errors={tt.errors}>
            <input type="hidden" name="from" value={filters.from} />
            <input type="hidden" name="to" value={filters.to} />
            <input type="hidden" name="chars" value={filters.characters.join(",")} />
            <SubmitButton variant="primary" title={m.includeAllHint}>
              <CheckCheck className="size-3.5" aria-hidden /> {m.includeAll(suggested)}
            </SubmitButton>
          </ActionForm>
        )
      }
    >
      {!walletOn ? (
        <div className="flex flex-col items-start gap-3 py-2 text-sm text-ink-2">
          <p className="flex items-start gap-2">
            <Wallet className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {m.walletOff}
          </p>
          <ButtonLink href="/mining/pnl/settings" size="sm" variant="primary">
            {m.enableWallet}
          </ButtonLink>
        </div>
      ) : (
        <>
          <SalesTaxLine summary={summary} />
          <StatusTabs filters={filters} totals={reviewTotals(summary)} side="income" />
          {sales.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-3">{m.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>{t.pnl.expenses.purchases.columns.date}</th>
                    <th>{t.pnl.expenses.purchases.columns.item}</th>
                    <th className="num">{t.pnl.expenses.purchases.columns.quantity}</th>
                    <th className="num">{t.pnl.expenses.purchases.columns.total}</th>
                    <th className="num">{m.columns.tax}</th>
                    <th>{t.pnl.expenses.purchases.columns.category}</th>
                    <th>{t.pnl.expenses.purchases.columns.status}</th>
                    <th className="num">{t.pnl.expenses.purchases.columns.countIt}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.rows.map((s) => (
                    <SaleTableRow key={`${s.characterId}:${s.transactionId}`} sale={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={filters.page} pages={pages} summary={m.page(filters.page, pages, sales.total)} hrefFor={(page) => `?${pnlQueryString(filters, { page })}`} />
          <p className="mt-3 text-2xs text-ink-3">
            {m.footer(
              <Link href={overviewHref} className="text-accent hover:underline">
                {t.pnl.expenses.manual.back}
              </Link>,
            )}
          </p>
        </>
      )}
    </Panel>
  );
}

/** Sales tax deducted from the counted sales, and what is still pending; the amounts in the table are net of it. */
async function SalesTaxLine({ summary }: { summary: SaleRow[] }) {
  const { t, f } = await getI18n();
  const m = t.pnl.income.sales.salesTax;
  const taxOf = (status: SaleRow["status"]) =>
    summary.filter((r) => r.status === status).reduce((acc, r) => ({ tax: acc.tax + r.tax, count: acc.count + r.count }), { tax: 0, count: 0 });
  const counted = taxOf("counted");
  const pending = taxOf("suggested");
  const imported = summary.some((r) => r.tax > 0);
  // Tax only on excluded or other sales doesn't count: no line for it, and it isn't "none imported".
  if (imported && counted.tax + pending.tax === 0) return null;
  return (
    <p className="mb-4 text-sm text-ink-2">
      {imported ? m.counted(f.compact(counted.tax), counted.count) : m.none}
      {pending.tax > 0 && m.pending(f.compact(pending.tax))}
    </p>
  );
}

async function SaleTableRow({ sale: s }: { sale: SaleTxRow }) {
  const { t, f } = await getI18n();
  const m = t.pnl.income.sales;
  const p = t.pnl.expenses.purchases;
  const tt = t.pnl.toast;
  return (
    <tr className={cn(s.status === "excluded" && "opacity-60")}>
      <td className="whitespace-nowrap text-ink-2 tabular-nums">{f.shortDate(s.date.slice(0, 10))}</td>
      <td>
        <span className="flex items-center gap-2">
          <TypeIcon id={s.typeId} size={24} />
          <span className="min-w-0">
            <span className="block max-w-[18rem] truncate text-ink">{s.typeName ?? t.pnl.typeFallback(s.typeId)}</span>
            <span className="block max-w-[18rem] truncate text-2xs text-ink-3">{[s.groupName, s.characterName].filter(Boolean).join(" · ")}</span>
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
            <span className="block text-2xs text-ink-3">{m.net(f.compact(s.amount - s.tax))}</span>
          </>
        )}
      </td>
      <td>
        <ActionForm action={setSaleCategory.bind(null, s.characterId, s.transactionId)} failed={tt.failed} errors={tt.errors} reset="failure">
          <AutoSubmitSelect name="category" label={p.categoryLabel} className="max-w-[13rem]" defaultValue={s.category === s.autoCategory ? "" : (s.category ?? "")}>
            <option value="">{s.autoCategory ? p.auto(t.pnl.incomeCategories[s.autoCategory].label) : m.notMiningIncome}</option>
            {INCOME_CATEGORIES.filter((c) => c !== s.autoCategory).map((c) => (
              <option key={c} value={c}>
                {t.pnl.incomeCategories[c].label}
              </option>
            ))}
          </AutoSubmitSelect>
        </ActionForm>
      </td>
      <td>
        <Badge tone={statusTone[s.status]}>{t.pnl.saleStatuses[s.status].label}</Badge>
      </td>
      <td className="num">
        <IncludeActions
          status={s.status}
          overrideIncluded={s.overrideIncluded}
          canExclude={s.status === "counted" || s.status === "suggested"}
          setIncluded={(included) => setSaleIncluded.bind(null, s.characterId, s.transactionId, included)}
          includeHint={m.includeHint}
          excludeHint={m.excludeHint}
        />
      </td>
    </tr>
  );
}
