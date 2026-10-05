import { sql } from "drizzle-orm";
import {
  esiTokens,
  eveGroups,
  eveTypes,
  miningActivity,
  miningActivityCoverage,
  miningPnlCharacters,
  miningPnlEntries,
  miningPnlPriceRules,
  miningPnlTxOverrides,
  syncJobs,
  walletFees,
  walletTransactions,
  type Db,
} from "@/core/db";
import { WALLET_SCOPE } from "@/modules/wallet/module";

/**
 * Demo data for the mining P&L of one account: wallet import on for two of
 * its characters (automatic counting of purchases and sales on for one, off for the other), a month
 * of purchases and ore sales, manual costs, a price rule and two weeks of
 * measured mining activity.
 */

/** Real type ids so item icons resolve (groups/categories from ESI). */
const GROUPS = [
  { groupId: 482, name: "Mining Crystal", categoryId: 8 },
  { groupId: 1771, name: "Mining Foreman Burst Charges", categoryId: 8 },
  { groupId: 101, name: "Mining Drone", categoryId: 18 },
  { groupId: 100, name: "Combat Drone", categoryId: 18 },
  { groupId: 423, name: "Ice Product", categoryId: 4 },
  { groupId: 543, name: "Exhumer", categoryId: 6 },
  { groupId: 18, name: "Mineral", categoryId: 4 },
  { groupId: 38, name: "Shield Extender", categoryId: 7 },
  { groupId: 1875, name: "PLEX", categoryId: 5 },
];
const ITEMS = {
  moonCrystal: { typeId: 46356, name: "Ubiquitous Moon Mining Crystal Type A II", groupId: 482, volume: 10, price: 1_450_000 },
  burst: { typeId: 42829, name: "Mining Laser Field Enhancement Charge", groupId: 1771, volume: 0.01, price: 21_500 },
  iceDrone: { typeId: 43700, name: "Ice Harvesting Drone II", groupId: 101, volume: 50, price: 9_800_000 },
  heavyWater: { typeId: 16272, name: "Heavy Water", groupId: 423, volume: 0.4, price: 640 },
  mackinaw: { typeId: 22548, name: "Mackinaw", groupId: 543, volume: 3_750_000, price: 312_000_000 },
  hobgoblin: { typeId: 2456, name: "Hobgoblin II", groupId: 100, volume: 5, price: 1_150_000 },
  tritanium: { typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01, price: 4.1 },
  shield: { typeId: 3841, name: "Large Shield Extender II", groupId: 38, volume: 20, price: 3_900_000 },
  plex: { typeId: 44992, name: "PLEX", groupId: 1875, volume: 0.0002, price: 4_900_000 },
};

export interface PnlDemoCharacter {
  characterId: number;
  name: string;
  profile: string;
}

export interface PnlDemoLedgerRow {
  characterId: number;
  date: string;
  typeId: number;
  quantity: number;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function seedMiningPnl(
  db: Db,
  opts: {
    userId: string;
    characters: PnlDemoCharacter[];
    ledger: PnlDemoLedgerRow[];
    types: Map<number, { name: string; volume: number; compressedTypeId: number | null }>;
    jitaBuy: Map<number, number>;
    rand: () => number;
    now: Date;
  },
): Promise<{ transactions: number; windows: number }> {
  const { userId, rand, now } = opts;
  const [moon, alt, ice] = opts.characters;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const at = (daysAgo: number, hour: number) => new Date(today.getTime() - daysAgo * 86400_000 + hour * 3600_000 + Math.floor(rand() * 3600_000));

  await db.insert(eveGroups).values(GROUPS).onConflictDoNothing();
  await db
    .insert(eveTypes)
    .values(Object.values(ITEMS).map((i) => ({ typeId: i.typeId, name: i.name, groupId: i.groupId, volume: i.volume, portionSize: 1, published: true })))
    .onConflictDoNothing();

  // Wallet import is opt-in: on for the moon miner (counting automatically) and the ice alt (reviewing by hand).
  for (const c of [moon, ice]) {
    await db
      .update(esiTokens)
      .set({ scopes: sql`array_append(${esiTokens.scopes}, ${WALLET_SCOPE})` })
      .where(sql`${esiTokens.characterId} = ${c.characterId}`);
  }
  await db.insert(miningPnlCharacters).values([
    { userId, characterId: moon.characterId, autoIncludeExpenses: true, autoIncludeSales: true },
    { userId, characterId: ice.characterId, autoIncludeExpenses: false, autoIncludeSales: false },
  ]);

  // --- Wallet purchases and sales over the last 30 days ---------------------
  let nextTx = 6_400_000_000;
  const rows: (typeof walletTransactions.$inferInsert)[] = [];
  const buy = (characterId: number, item: (typeof ITEMS)[keyof typeof ITEMS], quantity: number, date: Date, markup = 1) => {
    rows.push({
      characterId,
      transactionId: nextTx++,
      userId,
      date,
      typeId: item.typeId,
      quantity,
      unitPrice: Math.round(item.price * markup * (0.97 + rand() * 0.06) * 100) / 100,
      isBuy: true,
      clientId: 1_000_125,
      locationId: 60_003_760,
      journalRefId: nextTx,
    });
    return nextTx - 1;
  };
  for (let d = 28; d >= 0; d -= 5) buy(moon.characterId, ITEMS.moonCrystal, 6, at(d, 17));
  for (let d = 27; d >= 0; d -= 7) buy(moon.characterId, ITEMS.burst, 300, at(d, 17));
  const giftedCrystals = buy(moon.characterId, ITEMS.moonCrystal, 12, at(11, 20)); // bought for a corp mate
  buy(moon.characterId, ITEMS.shield, 2, at(19, 21)); // PvP fit: not a mining cost
  buy(moon.characterId, ITEMS.plex, 500, at(24, 12)); // Omega is entered by hand below, so this stays out
  for (let d = 26; d >= 0; d -= 4) buy(ice.characterId, ITEMS.heavyWater, 4_000 + Math.floor(rand() * 2_000), at(d, 19));
  buy(ice.characterId, ITEMS.iceDrone, 5, at(16, 19));
  buy(ice.characterId, ITEMS.mackinaw, 1, at(9, 22)); // lost to a gank
  const hobgoblins = buy(ice.characterId, ITEMS.hobgoblin, 5, at(9, 22)); // defence drones, counted by hand
  for (let d = 22; d >= 0; d -= 8) buy(ice.characterId, ITEMS.tritanium, 250_000, at(d, 14)); // industry, stays out

  // Ore sold on the market: moon ore near Jita buy, compressed ice above it.
  const mined = (characterId: number) => {
    const totals = new Map<number, number>();
    for (const r of opts.ledger) if (r.characterId === characterId && r.date >= isoDay(new Date(today.getTime() - 30 * 86400_000))) totals.set(r.typeId, (totals.get(r.typeId) ?? 0) + r.quantity);
    return [...totals].sort((a, b) => b[1] - a[1]);
  };
  const sell = (characterId: number, typeId: number, quantity: number, unitPrice: number, date: Date) =>
    rows.push({ characterId, transactionId: nextTx++, userId, date, typeId, quantity, unitPrice, isBuy: false, clientId: 1_000_125, locationId: 60_003_760, journalRefId: nextTx });
  for (const [typeId, qty] of mined(moon.characterId).slice(0, 3)) {
    const price = opts.jitaBuy.get(typeId);
    if (price) sell(moon.characterId, typeId, Math.floor(qty * 0.6), Math.round(price * 0.96 * 100) / 100, at(3, 18));
  }
  const iceMined = mined(ice.characterId);
  for (const [typeId, qty] of iceMined.slice(0, 2)) {
    const compressed = opts.types.get(typeId)?.compressedTypeId;
    const price = compressed ? opts.jitaBuy.get(compressed) : undefined;
    if (compressed && price) sell(ice.characterId, compressed, Math.floor(qty * 0.8), Math.round(price * 0.99), at(2, 20));
  }
  await db.insert(walletTransactions).values(rows);

  // Sales tax on every sale (the moon miner has better trade skills than the ice alt) and broker fees for sell orders.
  let nextJournal = 23_100_000_000;
  const fees: (typeof walletFees.$inferInsert)[] = [];
  for (const r of rows.filter((r) => !r.isBuy)) {
    const value = r.quantity * r.unitPrice;
    const rate = r.characterId === moon.characterId ? 0.0225 : 0.036;
    fees.push({
      characterId: r.characterId,
      journalId: nextJournal++,
      userId,
      date: r.date,
      refType: "transaction_tax",
      amount: Math.round(value * rate * 100) / 100,
      contextId: r.transactionId,
      contextIdType: "market_transaction_id",
    });
    fees.push({
      characterId: r.characterId,
      journalId: nextJournal++,
      userId,
      date: new Date(r.date.getTime() - 6 * 3600_000),
      refType: "brokers_fee",
      amount: Math.round(value * 0.015 * 100) / 100,
      contextId: null,
      contextIdType: null,
      description: "Market order commission to Jita IV - Moon 4 - Caldari Navy Assembly Plant",
    });
  }
  if (fees.length) await db.insert(walletFees).values(fees);

  await db.insert(miningPnlTxOverrides).values([
    { userId, characterId: moon.characterId, transactionId: giftedCrystals, included: false },
    { userId, characterId: ice.characterId, transactionId: hobgoblins, category: "drones", included: true },
  ]);

  // --- Manual costs and a price rule ----------------------------------------
  await db.insert(miningPnlEntries).values([
    {
      userId,
      characterId: alt.characterId,
      date: isoDay(new Date(today.getTime() - 75 * 86400_000)),
      spreadDays: 365,
      category: "subscription",
      description: "12 months Omega (PLEX)",
      amount: 2_400_000_000,
    },
    {
      userId,
      characterId: null,
      date: isoDay(new Date(today.getTime() - 6 * 86400_000)),
      spreadDays: 1,
      category: "other",
      description: "Hauling contract to Jita",
      amount: 38_000_000,
    },
  ]);
  if (iceMined[0]) {
    const [typeId] = iceMined[0];
    const price = opts.jitaBuy.get(typeId);
    if (price) {
      await db.insert(miningPnlPriceRules).values({
        userId,
        typeId,
        unitPrice: Math.round(price * 1.08),
        validFrom: isoDay(new Date(today.getTime() - 20 * 86400_000)),
      });
    }
  }

  // --- Measured activity: sessions in 15-minute windows over the last 14 days ---
  const since = new Date(today.getTime() - 14 * 86400_000);
  const activity: (typeof miningActivity.$inferInsert)[] = [];
  // The two moon characters mine together; the ice alt goes out later.
  const sessions = new Map(
    opts.characters.map((c, i) => [
      c.characterId,
      { startHour: c.profile === "ice" ? 19.5 : 18 + i * 0.1, m3PerHour: c.profile === "ice" ? 30_000 : 45_000 },
    ]),
  );
  const byCharDay = new Map<string, PnlDemoLedgerRow[]>();
  for (const r of opts.ledger) {
    if (r.date < isoDay(since) || r.date >= isoDay(today)) continue;
    const key = `${r.characterId}|${r.date}`;
    byCharDay.set(key, [...(byCharDay.get(key) ?? []), r]);
  }
  for (const [key, dayRows] of byCharDay) {
    const [characterId, date] = [Number(key.split("|")[0]), key.split("|")[1]];
    const session = sessions.get(characterId);
    if (!session) continue;
    const m3 = dayRows.reduce((s, r) => s + r.quantity * (opts.types.get(r.typeId)?.volume ?? 0), 0);
    const hours = Math.min(5, Math.max(0.5, m3 / session.m3PerHour));
    const windows = Math.max(1, Math.round(hours * 4));
    const sessionStart = new Date(`${date}T00:00:00Z`).getTime() + session.startHour * 3600_000;
    for (let w = 0; w < windows; w++) {
      const windowStart = new Date(sessionStart + w * 900_000);
      const windowEnd = new Date(sessionStart + (w + 1) * 900_000);
      for (const r of dayRows) {
        const quantity = Math.round(r.quantity / windows);
        if (quantity > 0) activity.push({ characterId, date, typeId: r.typeId, quantity, windowStart, windowEnd });
      }
    }
  }
  for (let i = 0; i < activity.length; i += 1000) await db.insert(miningActivity).values(activity.slice(i, i + 1000));
  await db.insert(miningActivityCoverage).values(
    opts.characters.map((c) => ({ characterId: c.characterId, since, lastObservedAt: new Date(now.getTime() - 600_000), lastGrowthAt: null })),
  );

  await db.insert(syncJobs).values(
    [moon, ice].map((c) => ({
      jobKey: "wallet.character-transactions",
      ownerType: "character" as const,
      ownerId: c.characterId,
      lastStatus: "ok" as const,
      lastSummary: `${rows.filter((r) => r.characterId === c.characterId).length} new transactions`,
      lastRunAt: new Date(now.getTime() - 1_200_000),
      lastSuccessAt: new Date(now.getTime() - 1_200_000),
      lastDurationMs: 420,
      nextRunAt: new Date(now.getTime() + 2_400_000),
    })),
  );

  return { transactions: rows.length, windows: new Set(activity.map((a) => `${a.characterId}|${a.windowEnd}`)).size };
}
