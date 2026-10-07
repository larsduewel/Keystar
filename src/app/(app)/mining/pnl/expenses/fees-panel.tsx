import { CheckCheck, Info } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/modules/mining/pnl/components/form-controls";
import { IncludeActions, Pager } from "@/modules/mining/pnl/components/review-controls";
import { pnlQueryString, type PnlFilters } from "@/modules/mining/pnl/filters";
import type { FeeRow } from "@/modules/mining/pnl/queries";
import type { IncomeSource } from "@/modules/mining/pnl/scope";
import { includeAllSuggestedFees, setFeeIncluded } from "../actions";
import { statusTone } from "@/modules/mining/pnl/status-tone";

/** Broker fees under review, paged separately from the purchases. */
export async function FeesPanel({
  filters,
  fees,
  pageSize,
  suggested,
  incomeSource,
}: {
  filters: PnlFilters;
  fees: { rows: FeeRow[]; total: number };
  pageSize: number;
  /** Broker fees still waiting for a decision. */
  suggested: number;
  incomeSource: IncomeSource;
}) {
  const { t } = await getI18n();
  const m = t.pnl.expenses.fees;
  const tt = t.pnl.toast;
  const pages = Math.max(1, Math.ceil(fees.total / pageSize));
  return (
    <Panel
      title={m.title}
      subtitle={m.subtitle}
      actions={
        suggested > 0 && (
          <ActionForm action={includeAllSuggestedFees} success={tt.feesIncluded(suggested)} failed={tt.failed} errors={tt.errors}>
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
      {incomeSource !== "sales" && (
        <p className="mb-4 flex items-start gap-2 text-sm text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          {m.minedNote}
        </p>
      )}
      {fees.rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">{m.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="ks-table">
            <thead>
              <tr>
                <th>{t.pnl.expenses.purchases.columns.date}</th>
                <th>{m.columns.description}</th>
                <th className="num">{t.pnl.expenses.purchases.columns.total}</th>
                <th>{t.pnl.expenses.purchases.columns.status}</th>
                <th className="num">{t.pnl.expenses.purchases.columns.countIt}</th>
              </tr>
            </thead>
            <tbody>
              {fees.rows.map((fee) => (
                <FeeTableRow key={`${fee.characterId}:${fee.journalId}`} fee={fee} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        page={filters.feePage}
        pages={pages}
        summary={m.page(filters.feePage, pages, fees.total)}
        hrefFor={(feePage) => `?${pnlQueryString(filters, { feePage })}`}
      />
      <p className="mt-3 text-2xs text-ink-3">{m.notes}</p>
    </Panel>
  );
}

async function FeeTableRow({ fee }: { fee: FeeRow }) {
  const { t, f } = await getI18n();
  const m = t.pnl.expenses.fees;
  return (
    <tr className={cn(fee.status === "excluded" && "opacity-60")}>
      <td className="whitespace-nowrap text-ink-2 tabular-nums">
        <span className="block">{f.shortDate(fee.date.slice(0, 10))}</span>
        <span className="block text-2xs text-ink-3">{m.time(fee.date.slice(11, 16))}</span>
      </td>
      <td>
        <span className="block max-w-[28rem] truncate text-ink" title={fee.description ?? undefined}>
          {fee.description ?? m.kinds.brokers_fee}
        </span>
        <span className="block text-2xs text-ink-3">{fee.characterName ?? t.pnl.characterFallback(fee.characterId)}</span>
      </td>
      <td className="num font-semibold">{f.compact(fee.amount)}</td>
      <td>
        <Badge tone={statusTone[fee.status]}>{t.pnl.statuses[fee.status].label}</Badge>
      </td>
      <td className="num">
        <IncludeActions
          status={fee.status}
          overrideIncluded={fee.overrideIncluded}
          canExclude={fee.status !== "excluded"}
          setIncluded={(included) => setFeeIncluded.bind(null, fee.characterId, fee.journalId, included)}
          includeHint={m.includeHint}
          excludeHint={m.excludeHint}
        />
      </td>
    </tr>
  );
}
