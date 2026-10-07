import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { KILL_COLOR, LOSS_COLOR } from "../colors";
import type { Totals } from "../queries";
import { IskDonut } from "./isk-donut";

/** ISK destroyed against ISK lost: the donut with the figures behind it. Anchored as `#isk` for the dashboard tiles. */
export async function IskBreakdownPanel({ totals }: { totals: Totals }) {
  const { t, f } = await getI18n();
  const tk = t.killboard;
  const net = totals.iskDestroyed - totals.iskLost;
  return (
    <Panel id="isk" title={tk.breakdown.title}>
      <div className="grid items-center gap-5 sm:grid-cols-[13rem_1fr] xl:grid-cols-1 2xl:grid-cols-[11rem_1fr]">
        <IskDonut destroyed={totals.iskDestroyed} lost={totals.iskLost} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm 2xl:grid-cols-1 2xl:gap-y-2">
          <Figure label={tk.terms.destroyed} value={f.compact(totals.iskDestroyed)} swatch={KILL_COLOR} />
          <Figure label={tk.terms.lost} value={f.compact(totals.iskLost)} swatch={LOSS_COLOR} />
          <Figure label={tk.terms.netIsk} value={`${net >= 0 ? "+" : "−"}${f.compact(Math.abs(net))}`} tone={net >= 0 ? "good" : "bad"} />
          <Figure
            label={tk.breakdown.kdRatio}
            value={totals.losses ? f.number(totals.kills / totals.losses, 2) : "—"}
            detail={`${f.integer(totals.kills)} / ${f.integer(totals.losses)}`}
          />
          <Figure label={tk.breakdown.avgPerKill} value={totals.kills ? f.compact(totals.iskDestroyed / totals.kills) : "—"} />
          <Figure label={tk.breakdown.avgPerLoss} value={totals.losses ? f.compact(totals.iskLost / totals.losses) : "—"} />
        </dl>
      </div>
    </Panel>
  );
}

function Figure({ label, value, detail, swatch, tone }: { label: string; value: string; detail?: string; swatch?: string; tone?: "good" | "bad" }) {
  return (
    <div className="2xl:flex 2xl:items-baseline 2xl:justify-between 2xl:gap-3">
      <dt className="eve-label flex items-center gap-1.5 text-2xs whitespace-nowrap text-ink-3">
        {swatch && <span className="inline-block size-2 rounded-sm" style={{ background: swatch }} aria-hidden />}
        {label}
      </dt>
      <dd
        className={
          tone === "good"
            ? "mt-0.5 font-semibold whitespace-nowrap text-good-text tabular-nums 2xl:mt-0"
            : tone === "bad"
              ? "mt-0.5 font-semibold whitespace-nowrap text-critical-text tabular-nums 2xl:mt-0"
              : "mt-0.5 font-semibold whitespace-nowrap text-ink tabular-nums 2xl:mt-0"
        }
      >
        {value}
        {detail && <span className="ml-1.5 text-xs font-normal text-ink-3">{detail}</span>}
      </dd>
    </div>
  );
}
