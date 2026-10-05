import type { CurrentUser } from "@/core/auth/dal";
import type { MiningScope, Valuation } from "../queries";
import type { PnlFilters } from "./filters";

/**
 * What P&L income is: the mined ore at the valuation (rate and price rules), or what the counted wallet sales
 * actually brought in.
 */
export const INCOME_SOURCES = ["mined", "sales"] as const;

export type IncomeSource = (typeof INCOME_SOURCES)[number];

export function isIncomeSource(value: unknown): value is IncomeSource {
  return typeof value === "string" && (INCOME_SOURCES as readonly string[]).includes(value);
}

/**
 * Who and what a P&L query covers. Always the signed-in account's own
 * characters, whatever corporation-wide permissions the user has.
 */
export interface PnlScope {
  userId: string;
  /** Own characters selected by the filter (all own characters when none are). */
  characterIds: number[];
  /** True when the filter narrows the characters (account-wide manual entries are then left out). */
  narrowed: boolean;
  from: string;
  to: string;
  valuation: Valuation;
  /** Income at this % of the valuation unless a price rule applies. */
  ratePct: number;
  /** Mining scope for ledgerCte: own characters only, never corporation-wide. */
  ledgerScope: MiningScope;
}

export function pnlScope(
  user: Pick<CurrentUser, "id" | "characterIds">,
  filters: Pick<PnlFilters, "from" | "to" | "characters">,
  valuation: Valuation,
  ratePct: number,
): PnlScope {
  const selected = filters.characters.filter((c) => user.characterIds.includes(c));
  const narrowed = selected.length > 0;
  return {
    userId: user.id,
    characterIds: narrowed ? selected : user.characterIds,
    narrowed,
    from: filters.from,
    to: filters.to,
    valuation,
    ratePct,
    ledgerScope: { corp: false, ownCharacterIds: user.characterIds, homeCorporationId: null },
  };
}
