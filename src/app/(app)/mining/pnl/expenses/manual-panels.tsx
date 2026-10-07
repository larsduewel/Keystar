import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Portrait } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { EXPENSE_CATEGORIES } from "@/modules/mining/pnl/categories";
import { SubmitButton } from "@/modules/mining/pnl/components/form-controls";
import type { ManualEntry } from "@/modules/mining/pnl/queries";
import { SPREAD_DAYS } from "@/modules/mining/pnl/spread";
import { addManualEntry, deleteManualEntry } from "../actions";

/** Costs the wallet doesn't show (subscriptions, out-of-game purchases): a form to add one, and the list of them. */

const inputClass = "glass-inset h-9 w-full rounded-lg px-3 text-sm text-ink";

export async function AddManualEntryPanel({
  characters,
  today,
  className,
}: {
  characters: { characterId: number; name: string }[];
  today: string;
  className?: string;
}) {
  const { t } = await getI18n();
  const m = t.pnl.expenses.add;
  const tt = t.pnl.toast;
  return (
    <Panel className={className} title={m.title} subtitle={m.subtitle}>
      <ActionForm action={addManualEntry} success={tt.costAdded} failed={tt.failed} errors={tt.errors} reset="success" className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-ink-3">
          {m.date}
          <input type="date" name="date" required defaultValue={today} max="2100-01-01" className={inputClass} />
        </label>
        <label className="space-y-1 text-xs text-ink-3">
          {m.amount}
          <input name="amount" required inputMode="decimal" placeholder={m.amountPlaceholder} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs text-ink-3">
          {m.category}
          <select name="category" defaultValue="subscription" className={inputClass}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.pnl.categories[c].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-3">
          {m.spread}
          <select name="spreadDays" defaultValue="1" className={inputClass}>
            {SPREAD_DAYS.map((days) => (
              <option key={days} value={days}>
                {t.pnl.spread(days)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-3">
          {m.character}
          <select name="characterId" defaultValue="" className={inputClass}>
            <option value="">{m.accountWide}</option>
            {characters.map((c) => (
              <option key={c.characterId} value={c.characterId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-3">
          {m.note}
          <input name="description" maxLength={200} placeholder={m.notePlaceholder} className={inputClass} />
        </label>
        <div className="sm:col-span-2">
          <SubmitButton variant="primary" size="md">
            <Plus className="size-4" aria-hidden /> {m.submit}
          </SubmitButton>
        </div>
      </ActionForm>
    </Panel>
  );
}

export async function ManualEntriesPanel({
  entries,
  overviewHref,
  className,
}: {
  entries: ManualEntry[];
  /** The P&L overview on the same filters, linked from the footer. */
  overviewHref: string;
  className?: string;
}) {
  const { t, f } = await getI18n();
  const m = t.pnl.expenses.manual;
  const tt = t.pnl.toast;
  return (
    <Panel className={className} title={m.title} subtitle={m.subtitle}>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">{m.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="ks-table">
            <thead>
              <tr>
                <th>{m.columns.date}</th>
                <th>{m.columns.category}</th>
                <th>{m.columns.character}</th>
                <th>{m.columns.note}</th>
                <th className="num">{m.columns.amount}</th>
                <th className="num" aria-label={m.columns.actions} />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-ink-2 tabular-nums">
                    {f.shortDate(e.date)}
                    {e.spreadDays > 1 && <span className="ml-1 text-2xs text-ink-3">{m.spreadDays(e.spreadDays)}</span>}
                  </td>
                  <td>{t.pnl.categories[e.category].label}</td>
                  <td className="text-ink-2">
                    {e.characterId === null ? (
                      <span className="whitespace-nowrap">{t.pnl.expenses.add.accountWide}</span>
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
                    <ActionForm action={deleteManualEntry.bind(null, e.id)} success={tt.costDeleted} failed={tt.failed} errors={tt.errors}>
                      <SubmitButton variant="ghost" title={m.deleteHint}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </SubmitButton>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-2xs text-ink-3">
        {m.footer(
          <Link href={overviewHref} className="text-accent hover:underline">
            {m.back}
          </Link>,
        )}
      </p>
    </Panel>
  );
}
