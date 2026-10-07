/**
 * Market order logic shared by the sync job, the pages and the tests. Pure: no database, no ESI.
 */

/**
 * Where an order stands. `open` is on the market; `cancelled` and `expired` are ESI's order history (90 days);
 * `closed` means the order left the open list without (yet) showing up in the history: it was filled, or closed in game
 * since the history was last read. ESI never reports a later state for a cancelled or expired order.
 */
export const ORDER_STATES = ["open", "closed", "cancelled", "expired"] as const;
export type OrderState = (typeof ORDER_STATES)[number];
export const FINAL_STATES: readonly OrderState[] = ["cancelled", "expired"];

/** Which orders a view shows: those on the market, those no longer on it, or everything. */
export type OrderView = "open" | "closed" | "all";
export const ORDER_VIEWS: readonly OrderView[] = ["open", "closed", "all"];

export function statesOf(view: OrderView): readonly OrderState[] {
  return view === "open" ? ["open"] : view === "closed" ? ORDER_STATES.filter((s) => s !== "open") : ORDER_STATES;
}

export type OrderSide = "all" | "sell" | "buy";
export const ORDER_SIDES: readonly OrderSide[] = ["all", "sell", "buy"];

/** How far a buy order reaches: ESI's `range` (a number is jumps). Sell orders always report `region`. */
export const ORDER_RANGES = ["station", "solarsystem", "region", "1", "2", "3", "4", "5", "10", "20", "30", "40"] as const;
export type OrderRange = (typeof ORDER_RANGES)[number];

export function isOrderRange(value: string): value is OrderRange {
  return (ORDER_RANGES as readonly string[]).includes(value);
}

/** An open order that expires within this window is highlighted so it can be renewed in time. */
export const EXPIRING_SOON_MS = 3 * 86_400_000;

/** ESI: "An order expires at time issued + duration" (days). Modifying an order in game resets `issued`. */
export function expiresAt(order: { issued: Date; duration: number }): Date {
  return new Date(order.issued.getTime() + order.duration * 86_400_000);
}

/** What the table shows for an order's state: an expired order with nothing left was filled. */
export type OrderOutcome = "open" | "filled" | "closed" | "cancelled" | "expired";

export function orderOutcome(order: { state: OrderState; volumeRemain: number }): OrderOutcome {
  if (order.state === "expired" && order.volumeRemain === 0) return "filled";
  return order.state;
}

/** One open order as ESI returns it (GET /characters/{id}/orders). */
export interface EsiMarketOrder {
  order_id: number;
  type_id: number;
  region_id: number;
  location_id: number;
  /** Missing on sell orders. */
  is_buy_order?: boolean;
  is_corporation: boolean;
  price: number;
  volume_total: number;
  volume_remain: number;
  min_volume?: number;
  escrow?: number;
  range: string;
  duration: number;
  issued: string;
}

/** One order of the history (GET /characters/{id}/orders/history): cancelled or expired, up to 90 days back. */
export interface EsiMarketOrderHistory extends EsiMarketOrder {
  state: string;
}

export interface MarketOrderRow {
  orderId: number;
  characterId: number;
  typeId: number;
  regionId: number;
  locationId: number;
  isBuyOrder: boolean;
  isCorporation: boolean;
  price: number;
  volumeTotal: number;
  volumeRemain: number;
  minVolume: number | null;
  escrow: number | null;
  range: OrderRange;
  duration: number;
  issued: Date;
  state: OrderState;
  updatedAt: Date;
}

/**
 * Maps ESI's open orders and order history to rows. The history wins when both list an order (it is cached longer, so
 * the open list may still show an order the history already reports closed). Orders with an unknown range or state
 * are skipped rather than stored wrongly.
 */
export function orderRows(characterId: number, open: EsiMarketOrder[], history: EsiMarketOrderHistory[], now: Date): MarketOrderRow[] {
  const byId = new Map<number, MarketOrderRow>();
  const add = (o: EsiMarketOrder, state: OrderState) => {
    if (!isOrderRange(o.range) || byId.has(o.order_id)) return;
    byId.set(o.order_id, {
      orderId: o.order_id,
      characterId,
      typeId: o.type_id,
      regionId: o.region_id,
      locationId: o.location_id,
      isBuyOrder: o.is_buy_order ?? false,
      isCorporation: o.is_corporation,
      price: o.price,
      volumeTotal: o.volume_total,
      volumeRemain: o.volume_remain,
      minVolume: o.min_volume ?? null,
      escrow: o.escrow ?? null,
      range: o.range,
      duration: o.duration,
      issued: new Date(o.issued),
      state,
      updatedAt: now,
    });
  };
  for (const o of history) {
    if (o.state === "cancelled" || o.state === "expired") add(o, o.state);
  }
  for (const o of open) add(o, "open");
  return [...byId.values()];
}
