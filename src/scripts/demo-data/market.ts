import { sql } from "drizzle-orm";
import { eveEntities, eveGroups, esiTokens, eveSystems, eveTypes, industryLocations, marketOrders, syncJobs, type Db } from "@/core/db";
import { MARKET_SCOPES } from "@/modules/market/module";
import type { OrderRange, OrderState } from "@/modules/market/orders";

/** Items traded by the demo orders (real type ids). */
const GROUPS = [
  { groupId: 18, name: "Mineral", categoryId: 4 },
  { groupId: 1875, name: "PLEX", categoryId: 5 },
  { groupId: 100, name: "Combat Drone", categoryId: 18 },
  { groupId: 101, name: "Mining Drone", categoryId: 18 },
  { groupId: 463, name: "Mining Barge", categoryId: 6 },
  { groupId: 1283, name: "Expedition Frigate", categoryId: 6 },
  { groupId: 1202, name: "Mining Upgrade", categoryId: 7 },
  { groupId: 54, name: "Mining Laser", categoryId: 7 },
];

const TYPES = [
  { typeId: 34, name: "Tritanium", groupId: 18 },
  { typeId: 37, name: "Isogen", groupId: 18 },
  { typeId: 40, name: "Megacyte", groupId: 18 },
  { typeId: 44992, name: "PLEX", groupId: 1875 },
  { typeId: 2454, name: "Hobgoblin I", groupId: 100 },
  { typeId: 10246, name: "Mining Drone I", groupId: 101 },
  { typeId: 17480, name: "Procurer", groupId: 463 },
  { typeId: 17478, name: "Retriever", groupId: 463 },
  { typeId: 32880, name: "Venture", groupId: 1283 },
  { typeId: 28207, name: "Mining Laser Upgrade II", groupId: 1202 },
  { typeId: 17482, name: "Strip Miner I", groupId: 54 },
];

const THE_FORGE = 10000002;
const METROPOLIS = 10000042;
const REGIONS = [
  { id: THE_FORGE, name: "The Forge", category: "region" },
  { id: METROPOLIS, name: "Metropolis", category: "region" },
];

const JITA_44 = 60003760;
const HEK = 60011740;
const RAITARU = 1_035_000_000_777;
/** A structure the character can't dock at any more: shown unnamed, with its region. */
const UNNAMED = 1_035_000_000_778;

/** Jita 4-4 next to the stations and structures of the industry demo (inserted there too; whichever runs first wins). */
const LOCATIONS: (typeof industryLocations.$inferInsert)[] = [
  { locationId: JITA_44, kind: "station", name: "Jita IV - Moon 4 - Caldari Navy Assembly Plant", solarSystemId: 30000142, typeId: 52678 },
  { locationId: HEK, kind: "station", name: "Hek VIII - Moon 12 - Boundless Creation Factory", solarSystemId: 30002053, typeId: 1531 },
  { locationId: RAITARU, kind: "structure", name: "Sirseshin - Keystar Raitaru", solarSystemId: 30000127, typeId: 35825 },
  { locationId: UNNAMED, kind: "structure", name: null, solarSystemId: null, typeId: null },
];
const REGION_OF: Record<number, number> = { [JITA_44]: THE_FORGE, [HEK]: METROPOLIS, [RAITARU]: THE_FORGE, [UNNAMED]: THE_FORGE };

interface Spec {
  type: number;
  buy?: boolean;
  corp?: boolean;
  price: number;
  total: number;
  remain: number;
  location: number;
  range?: OrderRange;
  minVolume?: number;
  /** Hours; when the order was placed or last modified (negative: in the past). */
  issuedH: number;
  durationD?: number;
  state?: OrderState;
  /** Hours; when Keystar noticed the order was no longer open. */
  closedH?: number;
}

const H = 3600_000;

/** Orders per demo character: sells and buys in stations and structures, a few closed ones, two expiring soon. */
const ORDERS: Record<string, Spec[]> = {
  "Aria Vexmoor": [
    { type: 44992, price: 4_890_000, total: 10, remain: 6, location: JITA_44, issuedH: -50 },
    { type: 17480, price: 21_450_000, total: 5, remain: 3, location: RAITARU, issuedH: -140 },
    { type: 28207, price: 1_388_000, total: 40, remain: 40, location: JITA_44, issuedH: -1 },
    { type: 34, buy: true, price: 4.02, total: 5_000_000, remain: 3_200_000, location: JITA_44, range: "station", issuedH: -75 },
    { type: 40, buy: true, price: 1_120.5, total: 20_000, remain: 20_000, location: JITA_44, range: "region", issuedH: -88 * 24 },
    { type: 17478, corp: true, price: 31_900_000, total: 2, remain: 2, location: HEK, issuedH: -240 },
    { type: 2454, price: 3_890, total: 500, remain: 0, location: JITA_44, issuedH: -500, state: "expired", closedH: -420 },
    { type: 37, buy: true, price: 58.4, total: 100_000, remain: 60_000, location: HEK, range: "solarsystem", issuedH: -720, state: "cancelled" },
  ],
  "Aria Ironveil": [
    { type: 32880, price: 1_049_000, total: 20, remain: 12, location: RAITARU, issuedH: -96 },
    { type: 17482, buy: true, price: 540_000, total: 10, remain: 10, location: UNNAMED, range: "5", minVolume: 2, issuedH: -20 },
    { type: 10246, price: 19_800, total: 200, remain: 35, location: RAITARU, issuedH: -60, state: "closed", closedH: -5 },
  ],
  "Tovan Rhask": [
    { type: 37, price: 61.3, total: 300_000, remain: 120_000, location: HEK, issuedH: -48 },
    { type: 44992, buy: true, price: 4_700_000, total: 5, remain: 5, location: JITA_44, range: "region", issuedH: -89.5 * 24 },
  ],
  "Ishani Calder": [{ type: 34, price: 4.29, total: 1_000_000, remain: 1_000_000, location: JITA_44, issuedH: -0.5 }],
};

/** Market orders for a few demo characters, which also get the opt-in market scopes. Returns the number of orders seeded. */
export async function seedMarket(db: Db, opts: { characters: { characterId: number; name: string }[]; now: Date }): Promise<number> {
  await db.insert(eveGroups).values(GROUPS).onConflictDoNothing();
  await db.insert(eveTypes).values(TYPES.map((t) => ({ ...t, published: true }))).onConflictDoNothing();
  await db.insert(eveEntities).values(REGIONS).onConflictDoNothing();
  await db.insert(eveSystems).values({ systemId: 30000142, name: "Jita", securityStatus: 0.9459, constellationId: 20000020 }).onConflictDoNothing();
  await db.insert(industryLocations).values(LOCATIONS.map((l) => ({ ...l, resolvedAt: opts.now }))).onConflictDoNothing();

  const rows: (typeof marketOrders.$inferInsert)[] = [];
  let orderId = 6_840_100_000;
  for (const c of opts.characters) {
    for (const s of ORDERS[c.name] ?? []) {
      const issued = new Date(opts.now.getTime() + s.issuedH * H);
      rows.push({
        orderId: orderId++,
        characterId: c.characterId,
        typeId: s.type,
        regionId: REGION_OF[s.location],
        locationId: s.location,
        isBuyOrder: s.buy ?? false,
        isCorporation: s.corp ?? false,
        price: s.price,
        volumeTotal: s.total,
        volumeRemain: s.remain,
        minVolume: s.buy ? (s.minVolume ?? 1) : null,
        escrow: s.buy ? s.price * s.remain : null,
        range: s.range ?? "region",
        duration: s.durationD ?? 90,
        issued,
        state: s.state ?? "open",
        closedAt: s.closedH !== undefined ? new Date(opts.now.getTime() + s.closedH * H) : null,
        firstSeenAt: issued,
        updatedAt: opts.now,
      });
    }
  }
  if (rows.length) await db.insert(marketOrders).values(rows);
  const enabled = opts.characters.filter((c) => ORDERS[c.name]);
  for (const c of enabled) {
    for (const scope of MARKET_SCOPES) {
      // The structure scope may already be there from the industry demo.
      await db
        .update(esiTokens)
        .set({ scopes: sql`array_append(array_remove(${esiTokens.scopes}, ${scope}::text), ${scope}::text)` })
        .where(sql`${esiTokens.characterId} = ${c.characterId}`);
    }
  }
  await db.insert(syncJobs).values(
    enabled.map((c) => {
      const open = ORDERS[c.name].filter((s) => (s.state ?? "open") === "open").length;
      return {
        jobKey: "market.character-orders",
        ownerType: "character" as const,
        ownerId: c.characterId,
        lastStatus: "ok" as const,
        lastSuccessAt: new Date(opts.now.getTime() - 7 * 60_000),
        lastSummary: `${open} open order${open === 1 ? "" : "s"}, ${ORDERS[c.name].length} listed`,
      };
    }),
  );
  return rows.length;
}
