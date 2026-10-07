import type { ExpenseStatus } from "./categories";
import type { StatusFilter } from "./filters";

/** Totals behind the status tabs of the review pages (purchases and fees, or sales). */

export interface AmountCount {
  amount: number;
  count: number;
}

export type ReviewTotals = Record<ExpenseStatus, AmountCount>;

interface ReviewRow extends AmountCount {
  status: ExpenseStatus;
}

const STATUSES: ExpenseStatus[] = ["counted", "suggested", "excluded", "untagged"];

function sum(rows: readonly AmountCount[]): AmountCount {
  return rows.reduce((acc, r) => ({ amount: acc.amount + r.amount, count: acc.count + r.count }), { amount: 0, count: 0 });
}

/** Amount and count per review status. */
export function reviewTotals(rows: readonly ReviewRow[]): ReviewTotals {
  return Object.fromEntries(STATUSES.map((s) => [s, sum(rows.filter((r) => r.status === s))])) as ReviewTotals;
}

/** What one status tab covers: "mining" is everything tagged as mining cost or income, decided or not. */
export function tabTotal(totals: ReviewTotals, tab: StatusFilter): AmountCount {
  if (tab !== "mining") return totals[tab];
  return sum([totals.counted, totals.suggested, totals.excluded]);
}

/** Rows still waiting for a decision: what "include all" would count. */
export function suggestedCount(rows: readonly ReviewRow[]): number {
  return sum(rows.filter((r) => r.status === "suggested")).count;
}
