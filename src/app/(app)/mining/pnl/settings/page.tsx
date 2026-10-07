import { Activity, KeyRound, Plus, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { env } from "@/core/env";
import { reauthorizeHref } from "@/core/modules/registry";
import { getI18n } from "@/i18n/server";
import { SubmitButton, SwitchButton } from "@/modules/mining/pnl/components/form-controls";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { pnlQueryString } from "@/modules/mining/pnl/filters";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import { INCOME_SOURCES } from "@/modules/mining/pnl/scope";
import { getMinedTypes, getPriceRules, getSaleHints, getWalletStatus, HINT_DAYS, hintRange } from "@/modules/mining/pnl/queries";
import { MINING_LEDGER_SCOPE, MINING_MANAGE_HREF } from "@/modules/mining/module";
import { WALLET_SCOPE } from "@/modules/wallet/module";
import {
  addPriceRule,
  applyPriceHint,
  deletePriceRule,
  deleteWalletData,
  setAutoInclude,
  setAutoIncludeSales,
  setIncomeRate,
  setIncomeSource,
} from "../actions";
import { setOptionalScope } from "@/app/(app)/characters/actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.pnl.metaTitle.settings };
}

const inputClass = "glass-inset h-9 w-full rounded-lg px-3 text-sm text-ink";
const RETURN_TO = "/mining/pnl/settings";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function PnlSettingsPage({ searchParams }: PageProps<"/mining/pnl/settings">) {
  const ctx = await pnlPageContext(await searchParams);
  const { t, f } = await getI18n();
  const m = t.pnl.settings;
  const { filters, scope, user } = ctx;
  const demo = env().KEYSTAR_DEMO_MODE;
  const hints = hintRange(ctx.today);
  const allOwn = { ...scope, characterIds: user.characterIds };
  const [wallet, rules, saleHints, mined] = await Promise.all([
    getWalletStatus(user.id),
    getPriceRules(user.id),
    getSaleHints(allOwn, hints),
    getMinedTypes(user.characterIds, hints.from),
  ]);
  const ruleTypes = new Map([
    ...mined.map((type) => [type.id, type.name] as const),
    ...rules.map((r) => [r.typeId, r.typeName ?? String(r.typeId)] as const),
  ]);
  const price = (value: number) => f.unitPrice(value).replace(" ISK", "");
  const sw = t.characters.scopeSwitch;
  const walletLabel = t.wallet.module.scopes.characterWalletLabel;
  const tt = t.pnl.toast;
  const miningAccessLink = (text: string) => (
    <Link href={MINING_MANAGE_HREF} className="text-accent hover:underline">
      {text}
    </Link>
  );
  const failure = { failed: tt.failed, errors: tt.errors };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.mining.module.navSection}
        title={t.pnl.metaTitle.settings}
        description={m.description}
        actions={<PnlTabs current="settings" query={pnlQueryString(filters, { status: "mining", page: 1 })} />}
      />

      <Panel title={m.wallet.title} subtitle={m.wallet.subtitle}>
        <div className="space-y-3">
          {wallet.map((w) => {
            const enable = reauthorizeHref(w.grantedScopes, { add: [WALLET_SCOPE], returnTo: RETURN_TO, characterId: w.characterId });
            const tracksMining = w.grantedScopes.includes(MINING_LEDGER_SCOPE);
            return (
              <Glass key={w.characterId} className="flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
                <Portrait id={w.characterId} size={44} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{w.name}</span>
                    {w.tokenStatus === "invalid" ? (
                      <StatusBadge status="error" label={m.wallet.revoked} />
                    ) : w.granted ? (
                      <StatusBadge status={w.lastStatus === "error" ? "warning" : "ok"} label={m.wallet.on} />
                    ) : (
                      <StatusBadge status="pending" label={m.wallet.off} />
                    )}
                  </div>
                  <p className="text-xs text-ink-3">
                    {w.granted
                      ? w.transactions > 0
                        ? m.wallet.imported(
                            w.transactions,
                            f.shortDate(isoDay(w.firstTransactionAt!)),
                            f.relativeTime(w.lastSuccessAt),
                          )
                        : w.lastSuccessAt
                          ? m.wallet.noTransactions(f.relativeTime(w.lastSuccessAt))
                          : m.wallet.firstImport
                      : w.transactions + w.fees > 0
                        ? m.wallet.kept(w.transactions + w.fees)
                        : m.wallet.nothing}
                    {w.granted && w.lastStatus === "error" && w.lastError ? ` · ${w.lastError}` : ""}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-ink-3">
                    <Activity className="size-3.5" aria-hidden />
                    {/* Measured history stays after the ledger is switched off, but nothing new is measured. */}
                    {tracksMining
                      ? w.activitySince
                        ? m.wallet.activitySince(f.shortDate(isoDay(w.activitySince)))
                        : m.wallet.activityNext
                      : m.wallet.activityNone(miningAccessLink)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {w.granted && (
                    <ActionForm
                      action={setAutoInclude.bind(null, w.characterId, !w.autoInclude)}
                      success={tt.autoCount(w.name, !w.autoInclude)}
                      {...failure}
                    >
                      <SwitchButton on={w.autoInclude} label={m.wallet.autoCount} />
                    </ActionForm>
                  )}
                  {w.granted && (
                    <ActionForm
                      action={setAutoIncludeSales.bind(null, w.characterId, !w.autoIncludeSales)}
                      success={tt.autoCountSales(w.name, !w.autoIncludeSales)}
                      {...failure}
                    >
                      <SwitchButton on={w.autoIncludeSales} label={m.wallet.autoCountSales} />
                    </ActionForm>
                  )}
                  {w.granted || w.switchedOff ? (
                    // In Keystar only: the token keeps the scope until the character is re-authorised.
                    <ActionForm
                      action={setOptionalScope.bind(null, w.characterId, WALLET_SCOPE, !w.granted)}
                      success={w.granted ? sw.off(walletLabel, w.name) : sw.on(walletLabel, w.name)}
                      successDetail={w.granted ? sw.offDetail : undefined}
                      failed={sw.failed(walletLabel, w.name)}
                      errors={sw.errors}
                    >
                      {w.granted ? (
                        <Button type="submit" size="sm" variant="ghost">
                          {m.wallet.stop}
                        </Button>
                      ) : (
                        <Button type="submit" size="sm" variant="primary">
                          <Wallet className="size-3.5" aria-hidden /> {m.wallet.enable}
                        </Button>
                      )}
                    </ActionForm>
                  ) : demo ? (
                    <Button size="sm" disabled title={m.wallet.demo}>
                      <KeyRound className="size-3.5" aria-hidden /> {m.wallet.enable}
                    </Button>
                  ) : (
                    <ButtonLink href={enable} size="sm" variant="primary">
                      <Wallet className="size-3.5" aria-hidden /> {m.wallet.enable}
                    </ButtonLink>
                  )}
                  {!w.granted && w.transactions + w.fees > 0 && (
                    <ActionForm
                      action={deleteWalletData.bind(null, w.characterId)}
                      success={m.wallet.toast.deleted(w.name)}
                      failed={m.wallet.toast.failed(w.name)}
                      errors={m.wallet.toast.errors}
                    >
                      <Button type="submit" size="sm" variant="danger" title={m.wallet.deleteHistoryHint}>
                        <Trash2 className="size-3.5" aria-hidden /> {m.wallet.deleteHistory}
                      </Button>
                    </ActionForm>
                  )}
                </div>
              </Glass>
            );
          })}
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-ink-3">
          <li>{m.wallet.notes.enable()}</li>
          <li>{m.wallet.notes.autoCount}</li>
          <li>{m.wallet.notes.autoCountSales}</li>
          <li>{m.wallet.notes.stop}</li>
        </ul>
      </Panel>

      <div className="grid gap-4 2xl:grid-cols-12">
        <Panel className="2xl:col-span-4" title={m.income.title}>
          <ActionForm
            action={setIncomeSource}
            successByField={{ name: "source", titles: tt.incomeSource }}
            {...failure}
            className="space-y-3"
          >
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs text-ink-3">{m.income.source.label}</legend>
              {INCOME_SOURCES.map((source) => (
                <label key={source} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                  <input type="radio" name="source" value={source} defaultChecked={ctx.incomeSource === source} className="mt-1 accent-current" />
                  <span>
                    <span className="block">{m.income.source.options[source]}</span>
                    <span className="block text-xs text-ink-3">{m.income.source.hints[source]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <SubmitButton variant="primary">{m.income.save}</SubmitButton>
          </ActionForm>
          <ActionForm action={setIncomeRate} success={tt.incomeRate} {...failure} className="mt-5 space-y-3 border-t border-surface-contrast/8 pt-4">
            <div>
              <div className="eve-label text-2xs text-ink-3">{m.income.valuation}</div>
              <p className="text-xs text-ink-3">{m.income.base(ctx.valuationLabel)}</p>
            </div>
            <label className="block space-y-1 text-xs text-ink-3">
              {m.income.share}
              <span className="flex items-center gap-2">
                <input name="rate" defaultValue={f.number(scope.ratePct, Number.isInteger(scope.ratePct) ? 0 : 1)} inputMode="decimal" required className={inputClass} />
                <span className="text-sm text-ink-2">%</span>
              </span>
            </label>
            <p className="text-xs text-ink-3">{m.income.hint}</p>
            <SubmitButton variant="primary">{m.income.save}</SubmitButton>
          </ActionForm>
        </Panel>

        <Panel className="2xl:col-span-8" title={m.prices.title} subtitle={m.prices.subtitle}>
          {rules.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>{m.prices.columns.ore}</th>
                    <th className="num">{m.prices.columns.unitPrice}</th>
                    <th>{m.prices.columns.from}</th>
                    <th>{m.prices.columns.to}</th>
                    <th className="num" aria-label={m.prices.columns.actions} />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="flex items-center gap-2">
                          <TypeIcon id={r.typeId} size={22} />
                          {r.typeName ?? r.typeId}
                        </span>
                      </td>
                      <td className="num font-semibold">{price(r.unitPrice)}</td>
                      <td className="text-ink-2">{r.validFrom ? f.shortDate(r.validFrom) : m.prices.always}</td>
                      <td className="text-ink-2">{r.validTo ? f.shortDate(r.validTo) : "—"}</td>
                      <td className="num">
                        <ActionForm action={deletePriceRule.bind(null, r.id)} success={tt.priceDeleted} {...failure}>
                          <SubmitButton variant="ghost" title={m.prices.deleteHint}>
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
          {ruleTypes.size === 0 ? (
            <p className="text-sm text-ink-3">{m.prices.empty(HINT_DAYS)}</p>
          ) : (
            <ActionForm action={addPriceRule} success={tt.priceAdded} {...failure} reset="success" className="grid items-end gap-3 sm:grid-cols-5">
              <label className="space-y-1 text-xs text-ink-3 sm:col-span-2">
                {m.prices.ore}
                <select name="typeId" required className={inputClass}>
                  {[...ruleTypes].sort((a, b) => String(a[1]).localeCompare(String(b[1]))).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-ink-3">
                {m.prices.unitPrice}
                <input name="unitPrice" required inputMode="decimal" placeholder={m.prices.unitPricePlaceholder} className={inputClass} />
              </label>
              <label className="space-y-1 text-xs text-ink-3">
                {m.prices.from}
                <input type="date" name="validFrom" className={inputClass} />
              </label>
              <label className="space-y-1 text-xs text-ink-3">
                {m.prices.to}
                <input type="date" name="validTo" className={inputClass} />
              </label>
              <div className="sm:col-span-5">
                <SubmitButton variant="primary">
                  <Plus className="size-3.5" aria-hidden /> {m.prices.add}
                </SubmitButton>
              </div>
            </ActionForm>
          )}

          <div className="mt-5 border-t border-surface-contrast/8 pt-4">
            <div className="eve-label mb-2 text-2xs text-ink-3">{m.prices.hints.title(HINT_DAYS)}</div>
            {saleHints.length === 0 ? (
              <p className="text-xs text-ink-3">{m.prices.hints.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="ks-table">
                  <thead>
                    <tr>
                      <th>{m.prices.hints.columns.ore}</th>
                      <th className="num">{m.prices.hints.columns.sold}</th>
                      <th className="num">{m.prices.hints.columns.got}</th>
                      <th className="num">{m.prices.hints.columns.valuation}</th>
                      <th className="num" aria-label={m.prices.columns.actions} />
                    </tr>
                  </thead>
                  <tbody>
                    {saleHints.map((h) => (
                      <tr key={h.typeId}>
                        <td>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <TypeIcon id={h.typeId} size={22} />
                            {h.typeName}
                          </span>
                        </td>
                        <td className="num text-ink-2">
                          {f.compact(h.rawUnits)} <span className="text-ink-3">({m.prices.hints.sales(h.sales)})</span>
                        </td>
                        <td className="num font-semibold">{price(h.rawUnitPrice)}</td>
                        <td className="num text-ink-2">
                          {h.baseUnitPrice ? (
                            <>
                              {price(h.baseUnitPrice)}{" "}
                              <span className="text-ink-3">({f.percent(h.rawUnitPrice / h.baseUnitPrice, 0)})</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">
                          <ActionForm
                            action={applyPriceHint.bind(null, h.typeId, Math.round(h.rawUnitPrice * 100) / 100)}
                            success={tt.priceApplied(h.typeName, price(Math.round(h.rawUnitPrice * 100) / 100))}
                            {...failure}
                          >
                            <SubmitButton title={m.prices.hints.useHint}>{m.prices.hints.use}</SubmitButton>
                          </ActionForm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
