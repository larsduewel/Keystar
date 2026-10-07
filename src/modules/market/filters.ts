import type { OrderSide, OrderView } from "./orders";

/**
 * Market order filters, kept in the URL so views are shareable and the server can render them. Isomorphic.
 */
export interface MarketFilters {
  view: OrderView;
  side: OrderSide;
  characters: number[];
  /** Stations and structures (`location_id` of the order). */
  locations: number[];
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function idList(v: string | string[] | undefined): number[] {
  const raw = Array.isArray(v) ? v.join(",") : (v ?? "");
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    ),
  ].slice(0, 500);
}

export function parseMarketFilters(params: RawParams): MarketFilters {
  const view = first(params.view);
  const side = first(params.side);
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(first(params.page))) || 1));
  return {
    view: view === "closed" || view === "all" ? view : "open",
    side: side === "sell" || side === "buy" ? side : "all",
    characters: idList(params.chars),
    locations: idList(params.locations),
    page,
  };
}

/** Serialises filters back into a query string, omitting defaults. */
export function marketQueryString(f: MarketFilters, overrides: Partial<MarketFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (v.view !== "open") p.set("view", v.view);
  if (v.side !== "all") p.set("side", v.side);
  if (v.characters.length) p.set("chars", v.characters.join(","));
  if (v.locations.length) p.set("locations", v.locations.join(","));
  if (v.page > 1) p.set("page", String(v.page));
  return p.toString();
}
