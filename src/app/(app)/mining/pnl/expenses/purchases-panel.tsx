import { CheckCheck, Wallet } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/modules/mining/pnl/categories";
import { AutoSubmitSelect, SubmitButton } from "@/modules/mining/pnl/components/form-controls";
import { IncludeActions, Pager, StatusTabs } from "@/modules/mining/pnl/components/review-controls";
import { pnlQueryString, type PnlFilters } from "@/modules/mining/pnl/filters";
import type { PurchaseRow } from "@/modules/mining/pnl/queries";
import type { ReviewTotals } from "@/modules/mining/pnl/review-totals";
import { statusTone } from "@/modules/mining/pnl/status-tone";
import { includeAllSuggested, setPurchaseCategory, setPurchaseIncluded } from "../actions";

/** Wallet purchases under review: status tabs, one page of purchases with their category and include/exclude controls. */
export async function PurchasesPanel({
  filters,
  purchases,
  pageSize,
  totals,
  suggested,
  walletOn,
}: {
  filters: PnlFilters;
  purchases: { rows: PurchaseRow[]; total: number };
  pageSize: number;
  /** Purchases and broker fees together: the status tabs cover both. */
  totals: ReviewTotals;
  /** Purchases still waiting for a decision. */
  suggested: number;
  /** At least one character imports its wallet (or has imported it before). */
  walletOn: boolean;
}) {
  const { t } = await getI18n();
  const m = t.pnl.expenses.purchases;
  const tt = t.pnl.toast;
  const pages = Math.max(1, Math.ceil(purchases.total / pageSize));
  return (
    <Panel
      title={m.title}
      subtitle={m.subtitle}
      actions={
        suggested > 0 && (
          <ActionForm action={includeAllSuggested} success={tt.purchasesIncluded(suggested)} failed={tt.failed} errors={tt.errors}>
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
          <StatusTabs filters={filters} totals={totals} side="expenses" />
          {purchases.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-3">{m.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>{m.columns.date}</th>
                    <th>{m.columns.item}</th>
                    <th className="num">{m.columns.quantity}</th>
                    <th className="num">{m.columns.total}</th>
                    <th>{m.columns.category}</th>
                    <th>{m.columns.status}</th>
                    <th className="num">{m.columns.countIt}</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.rows.map((p) => (
                    <PurchaseTableRow key={`${p.characterId}:${p.transactionId}`} purchase={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={filters.page}
            pages={pages}
            summary={m.page(filters.page, pages, purchases.total)}
            hrefFor={(page) => `?${pnlQueryString(filters, { page })}`}
          />
        </>
      )}
    </Panel>
  );
}

async function PurchaseTableRow({ purchase: p }: { purchase: PurchaseRow }) {
  const { t, f } = await getI18n();
  const m = t.pnl.expenses.purchases;
  const tt = t.pnl.toast;
  return (
    <tr className={cn(p.status === "excluded" && "opacity-60")}>
      <td className="whitespace-nowrap text-ink-2 tabular-nums">{f.shortDate(p.date.slice(0, 10))}</td>
      <td>
        <span className="flex items-center gap-2">
          <TypeIcon id={p.typeId} size={24} />
          <span className="min-w-0">
            <span className="block max-w-[18rem] truncate text-ink">{p.typeName ?? t.pnl.typeFallback(p.typeId)}</span>
            <span className="block max-w-[18rem] truncate text-2xs text-ink-3">{[p.groupName, p.characterName].filter(Boolean).join(" · ")}</span>
          </span>
        </span>
      </td>
      <td className="num">{f.integer(p.quantity)}</td>
      <td className="num">
        <span className="block font-semibold">{f.compact(p.amount)}</span>
        <span className="block text-2xs text-ink-3">{m.unitPrice(f.unitPrice(p.unitPrice).replace(" ISK", ""))}</span>
      </td>
      <td>
        <ActionForm action={setPurchaseCategory.bind(null, p.characterId, p.transactionId)} failed={tt.failed} errors={tt.errors} reset="failure">
          <AutoSubmitSelect
            name="category"
            label={m.categoryLabel}
            className="max-w-[13rem]"
            defaultValue={p.category === p.autoCategory ? "" : (p.category ?? "")}
          >
            <option value="">{p.autoCategory ? m.auto(t.pnl.categories[p.autoCategory].label) : m.notMiningCost}</option>
            {EXPENSE_CATEGORIES.filter((c) => c !== p.autoCategory).map((c) => (
              <option key={c} value={c}>
                {t.pnl.categories[c].label}
              </option>
            ))}
          </AutoSubmitSelect>
        </ActionForm>
      </td>
      <td>
        <Badge tone={statusTone[p.status]}>{t.pnl.statuses[p.status].label}</Badge>
      </td>
      <td className="num">
        <IncludeActions
          status={p.status}
          overrideIncluded={p.overrideIncluded}
          canExclude={p.status === "counted" || p.status === "suggested"}
          setIncluded={(included) => setPurchaseIncluded.bind(null, p.characterId, p.transactionId, included)}
          includeHint={m.includeHint}
          excludeHint={m.excludeHint}
        />
      </td>
    </tr>
  );
}
