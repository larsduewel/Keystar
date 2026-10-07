import { ChevronLeft, ChevronRight, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import type { ExpenseStatus } from "../categories";
import { pnlQueryString, STATUS_FILTERS, type PnlFilters } from "../filters";
import { tabTotal, type ReviewTotals } from "../review-totals";
import { SubmitButton } from "./form-controls";

/** Controls shared by the review tables of the P&L pages: status tabs, count it / leave it out / back to automatic, and paging. */

/** The review status tabs; each shows how many rows it holds and what they add up to. */
export async function StatusTabs({
  filters,
  totals,
  side,
}: {
  filters: PnlFilters;
  totals: ReviewTotals;
  /** Purchases and fees read "mining cost", sales read "mining income". */
  side: "expenses" | "income";
}) {
  const { t, f } = await getI18n();
  const labels = side === "expenses" ? t.pnl.statusFilters : t.pnl.saleStatusFilters;
  const statuses = side === "expenses" ? t.pnl.statuses : t.pnl.saleStatuses;
  const navLabel = side === "expenses" ? t.pnl.expenses.purchases.statusNav : t.pnl.income.sales.statusNav;
  return (
    <nav aria-label={navLabel} className="mb-4 flex flex-wrap gap-2">
      {STATUS_FILTERS.map((s) => {
        const active = filters.status === s;
        const total = tabTotal(totals, s);
        return (
          <Link
            key={s}
            href={`?${pnlQueryString(filters, { status: s, page: 1 })}`}
            aria-current={active ? "page" : undefined}
            title={s === "mining" ? undefined : statuses[s].hint}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
              active ? "glass-chip text-ink" : "text-ink-3 hover:bg-surface-contrast/5 hover:text-ink",
            )}
          >
            {labels[s]}
            <span className="tabular-nums text-ink-3">{t.pnl.expenses.purchases.tabCount(total.count, f.compact(total.amount))}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The include, exclude and reset buttons of one reviewed row. `setIncluded(true | false | null)` returns the server
 * action bound to the row; null puts the decision back to automatic.
 */
export async function IncludeActions({
  status,
  overrideIncluded,
  canExclude,
  setIncluded,
  includeHint,
  excludeHint,
}: {
  status: ExpenseStatus;
  overrideIncluded: boolean | null;
  /** Whether "leave it out" makes sense for this row (an untagged purchase is already out). */
  canExclude: boolean;
  setIncluded: (included: boolean | null) => () => Promise<ActionResult>;
  includeHint: string;
  excludeHint: string;
}) {
  const { t } = await getI18n();
  const m = t.pnl.expenses.purchases;
  const failure = { failed: t.pnl.toast.failed, errors: t.pnl.toast.errors };
  return (
    // `relative` keeps the icon buttons' sr-only labels inside a table's scroll box on phones.
    <span className="relative inline-flex items-center gap-1">
      {status !== "counted" && (
        <ActionForm action={setIncluded(true)} {...failure}>
          <SubmitButton title={includeHint}>
            <Plus className="size-3.5" aria-hidden /> {m.include}
          </SubmitButton>
        </ActionForm>
      )}
      {canExclude && (
        <ActionForm action={setIncluded(false)} {...failure}>
          <SubmitButton variant="ghost" title={excludeHint} className="px-2">
            <X className="size-3.5" aria-hidden />
            <span className="sr-only">{m.exclude}</span>
          </SubmitButton>
        </ActionForm>
      )}
      {overrideIncluded !== null && (
        <ActionForm action={setIncluded(null)} {...failure}>
          <SubmitButton variant="ghost" title={m.reset} className="px-2">
            <RotateCcw className="size-3.5" aria-hidden />
            <span className="sr-only">{m.reset}</span>
          </SubmitButton>
        </ActionForm>
      )}
    </span>
  );
}

/** Newer / older links under a paged list; renders nothing when everything fits on one page. */
export async function Pager({
  page,
  pages,
  summary,
  hrefFor,
}: {
  page: number;
  pages: number;
  /** "Page 2 of 5 · 230 purchases", in the viewer's language. */
  summary: string;
  hrefFor: (page: number) => string;
}) {
  const { t } = await getI18n();
  const m = t.pnl.expenses.purchases;
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
      <span>{summary}</span>
      <span className="flex gap-2">
        {page > 1 && (
          <ButtonLink href={hrefFor(page - 1)} size="sm">
            <ChevronLeft className="size-3.5" aria-hidden /> {m.newer}
          </ButtonLink>
        )}
        {page < pages && (
          <ButtonLink href={hrefFor(page + 1)} size="sm">
            {m.older} <ChevronRight className="size-3.5" aria-hidden />
          </ButtonLink>
        )}
      </span>
    </div>
  );
}
