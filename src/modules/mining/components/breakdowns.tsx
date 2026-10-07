import Link from "next/link";
import { Portrait } from "@/components/ui/eve-image";
import { SecurityStatus } from "@/components/ui/security";
import type { Messages } from "@/i18n/messages";
import { getI18n } from "@/i18n/server";
import type { Formatter } from "@/lib/format";
import { CHART_CLASSES, MOON_RARITY, toChartClasses, type ChartClass } from "../class-colors";
import { oreSeries, oreTotals, type OreDrill } from "../daily-ores";
import { miningQueryString, type MiningFilters } from "../filters";
import type { ClassValues, MemberRow, SystemRow } from "../queries";

type Metric = MiningFilters["metric"];

/** Thin stacked bar showing class composition; 2px gaps between segments. */
function CompositionBar({ values, max, t, f }: { values: ClassValues; max: number; t: Messages; f: Formatter }) {
  const byClass = toChartClasses(values);
  const total = Object.values(byClass).reduce((a, b) => a + b, 0);
  const widthPct = max > 0 ? (total / max) * 100 : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-contrast/4">
      <div className="flex h-full gap-[2px]" style={{ width: `${Math.max(widthPct, 0.5)}%` }}>
        {CHART_CLASSES.filter((c) => byClass[c.id] > 0).map((c) => (
          <div
            key={c.id}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(byClass[c.id] / total) * 100}%`, background: c.color }}
            title={`${t.mining.chartClasses[c.id]}: ${f.compact(byClass[c.id])}`}
          />
        ))}
      </div>
    </div>
  );
}

export async function MemberLeaderboard({
  rows,
  filters,
  canDrill,
}: {
  rows: MemberRow[];
  filters: MiningFilters;
  canDrill: boolean;
}) {
  const { t, f } = await getI18n();
  const max = rows[0]?.[filters.metric] ?? 0;
  const total = rows.reduce((s, r) => s + r[filters.metric], 0);
  return (
    <ol className="space-y-1">
      {rows.slice(0, 15).map((r, i) => {
        const metricValue = r[filters.metric];
        const content = (
          <>
            <span className="w-5 text-right text-xs text-ink-3 tabular-nums">{i + 1}</span>
            <Portrait id={r.portraitId} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 truncate text-sm">
                  <span className="font-medium text-ink">{r.name}</span>
                  {r.ownerName && r.ownerName !== r.name && <span className="text-ink-3"> · {r.ownerName}</span>}
                  {filters.groupBy === "user" && r.characters > 1 && (
                    <span className="text-ink-3"> · {t.mining.breakdowns.characters(r.characters)}</span>
                  )}
                  {!r.userId && <span className="text-ink-3"> · {t.mining.breakdowns.notRegistered}</span>}
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums">{f.formatMetric(filters.metric, metricValue)}</div>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <CompositionBar values={r.byClass} max={max} t={t} f={f} />
                <span className="w-12 shrink-0 text-right text-2xs text-ink-3 tabular-nums">
                  {total ? f.percent(metricValue / total, 1) : "—"}
                </span>
              </div>
            </div>
          </>
        );
        // Drill-down: clicking a character filters the whole dashboard to it.
        const drillIds = filters.groupBy === "character" ? [Number(r.key)] : null;
        return (
          <li key={r.key}>
            {canDrill && drillIds ? (
              <Link
                href={`?${miningQueryString(filters, { characters: drillIds, page: 1 })}`}
                scroll={false}
                className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-surface-contrast/5"
              >
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl px-2 py-2">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Share of each resource class. When only one class was mined, it lists that class's ores
 * instead, in the same series as the daily chart's per-ore view.
 */
export async function ClassComposition({
  byClass,
  metric,
  drill,
}: {
  byClass: ClassValues;
  metric: Metric;
  drill?: Partial<Record<ChartClass, OreDrill>>;
}) {
  const { t, f } = await getI18n();
  const chart = toChartClasses(byClass);
  const total = Object.values(chart).reduce((a, b) => a + b, 0);
  const moonTotal = chart.moon;
  const present = CHART_CLASSES.filter((c) => chart[c.id] > 0);
  const single = present.length === 1 ? drill?.[present[0].id] : undefined;
  const totals = single ? oreTotals(single) : null;
  const rows =
    single && totals
      ? oreSeries(single, t).map((s) => ({ ...s, amount: totals[s.id] ?? 0 }))
      : present.map((c) => ({ id: c.id, color: c.color, label: t.mining.chartClasses[c.id], amount: chart[c.id] }));
  return (
    <div className="space-y-5">
      <div>
        {single && (
          <div className="eve-label mb-3 text-2xs text-ink-3">
            {t.mining.breakdowns.oresOf(t.mining.chartClasses[present[0].id])}
          </div>
        )}
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} aria-hidden />
                  <span className="truncate text-ink-2">{r.label}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{f.formatMetric(metric, r.amount)}</span>
                  <span className="ml-2 text-xs text-ink-3">{f.percent(r.amount / total)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-contrast/5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(r.amount / total) * 100}%`, background: r.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
      {moonTotal > 0 && (
        <div>
          <div className="eve-label mb-2 text-2xs text-ink-3">{t.mining.breakdowns.moonByRarity}</div>
          <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {MOON_RARITY.filter((m) => (byClass[m.id] ?? 0) > 0).map((m) => (
              <div
                key={m.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${((byClass[m.id] ?? 0) / moonTotal) * 100}%`, background: m.color }}
                title={`${t.mining.moonRarity[m.id]}: ${f.formatMetric(metric, byClass[m.id] ?? 0)}`}
              />
            ))}
          </div>
          <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {MOON_RARITY.filter((m) => (byClass[m.id] ?? 0) > 0).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-[2px]" style={{ background: m.color }} aria-hidden />
                  {t.mining.moonRarity[m.id]}
                </span>
                <span className="text-ink tabular-nums">{f.percent((byClass[m.id] ?? 0) / moonTotal, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export async function SystemTable({ rows, filters }: { rows: SystemRow[]; filters: MiningFilters }) {
  const { t, f } = await getI18n();
  return (
    <div className="overflow-x-auto">
      <table className="ks-table">
        <thead>
          <tr>
            <th>{t.mining.columns.system}</th>
            <th className="num">{t.mining.columns.miners}</th>
            <th className="num">{t.mining.columns.units}</th>
            <th className="num">{t.mining.columns.volume}</th>
            <th className="num">{t.mining.columns.value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.systemId ?? "unknown"}>
              <td>
                {r.systemId ? (
                  <Link
                    href={`?${miningQueryString(filters, { systems: [r.systemId], page: 1 })}`}
                    scroll={false}
                    className="flex items-center gap-2.5 hover:text-accent"
                  >
                    <SecurityStatus value={r.security} />
                    <span className="font-medium">{r.name}</span>
                  </Link>
                ) : (
                  <span className="text-ink-3">{t.mining.breakdowns.unknownLocation}</span>
                )}
              </td>
              <td className="num">{f.integer(r.miners)}</td>
              <td className="num">{f.integer(r.quantity)}</td>
              <td className="num">{f.volume(r.volume)}</td>
              <td className="num font-semibold">{f.isk(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
