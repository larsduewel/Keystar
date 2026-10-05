import type { OreFlowRow } from "./queries";

/**
 * Mined vs sold per ore: what is left unsold, what you got per unit against the valuation, and what the ore still in
 * your hangars is worth. Pure. Units are raw units; compressed ore converts 1:1, so only the volume differs.
 */
export interface OreFlow extends OreFlowRow {
  /** Mined minus sold; negative when you sold ore mined before the period (or bought). */
  left: number;
  /** Realised ISK per raw unit (null: nothing sold). */
  soldUnitPrice: number | null;
  /** soldUnitPrice / valuation (null when either is missing). */
  vsValuation: number | null;
  /** Share of the sold units that were sold compressed (0–1). */
  compressedShare: number;
  /** Ore left over, at the current valuation (0 when nothing is left or it has no price). */
  leftValue: number;
}

export interface OreFlowSummary {
  rows: OreFlow[];
  totals: {
    minedValue: number;
    soldIsk: number;
    /** Valuation of the same units that were sold, for comparing what you got with the market. */
    soldAtValuation: number;
    leftValue: number;
    /** m³ of the ore left over, uncompressed. */
    leftVolume: number;
  };
}

export function summarizeOreFlows(rows: OreFlowRow[]): OreFlowSummary {
  const totals = { minedValue: 0, soldIsk: 0, soldAtValuation: 0, leftValue: 0, leftVolume: 0 };
  const out = rows.map((r): OreFlow => {
    const left = r.mined - r.sold;
    const soldUnitPrice = r.sold > 0 ? r.soldIsk / r.sold : null;
    const valuation = r.valuationUnitPrice && r.valuationUnitPrice > 0 ? r.valuationUnitPrice : null;
    const leftValue = left > 0 && valuation ? left * valuation : 0;
    totals.minedValue += r.minedValue;
    totals.soldIsk += r.soldIsk;
    if (valuation) totals.soldAtValuation += r.sold * valuation;
    totals.leftValue += leftValue;
    if (left > 0) totals.leftVolume += left * r.unitVolume;
    return {
      ...r,
      left,
      soldUnitPrice,
      vsValuation: soldUnitPrice !== null && valuation ? soldUnitPrice / valuation : null,
      compressedShare: r.sold > 0 ? r.soldCompressed / r.sold : 0,
      leftValue,
    };
  });
  return { rows: out, totals };
}
