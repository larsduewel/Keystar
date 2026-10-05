import type { DateBucket } from "@/lib/dates";
import { isoDate, parseMiningFilters, type MiningFilters } from "../filters";
import type { ExpenseStatus } from "./categories";

/**
 * Mining P&L filters, kept in the URL like the mining dashboards. Isomorphic.
 */
export type StatusFilter = "mining" | ExpenseStatus;

export interface PnlFilters {
  from: string;
  to: string;
  /** Own characters to include (empty = all of them). */
  characters: number[];
  bucket: DateBucket;
  /** Expenses page: which purchases to list ("mining" = counted, suggested and excluded). */
  status: StatusFilter;
  page: number;
  /** Expenses page: page of the taxes & fees list (paged separately from the purchases). */
  feePage: number;
}

export const PNL_BUCKETS: DateBucket[] = ["day", "week", "month"];

/** Expenses page tabs; labels in `t.pnl.statusFilters`. */
export const STATUS_FILTERS: StatusFilter[] = ["mining", "suggested", "counted", "excluded", "untagged"];

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parsePnlFilters(params: RawParams, today: string = isoDate(new Date())): PnlFilters {
  const base = parseMiningFilters(params, today);
  const bucket = first(params.bucket);
  const status = first(params.status);
  const feePage = Number(first(params.fpage));
  return {
    from: base.from,
    to: base.to,
    characters: base.characters,
    bucket: bucket === "week" || bucket === "month" ? bucket : "day",
    status: (STATUS_FILTERS as string[]).includes(status ?? "") ? (status as StatusFilter) : "mining",
    page: base.page,
    feePage: Number.isSafeInteger(feePage) && feePage > 1 ? feePage : 1,
  };
}

/**
 * Serialises filters back into a query string, omitting defaults. Changing a shared filter (range, characters,
 * bucket, status) starts the fee list on its first page again; paging the purchases keeps it.
 */
export function pnlQueryString(f: PnlFilters, overrides: Partial<PnlFilters> = {}): string {
  const changesFilters = Object.keys(overrides).some((k) => k !== "page" && k !== "feePage");
  const v = { ...f, ...(changesFilters ? { feePage: 1 } : {}), ...overrides };
  const p = new URLSearchParams();
  p.set("from", v.from);
  p.set("to", v.to);
  if (v.characters.length) p.set("chars", v.characters.join(","));
  if (v.bucket !== "day") p.set("bucket", v.bucket);
  if (v.status !== "mining") p.set("status", v.status);
  if (v.page > 1) p.set("page", String(v.page));
  if (v.feePage > 1) p.set("fpage", String(v.feePage));
  return p.toString();
}

/** Mining-ledger filters for the P&L: all sources (de-duplicated), no type/system/class filters. */
export function pnlLedgerFilters(range: { from: string; to: string }, characters: number[]): MiningFilters {
  return {
    from: range.from,
    to: range.to,
    characters,
    types: [],
    classes: [],
    systems: [],
    source: "all",
    metric: "value",
    groupBy: "character",
    view: "own",
    page: 1,
  };
}
