import { TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import type { OreFlowSummary } from "@/modules/mining/pnl/ore-flows";

/** Per ore: what was mined, what was sold at which price, and what is still unsold against the valuation. */
export async function OreFlowsPanel({ flows }: { flows: OreFlowSummary }) {
  const { t, f } = await getI18n();
  const fl = t.pnl.income.flows;
  const price = (value: number) => f.unitPrice(value).replace(" ISK", "");
  const signedUnits = (value: number) => `${value < 0 ? "−" : ""}${f.compact(Math.abs(value))}`;
  return (
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
                  {r.compressedShare > 0 && <span className="block text-2xs text-ink-3">{fl.compressed(f.percent(r.compressedShare, 0))}</span>}
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
  );
}
