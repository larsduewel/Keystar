import { MOON_RARITY } from "@/modules/mining/class-colors";

/**
 * Threat visuals reuse the validated ordinal blue ramp (less salient = lower), so
 * no new hues are introduced; the tier label always accompanies the colour.
 */
const RAMP = MOON_RARITY.map((m) => m.color);

export const TIER_COLOR = {
  low: "var(--color-good-text)",
  moderate: "#f97316",
  high: "var(--color-critical-text)",
  extreme: "var(--color-critical-text)",
  unknown: "var(--series-other)",
} as const;

/** Heatmap cell colour for an intensity 0–1 on the same ramp. */
export function heatColor(intensity: number): string {
  if (!(intensity > 0)) return "transparent";
  return RAMP[Math.min(RAMP.length - 1, Math.floor(intensity * RAMP.length))];
}
