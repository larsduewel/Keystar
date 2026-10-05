"use client";

import { ChevronDown, ChevronRight, ClipboardPaste, Eraser, Loader2, TriangleAlert } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { TypeIcon } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { compareSortValues, SortHeader, useSortedRows } from "@/components/ui/sortable-table";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { priceSurveyTypes, type SurveyPrice } from "./actions";
import { type GradeSummary, type OreSummary, parseLocaleNumber, parseSurveyScan, summariseSurvey } from "./parse";

const EXAMPLE = `Scordite III-Grade	41.648	6.247 m3	787.000,00 ISK	21 km
Scordite III-Grade	49.146	7.371 m3	928.000,00 ISK	21 km
Scordite II-Grade	61.604	9.240 m3	1.110.000,00 ISK	15 km
Scordite II-Grade	70.246	10.536 m3	1.260.000,00 ISK	21 km
Scordite	74.748	11.212 m3	1.270.000,00 ISK	21 km
Scordite	75.468	11.320 m3	1.290.000,00 ISK	14 km
Veldspar III-Grade	133.506	13.350 m3	1.430.000,00 ISK	26 km
Veldspar III-Grade	135.830	13.583 m3	1.460.000,00 ISK	31 km
Veldspar II-Grade	147.552	14.755 m3	1.500.000,00 ISK	33 km
Veldspar	185.200	18.520 m3	1.840.000,00 ISK	19 km
Veldspar	180.364	18.036 m3	1.790.000,00 ISK	32 km
Plagioclase III-Grade	50.050	17.517 m3	1.440.000,00 ISK	18 km
Plagioclase II-Grade	64.304	22.506 m3	1.770.000,00 ISK	29 km
Plagioclase	73.736	25.807 m3	2.050.000,00 ISK	16 km
Pyroxeres III-Grade	24.530	7.359 m3	630.000,00 ISK	28 km
Pyroxeres II-Grade	28.264	8.479 m3	643.000,00 ISK	22 km
Pyroxeres	29.504	8.851 m3	669.000,00 ISK	18 km`;

interface GradeRow extends GradeSummary {
  /** Keystar value; null until the grade is priced. */
  keystar: number | null;
}

interface OreRow extends Omit<OreSummary, "grades"> {
  grades: GradeRow[];
  /** Keystar value of the priced grades. */
  keystar: number;
}

const oreName = (r: OreRow) => r.base;

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix: string;
}) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="eve-label text-2xs text-ink-3">{label}</span>
      <span className="glass-inset field-focus mt-1.5 flex h-9 items-center rounded-lg pr-3">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <span className="text-xs text-ink-3">{suffix}</span>
      </span>
    </label>
  );
}

export function FieldEstimator({ valuationLabel }: { valuationLabel: string }) {
  const { t: messages, f } = useI18n();
  const m = messages.mining.estimator;
  const [text, setText] = useState("");
  const [fleetYield, setFleetYield] = useState("");
  const [prices, setPrices] = useState<Record<string, SurveyPrice>>({});
  const [priceError, setPriceError] = useState<"failed" | "esi" | null>(null);
  const [pricing, startPricing] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const parsed = useMemo(() => parseSurveyScan(text), [text]);
  const summary = useMemo(() => summariseSurvey(parsed.rocks), [parsed.rocks]);
  const namesKey = useMemo(() => [...new Set(parsed.rocks.map((r) => r.name))].sort().join("\n"), [parsed.rocks]);

  useEffect(() => {
    if (!namesKey) return;
    const names = namesKey.split("\n").filter((n) => !prices[n.toLowerCase()]);
    if (!names.length) return;
    const t = setTimeout(() => {
      startPricing(async () => {
        try {
          const result = await priceSurveyTypes(names);
          setPrices((p) => ({ ...p, ...result.prices }));
          setPriceError(result.esiUnavailable ? "esi" : null);
        } catch {
          setPriceError("failed");
        }
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the set of ore names changes
  }, [namesKey]);

  const rows = useMemo(
    () =>
      summary.map((ore): OreRow => {
        const grades = ore.grades.map((g): GradeRow => {
          const p = prices[g.name.toLowerCase()]?.unitPrice ?? null;
          return { ...g, keystar: p === null ? null : p * g.quantity };
        });
        return { ...ore, grades, keystar: grades.reduce((s, g) => s + (g.keystar ?? 0), 0) };
      }),
    [summary, prices],
  );

  const totals = rows.reduce(
    (t, ore) => {
      t.rocks += ore.rocks;
      t.volume += ore.volume;
      t.scanner += ore.scannerValue;
      t.keystar += ore.keystar;
      t.unpriced += ore.grades.filter((g) => g.keystar === null).length;
      return t;
    },
    { rocks: 0, volume: 0, scanner: 0, keystar: 0, unpriced: 0 },
  );
  // Mining lasers show their yield per second; German or English notation, like the scan itself.
  const yieldPerSecond = parseLocaleNumber(fleetYield) ?? 0;
  const hoursToClear = yieldPerSecond > 0 ? totals.volume / yieldPerSecond / 3600 : null;
  // Share and ISK/m³ use Keystar values once any are priced, scanner values until then.
  const useKeystar = totals.keystar > 0;
  const shareBase = useKeystar ? totals.keystar : totals.scanner;
  const basis = useCallback(
    (r: OreRow | GradeRow) => (useKeystar ? r.keystar : r.scannerValue),
    [useKeystar],
  );
  const perM3 = useCallback(
    (r: OreRow | GradeRow) => {
      const v = basis(r);
      return v && r.volume ? v / r.volume : null;
    },
    [basis],
  );
  const sortValue = useCallback(
    (r: OreRow | GradeRow, key: string) => {
      switch (key) {
        case "name":
          return "base" in r ? r.base : r.rank;
        case "scanner":
          return r.scannerValue;
        case "keystar":
          return r.keystar || null;
        case "iskPerM3":
          return perM3(r);
        case "share":
          return basis(r);
        default:
          return r[key as "rocks" | "quantity" | "volume"];
      }
    },
    [basis, perM3],
  );
  const { sorted, sort, toggle: toggleSort } = useSortedRows<OreRow>(rows, "share", sortValue, oreName);
  const sortGrades = (grades: GradeRow[]) =>
    // Grades sort by the same column; "name" keeps them in grade order (base first) in either direction.
    sort.key === "name"
      ? grades
      : [...grades].sort((a, b) => compareSortValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.dir) || a.rank - b.rank);
  // The header already says ISK/m³.
  const iskPerM3 = (v: number) => f.unitPrice(v).replace(" ISK", "");
  const header = (key: string, label: string, align?: "left") => (
    <SortHeader sortKey={key} label={label} align={align} sort={sort} onSort={toggleSort} />
  );

  const toggle = (base: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(base)) n.delete(base);
      else n.add(base);
      return n;
    });

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Panel
        className="xl:col-span-4"
        title={m.scan.title}
        subtitle={m.scan.subtitle}
        actions={
          <>
            <button
              type="button"
              onClick={() => setText(EXAMPLE)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-ink-3 hover:bg-surface-contrast/6 hover:text-ink"
            >
              <ClipboardPaste className="size-3.5" aria-hidden /> {m.scan.example}
            </button>
            <button
              type="button"
              onClick={() => setText("")}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-ink-3 hover:bg-surface-contrast/6 hover:text-ink"
            >
              <Eraser className="size-3.5" aria-hidden /> {m.scan.clear}
            </button>
          </>
        }
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={m.scan.placeholder}
          className="glass-inset h-[360px] w-full resize-y rounded-lg p-3 font-mono text-2xs leading-relaxed whitespace-pre text-ink placeholder:text-ink-3"
          aria-label={m.scan.input}
        />
        {parsed.skipped.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {m.skipped(
              parsed.skipped.length,
              parsed.skipped
                .slice(0, 3)
                .map((s) => s.line)
                .join(", ") + (parsed.skipped.length > 3 ? ", …" : ""),
            )}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <NumberField
            label={m.fleetYield}
            value={fleetYield}
            onChange={setFleetYield}
            placeholder={m.fleetYieldPlaceholder}
            suffix="m³/s"
          />
        </div>
      </Panel>

      <div className="min-w-0 space-y-4 xl:col-span-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Glass className="px-5 py-4">
            <div className="eve-label text-2xs text-ink-3">{m.keystarValue}</div>
            <div className="mt-2 text-2xl font-semibold">
              {f.compact(totals.keystar)}
              <span className="ml-1 text-sm text-ink-2">ISK</span>
            </div>
            <div className="mt-1 truncate text-2xs text-ink-3" title={valuationLabel}>
              {pricing ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> {m.pricing}
                </span>
              ) : totals.unpriced ? (
                m.unpriced(totals.unpriced)
              ) : (
                valuationLabel
              )}
            </div>
          </Glass>
          <Glass className="px-5 py-4">
            <div className="eve-label text-2xs text-ink-3">{m.scannerEstimate}</div>
            <div className="mt-2 text-2xl font-semibold">
              {f.compact(totals.scanner)}
              <span className="ml-1 text-sm text-ink-2">ISK</span>
            </div>
            <div className="mt-1 text-2xs text-ink-3">{m.eveAverage}</div>
          </Glass>
          <Glass className="px-5 py-4">
            <div className="eve-label text-2xs text-ink-3">{m.volume}</div>
            <div className="mt-2 text-2xl font-semibold">
              {f.compact(totals.volume)}
              <span className="ml-1 text-sm text-ink-2">m³</span>
            </div>
            <div className="mt-1 text-2xs text-ink-3">
              {totals.volume ? m.perM3(f.unitPrice(shareBase / totals.volume)) : "—"}
            </div>
          </Glass>
          <Glass className="px-5 py-4">
            <div className="eve-label text-2xs text-ink-3">{hoursToClear !== null ? m.timeToClear : m.asteroids}</div>
            <div className="mt-2 text-2xl font-semibold">
              {hoursToClear !== null
                ? m.duration(Math.floor(hoursToClear), Math.round((hoursToClear % 1) * 60))
                : f.integer(totals.rocks)}
            </div>
            <div className="mt-1 text-2xs text-ink-3">
              {hoursToClear !== null ? m.asteroidCount(totals.rocks) : m.oreTypes(summary.length)}
            </div>
          </Glass>
        </div>

        {priceError && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlert className="size-3.5" aria-hidden /> {priceError === "esi" ? m.esiUnavailable : m.priceError}
          </p>
        )}

        <Glass className="overflow-hidden">
          {summary.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-ink-3">
              {m.empty}
            </div>
          ) : (
            <div className="overflow-x-auto px-2 py-2">
              <table className="ks-table">
                <thead>
                  <tr>
                    {header("name", m.columns.ore, "left")}
                    {header("rocks", m.columns.rocks)}
                    {header("quantity", m.columns.units)}
                    {header("volume", m.columns.volume)}
                    {header("iskPerM3", m.columns.iskPerM3)}
                    {header("scanner", m.columns.scanner)}
                    {header("keystar", m.columns.keystar)}
                    {header("share", m.columns.share)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((ore) => {
                    const open = !collapsed.has(ore.base);
                    const orePerM3 = perM3(ore);
                    const iconId = prices[ore.grades[0].name.toLowerCase()]?.typeId;
                    return (
                      <Fragment key={ore.base}>
                        <tr className="cursor-pointer" onClick={() => toggle(ore.base)}>
                          <td>
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {open ? (
                                <ChevronDown className="size-4 text-ink-3" aria-hidden />
                              ) : (
                                <ChevronRight className="size-4 text-ink-3" aria-hidden />
                              )}
                              {iconId ? <TypeIcon id={iconId} size={24} /> : <span className="size-6" />}
                              <span className="font-semibold">{ore.base}</span>
                              <span className="text-xs text-ink-3">{m.grades(ore.grades.length)}</span>
                            </div>
                          </td>
                          <td className="num">{f.integer(ore.rocks)}</td>
                          <td className="num">{f.integer(ore.quantity)}</td>
                          <td className="num">{f.integer(ore.volume)} m³</td>
                          <td className="num">{orePerM3 !== null ? iskPerM3(orePerM3) : "—"}</td>
                          <td className="num">{f.isk(ore.scannerValue)}</td>
                          <td className="num font-semibold">{ore.keystar ? f.isk(ore.keystar) : "—"}</td>
                          <td className="w-[120px]">
                            <ShareBar value={shareBase ? (basis(ore) ?? 0) / shareBase : 0} />
                          </td>
                        </tr>
                        {open &&
                          sortGrades(ore.grades).map((g) => {
                            const p = perM3(g);
                            return (
                              <tr key={g.name} className="text-ink-2">
                                <td>
                                  <div className="flex items-center gap-2 pl-9 whitespace-nowrap" title={g.name}>
                                    <span className="rounded border border-surface-contrast/10 px-1.5 py-px font-mono text-3xs text-ink-2">
                                      {g.grade === "Base" ? m.baseGrade : g.grade}
                                    </span>
                                  </div>
                                </td>
                                <td className="num">{f.integer(g.rocks)}</td>
                                <td className="num">{f.integer(g.quantity)}</td>
                                <td className="num">{f.integer(g.volume)} m³</td>
                                <td className="num">{p !== null ? iskPerM3(p) : pricing ? "…" : "—"}</td>
                                <td className="num">{f.isk(g.scannerValue)}</td>
                                <td className="num">{g.keystar !== null ? f.isk(g.keystar) : pricing ? "…" : "—"}</td>
                                <td className="w-[120px]">
                                  <ShareBar value={shareBase ? (basis(g) ?? 0) / shareBase : 0} subtle />
                                </td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}

function ShareBar({ value, subtle }: { value: number; subtle?: boolean }) {
  const { f } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-surface-contrast/5">
        <div
          className={cn("h-full rounded-full", subtle ? "bg-accent/45" : "bg-accent")}
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
      <span className="w-10 text-right text-2xs text-ink-3 tabular-nums">{f.percent(value, 0)}</span>
    </div>
  );
}
