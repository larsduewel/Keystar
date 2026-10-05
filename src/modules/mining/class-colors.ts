import type { OreClass } from "@/core/eve/ore";

/**
 * Chart colours, as CSS variables so each theme has its own validated steps
 * (values and results in globals.css). Categorical slots on the dark glass
 * surface: adjacent CVD ΔE ≥ 8.4, normal-vision ΔE ≥ 19.8, all ≥ 3:1; on the
 * light page: CVD ΔE ≥ 9.0, normal ΔE ≥ 17.6, all ≥ 3.6:1. Moon rarity is
 * ordinal (R4 → R64), so it uses one blue ramp instead of new hues —
 * validated with --ordinal in both themes. Income/expense colours of the P&L
 * charts are a separate polarity pair (`pnl/colors.ts`).
 */
export type ChartClass = "moon" | "ore" | "ice" | "gas" | "other";

export type MoonOreClass = Extract<OreClass, `moon_${string}`>;

/** Series order and colours; labels live in the dictionaries (`t.mining.chartClasses`). */
export const CHART_CLASSES: { id: ChartClass; color: string }[] = [
  { id: "moon", color: "var(--series-moon)" },
  { id: "ore", color: "var(--series-ore)" },
  { id: "ice", color: "var(--series-ice)" },
  { id: "gas", color: "var(--series-gas)" },
  { id: "other", color: "var(--series-other)" },
];

export const CHART_CLASS_COLOR: Record<ChartClass, string> = Object.fromEntries(
  CHART_CLASSES.map((c) => [c.id, c.color]),
) as Record<ChartClass, string>;

export function chartClassOf(oreClass: OreClass): ChartClass {
  if (oreClass.startsWith("moon_")) return "moon";
  if (oreClass === "ore" || oreClass === "ice" || oreClass === "gas") return oreClass;
  return "other";
}

/**
 * Ordinal ramp for moon rarity: rarer = more salient (lighter on the dark
 * surface, darker on the light one). Labels live in the dictionaries
 * (`t.mining.moonRarity`).
 */
export const MOON_RARITY: { id: MoonOreClass; color: string }[] = [
  { id: "moon_r4", color: "var(--ramp-1)" },
  { id: "moon_r8", color: "var(--ramp-2)" },
  { id: "moon_r16", color: "var(--ramp-3)" },
  { id: "moon_r32", color: "var(--ramp-4)" },
  { id: "moon_r64", color: "var(--ramp-5)" },
];

export function oreClassColor(oreClass: OreClass): string {
  return MOON_RARITY.find((m) => m.id === oreClass)?.color ?? CHART_CLASS_COLOR[chartClassOf(oreClass)];
}

/** Collapses per-OreClass values into chart classes. */
export function toChartClasses(values: Partial<Record<OreClass, number>>): Record<ChartClass, number> {
  const out: Record<ChartClass, number> = { moon: 0, ore: 0, ice: 0, gas: 0, other: 0 };
  for (const [k, v] of Object.entries(values)) out[chartClassOf(k as OreClass)] += v ?? 0;
  return out;
}
