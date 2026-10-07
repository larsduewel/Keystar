"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { CHART_CLASSES, type ChartClass } from "../class-colors";
import { oreSeries, type OreDrill } from "../daily-ores";

export interface DailyChartRow {
  date: string;
  values: Record<ChartClass, number>;
  total: number;
}

type Metric = "value" | "volume" | "quantity";
const GAP = 2;
const RADIUS = 4;

type Series = ReturnType<typeof oreSeries>[number];

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, number | string>;
}

/** Stacked segment: 2px surface gap above it, 4px rounded corners only on the column's top. */
function makeSegmentShape(id: string, order: string[]) {
  function SegmentShape(props: ShapeProps) {
    const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props;
    if (!height || height <= 0) return null;
    const above = order.slice(order.indexOf(id) + 1);
    const isTop = above.every((c) => !Number(payload?.[c] ?? 0));
    const top = isTop ? y : y + GAP;
    const h = Math.max(0, y + height - top);
    if (h <= 0.5) return null;
    if (!isTop) return <rect x={x} y={top} width={width} height={h} fill={fill} />;
    const r = Math.min(RADIUS, width / 2, h);
    const d = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`;
    return <path d={d} fill={fill} />;
  }
  return SegmentShape;
}

function ChartTooltip({
  active,
  payload,
  metric,
  series,
}: {
  active?: boolean;
  payload?: { payload: Record<string, number | string> }[];
  metric: Metric;
  series: Series[];
}) {
  const { t, f } = useI18n();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const rows = series.filter((s) => Number(row[s.id]) > 0);
  return (
    <div className="glass min-w-[200px] rounded-2xl bg-space-800/85 px-4 py-3 text-xs">
      <div className="eve-label mb-2 text-2xs text-ink-3">{f.shortDate(String(row.date))}</div>
      {rows.length === 0 && <div className="text-ink-3">{t.mining.chart.noMining}</div>}
      {/* Top segment first, as the column reads. */}
      {[...rows].reverse().map((s) => (
        <div key={s.id} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
          <span className="font-semibold text-ink tabular-nums">{f.formatMetric(metric, Number(row[s.id]))}</span>
          <span className="text-ink-3">{s.label}</span>
        </div>
      ))}
      {rows.length > 1 && (
        <div className="mt-1.5 flex items-center gap-2 border-t border-surface-contrast/10 pt-1.5">
          <span className="font-semibold text-ink tabular-nums">{f.formatMetric(metric, Number(row.total))}</span>
          <span className="text-ink-3">{t.mining.chart.total}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Daily stacked columns by resource class. With `drill`, a class can be opened to stack its
 * ores instead; when only one class was mined, its ores are shown straight away.
 */
export function DailyChart({
  rows,
  metric,
  drill,
}: {
  rows: DailyChartRow[];
  metric: Metric;
  drill?: Partial<Record<ChartClass, OreDrill>>;
}) {
  const { t, f } = useI18n();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [picked, setPicked] = useState<ChartClass | null>(null);
  const present = CHART_CLASSES.filter((c) => rows.some((r) => r.values[c.id] > 0));
  const canDrill = (id: ChartClass) => !!drill?.[id]?.series.length;
  // A pick from an earlier filter that no longer has data falls back to the class view.
  const opened =
    picked && canDrill(picked) && present.some((c) => c.id === picked)
      ? picked
      : present.length === 1 && canDrill(present[0].id)
        ? present[0].id
        : null;
  const oreView = opened ? drill![opened]! : null;

  const series: Series[] = oreView
    ? oreSeries(oreView, t)
    : present.map((c) => ({
        id: c.id,
        color: c.color,
        label: t.mining.chartClasses[c.id],
      }));
  const order = series.map((s) => s.id);
  const data: Record<string, number | string>[] = oreView
    ? oreView.rows.map((r) => ({ date: r.date, total: r.total, ...r.values }))
    : rows.map((r) => ({ date: r.date, total: r.total, ...r.values }));
  const sumBy = (id: string) => data.reduce((s, r) => s + Number(r[id] ?? 0), 0);
  // Back to the classes only when there is more than one to go back to.
  const canGoBack = oreView && present.length > 1;

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {canGoBack && (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="glass-chip inline-flex h-6 items-center gap-1 rounded-md px-2 font-medium text-ink-2 hover:text-ink"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> {t.mining.chart.allResources}
            </button>
          )}
          {opened && <span className="eve-label text-2xs text-ink-3">{t.mining.chartClasses[opened]}</span>}
          {/* Legend: always present for 2+ series; mirrors the mark (rect for bars). */}
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label={t.mining.chart.legend}>
            {series.map((s) => {
              const content = (
                <>
                  <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
                  <span className="text-ink-2">{s.label}</span>
                  <span className="text-ink-3 tabular-nums">{f.formatMetric(metric, sumBy(s.id))}</span>
                </>
              );
              const cls = s.id as ChartClass;
              return (
                <li key={s.id}>
                  {!oreView && canDrill(cls) ? (
                    <button
                      type="button"
                      onClick={() => setPicked(cls)}
                      title={t.mining.chart.showOres(s.label)}
                      className="group flex items-center gap-1.5 rounded hover:text-ink"
                    >
                      {content}
                      <ChevronRight className="size-3 text-ink-3 group-hover:text-ink" aria-hidden />
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5">{content}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <Segmented
          size="sm"
          label={t.mining.chart.view}
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: t.mining.chart.chart },
            { value: "table", label: t.mining.chart.table },
          ]}
        />
      </div>

      {view === "chart" ? (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} strokeWidth={1} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => f.shortDate(d)}
                tickLine={false}
                axisLine={{ stroke: "var(--axis)" }}
                minTickGap={28}
                tick={{ fontSize: 12 }}
                dy={6}
              />
              <YAxis
                tickFormatter={(v: number) => f.compact(v, 1)}
                tickLine={false}
                axisLine={false}
                width={60}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "var(--chart-cursor)" }}
                content={<ChartTooltip metric={metric} series={series} />}
                isAnimationActive={false}
              />
              {series.map((s) => {
                const drillable = !oreView && canDrill(s.id as ChartClass);
                return (
                  <Bar
                    key={`${opened ?? "classes"}:${s.id}`}
                    dataKey={s.id}
                    stackId="day"
                    fill={s.color}
                    maxBarSize={24}
                    isAnimationActive={false}
                    shape={makeSegmentShape(s.id, order)}
                    name={s.label}
                    className={drillable ? "cursor-pointer" : undefined}
                    onClick={drillable ? () => setPicked(s.id as ChartClass) : undefined}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="ks-table">
            <thead className="sticky top-0 bg-space-800/90 backdrop-blur">
              <tr>
                <th>{t.mining.columns.date}</th>
                {series.map((s) => (
                  <th key={s.id} className="num">
                    {s.label}
                  </th>
                ))}
                <th className="num">{t.mining.chart.total}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((r) => (
                <tr key={String(r.date)}>
                  <td className="tabular-nums text-ink-2">{f.date(String(r.date))}</td>
                  {series.map((s) => (
                    <td key={s.id} className="num">
                      {Number(r[s.id]) ? f.formatMetric(metric, Number(r[s.id])) : "—"}
                    </td>
                  ))}
                  <td className="num font-semibold">{f.formatMetric(metric, Number(r.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
