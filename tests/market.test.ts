import { describe, expect, it } from "vitest";
import { scopesToSwitchOff } from "@/core/modules/registry";
import { MESSAGES } from "@/i18n/messages";
import { INDUSTRY_JOBS_SCOPE, INDUSTRY_MANAGE_HREF, STRUCTURES_SCOPE } from "@/modules/industry/module";
import { marketQueryString, parseMarketFilters } from "@/modules/market/filters";
import { MARKET_MANAGE_HREF, MARKET_ORDERS_SCOPE } from "@/modules/market/module";
import {
  expiresAt,
  ORDER_RANGES,
  orderOutcome,
  orderRows,
  statesOf,
  type EsiMarketOrder,
  type EsiMarketOrderHistory,
} from "@/modules/market/orders";
import { SKILLS_MANAGE_HREF, SKILLS_SCOPES } from "@/modules/skills/module";

const now = new Date("2026-10-07T12:00:00Z");
const days = (d: number) => new Date(now.getTime() + d * 86_400_000);

function esiOrder(extra: Partial<EsiMarketOrder> = {}): EsiMarketOrder {
  return {
    order_id: 6_000_001,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_corporation: false,
    price: 4.15,
    volume_total: 1_000_000,
    volume_remain: 400_000,
    range: "region",
    duration: 90,
    issued: days(-3).toISOString(),
    ...extra,
  };
}

const history = (extra: Partial<EsiMarketOrderHistory> = {}): EsiMarketOrderHistory => ({ ...esiOrder(extra), state: "expired", ...extra });

describe("market order rows", () => {
  it("maps an open sell order, filling the buy-only fields with null", () => {
    const [row] = orderRows(2_112_000_001, [esiOrder()], [], now);
    expect(row).toMatchObject({
      orderId: 6_000_001,
      characterId: 2_112_000_001,
      typeId: 34,
      regionId: 10000002,
      locationId: 60003760,
      isBuyOrder: false,
      isCorporation: false,
      price: 4.15,
      volumeTotal: 1_000_000,
      volumeRemain: 400_000,
      minVolume: null,
      escrow: null,
      range: "region",
      duration: 90,
      state: "open",
      updatedAt: now,
    });
    expect(row.issued).toEqual(days(-3));
  });

  it("keeps the buy order details", () => {
    const [row] = orderRows(1, [esiOrder({ is_buy_order: true, is_corporation: true, range: "5", min_volume: 10, escrow: 1_660_000 })], [], now);
    expect(row).toMatchObject({ isBuyOrder: true, isCorporation: true, range: "5", minVolume: 10, escrow: 1_660_000 });
  });

  it("takes the history's state when both lists have an order", () => {
    const rows = orderRows(1, [esiOrder(), esiOrder({ order_id: 2 })], [history({ state: "cancelled", volume_remain: 10 }), history({ order_id: 3 })], now);
    expect(rows.map((r) => [r.orderId, r.state, r.volumeRemain])).toEqual([
      [6_000_001, "cancelled", 10],
      [3, "expired", 400_000],
      [2, "open", 400_000],
    ]);
  });

  it("skips orders with a range or history state it doesn't know", () => {
    expect(orderRows(1, [esiOrder({ range: "galaxy" }), esiOrder({ order_id: 2 })], [history({ order_id: 3, state: "mystery" })], now).map((r) => r.orderId)).toEqual([2]);
  });

  it("knows every range ESI documents", () => {
    expect([...ORDER_RANGES].sort()).toEqual(["1", "10", "2", "20", "3", "30", "4", "40", "5", "region", "solarsystem", "station"]);
  });
});

describe("market order state", () => {
  it("expires an order its duration after it was issued", () => {
    expect(expiresAt({ issued: days(-3), duration: 90 })).toEqual(days(87));
  });

  it("calls an expired order with nothing left filled", () => {
    expect(orderOutcome({ state: "expired", volumeRemain: 0 })).toBe("filled");
    expect(orderOutcome({ state: "expired", volumeRemain: 5 })).toBe("expired");
    expect(orderOutcome({ state: "cancelled", volumeRemain: 0 })).toBe("cancelled");
    expect(orderOutcome({ state: "closed", volumeRemain: 5 })).toBe("closed");
    expect(orderOutcome({ state: "open", volumeRemain: 5 })).toBe("open");
  });

  it("groups states by view", () => {
    expect(statesOf("open")).toEqual(["open"]);
    expect(statesOf("closed")).toEqual(["closed", "cancelled", "expired"]);
    expect(statesOf("all")).toHaveLength(4);
  });
});

describe("market filters", () => {
  it("defaults to open orders on both sides with nothing selected", () => {
    expect(parseMarketFilters({})).toEqual({ view: "open", side: "all", characters: [], locations: [], page: 1 });
  });

  it("reads lists, drops unknown values and round-trips through the query string", () => {
    const f = parseMarketFilters({ view: "closed", side: "buy", chars: "5,5,x,0,7", locations: ["60003760", "1035466617946"], page: "2" });
    expect(f).toEqual({ view: "closed", side: "buy", characters: [5, 7], locations: [60003760, 1035466617946], page: 2 });
    expect(parseMarketFilters(Object.fromEntries(new URLSearchParams(marketQueryString(f))))).toEqual(f);
    expect(marketQueryString(parseMarketFilters({}))).toBe("");
    expect(marketQueryString(f, { page: 1, view: "open", side: "all" })).toBe("chars=5%2C7&locations=60003760%2C1035466617946");
  });

  it("falls back for an unknown view, side or page", () => {
    expect(parseMarketFilters({ view: "later", side: "both", page: "-4" })).toMatchObject({ view: "open", side: "all", page: 1 });
  });
});

describe("shared opt-in scopes", () => {
  const MARKET = [MARKET_ORDERS_SCOPE, STRUCTURES_SCOPE];
  const INDUSTRY = [INDUSTRY_JOBS_SCOPE, STRUCTURES_SCOPE];

  it("switches the structure scope off with the last access that uses it", () => {
    expect(scopesToSwitchOff(MARKET_MANAGE_HREF, MARKET).sort()).toEqual([...MARKET].sort());
    expect(scopesToSwitchOff(INDUSTRY_MANAGE_HREF, INDUSTRY).sort()).toEqual([...INDUSTRY].sort());
  });

  it("keeps it while the other access is on", () => {
    const both = [...new Set([...MARKET, ...INDUSTRY])];
    expect(scopesToSwitchOff(MARKET_MANAGE_HREF, both)).toEqual([MARKET_ORDERS_SCOPE]);
    expect(scopesToSwitchOff(INDUSTRY_MANAGE_HREF, both)).toEqual([INDUSTRY_JOBS_SCOPE]);
    // Industry switched off already (its jobs scope gone): market access takes the structure scope with it.
    expect(scopesToSwitchOff(MARKET_MANAGE_HREF, MARKET).sort()).toEqual([...MARKET].sort());
  });

  it("leaves scopes no other access declares alone", () => {
    expect(scopesToSwitchOff(SKILLS_MANAGE_HREF, [...SKILLS_SCOPES]).sort()).toEqual([...SKILLS_SCOPES].sort());
    expect(scopesToSwitchOff("/nowhere", [...SKILLS_SCOPES])).toEqual([]);
  });
});

describe("market dictionary", () => {
  it("names every view, side, outcome and range in every language", () => {
    for (const messages of Object.values(MESSAGES)) {
      const m = messages.market;
      for (const v of ["open", "closed", "all"] as const) expect(m.views[v].label).toBeTruthy();
      for (const s of ["all", "sell", "buy"] as const) expect(m.sides[s]).toBeTruthy();
      for (const o of ["open", "filled", "closed", "cancelled", "expired"] as const) expect(m.outcomes[o]).toBeTruthy();
      expect(m.ranges.jumps(1)).toMatch(/^1 /);
      expect(m.ranges.jumps(5)).not.toBe(m.ranges.jumps(1).replace("1", "5"));
    }
  });
});
