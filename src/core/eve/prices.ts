import { inArray, lt, sql } from "drizzle-orm";
import { eveTypes, marketPrices, priceInterest, typeValueHistory, typeValues, type Db } from "@/core/db";
import type { PriceSource, ValuationSource } from "@/core/db/schema/eve";
import { EsiError, EsiRateLimitedError, type EsiClient } from "@/core/esi/client";
import { createLogger, errorMessage } from "@/core/logger";
import { mapLimit } from "@/lib/concurrency";

export const THE_FORGE_REGION_ID = 10000002;
export const JITA_44_STATION_ID = 60003760;

/** Values older than this are priced again before an on-demand lookup uses them. */
export const PRICE_MAX_AGE_MS = 2 * 3600 * 1000;
/** On-demand types stay in the hourly price job for this many days after the last request. */
export const PRICE_INTEREST_DAYS = 14;

const log = createLogger("prices");

/** Choices for the ore valuation setting; labels are in `t.eve.valuationSources`. */
export const VALUATION_SOURCES: ValuationSource[] = ["jita_buy", "jita_sell", "jita_split", "esi_average"];

interface MarketOrder {
  is_buy_order: boolean;
  location_id: number;
  price: number;
}

/** Best Jita 4-4 buy/sell for one type from ESI regional orders. */
export function bestJitaPrices(orders: MarketOrder[]): { buy: number | null; sell: number | null } {
  let buy: number | null = null;
  let sell: number | null = null;
  for (const o of orders) {
    if (o.location_id !== JITA_44_STATION_ID) continue;
    if (o.is_buy_order) buy = buy === null ? o.price : Math.max(buy, o.price);
    else sell = sell === null ? o.price : Math.min(sell, o.price);
  }
  return { buy, sell };
}

type PriceMap = Map<number, Partial<Record<PriceSource, number>>>;

function pick(prices: PriceMap, typeId: number, source: ValuationSource): number | null {
  const p = prices.get(typeId);
  if (!p) return null;
  switch (source) {
    case "jita_buy":
      return p.jita_buy ?? null;
    case "jita_sell":
      return p.jita_sell ?? null;
    case "jita_split":
      if (p.jita_buy && p.jita_sell) return (p.jita_buy + p.jita_sell) / 2;
      return p.jita_buy ?? p.jita_sell ?? null;
    case "esi_average":
      return p.esi_average ?? null;
  }
}

export interface ValuationType {
  typeId: number;
  portionSize: number | null;
  compressedTypeId: number | null;
  compressedPortionSize: number | null;
}

/**
 * Per-unit value of a type under a valuation source with fallbacks:
 * direct market price → compressed variant price ÷ compression ratio →
 * ESI average → ESI adjusted price.
 */
export function resolveUnitValue(
  type: ValuationType,
  source: ValuationSource,
  prices: PriceMap,
): { unitPrice: number; basis: string } | null {
  const direct = pick(prices, type.typeId, source);
  if (direct && direct > 0) return { unitPrice: direct, basis: "direct" };

  if (type.compressedTypeId && type.portionSize && type.compressedPortionSize) {
    const ratio = type.portionSize / type.compressedPortionSize;
    const compressed = pick(prices, type.compressedTypeId, source);
    if (compressed && compressed > 0 && ratio > 0) return { unitPrice: compressed / ratio, basis: "compressed" };
  }

  const avg = prices.get(type.typeId)?.esi_average;
  if (avg && avg > 0) return { unitPrice: avg, basis: "esi_average" };
  const adjusted = prices.get(type.typeId)?.esi_adjusted;
  if (adjusted && adjusted > 0) return { unitPrice: adjusted, basis: "esi_adjusted" };
  return null;
}

/** Records that these types were just asked for, keeping them in the hourly price job. */
export async function notePriceInterest(db: Db, typeIds: number[]): Promise<void> {
  const ids = [...new Set(typeIds)];
  if (!ids.length) return;
  await db
    .insert(priceInterest)
    .values(ids.map((typeId) => ({ typeId, lastRequestedAt: new Date() })))
    .onConflictDoUpdate({ target: priceInterest.typeId, set: { lastRequestedAt: sql`excluded.last_requested_at` } });
}

/** Types asked for within PRICE_INTEREST_DAYS; older interest is dropped. */
export async function recentPriceInterest(db: Db): Promise<number[]> {
  const cutoff = new Date(Date.now() - PRICE_INTEREST_DAYS * 24 * 3600 * 1000);
  await db.delete(priceInterest).where(lt(priceInterest.lastRequestedAt, cutoff));
  const rows = await db.select({ typeId: priceInterest.typeId }).from(priceInterest);
  return rows.map((r) => r.typeId);
}

export interface PriceSyncResult {
  summary: string;
  /** Requested types left unvalued because their (or their compressed variant's) Jita orders couldn't be fetched. */
  failed: number[];
  /** Set when ESI rate-limited the run: it stopped fetching, so the rest of the types are in `failed`. */
  rateLimited: EsiRateLimitedError | null;
}

/**
 * Refreshes market prices for the given types (plus compressed variants) and
 * recomputes their valuations, snapshotting today's values for history.
 *
 * A type whose Jita orders can't be fetched keeps its previous values and is
 * reported in `failed`; the rest are still written. On a rate limit it stops
 * fetching and reports it in `rateLimited`. Throws when every order request failed.
 */
export async function syncPrices(db: Db, esi: EsiClient, interestTypeIds: number[]): Promise<PriceSyncResult> {
  if (!interestTypeIds.length) return { summary: "No priced types yet", failed: [], rateLimited: null };

  const types = await db
    .select({ typeId: eveTypes.typeId, portionSize: eveTypes.portionSize, compressedTypeId: eveTypes.compressedTypeId })
    .from(eveTypes)
    .where(inArray(eveTypes.typeId, interestTypeIds));
  const compressedIds = types.map((t) => t.compressedTypeId).filter((id): id is number => !!id);
  const compressedRows = compressedIds.length
    ? await db
        .select({ typeId: eveTypes.typeId, portionSize: eveTypes.portionSize })
        .from(eveTypes)
        .where(inArray(eveTypes.typeId, compressedIds))
    : [];
  const compressedPortion = new Map(compressedRows.map((r) => [r.typeId, r.portionSize]));
  const allIds = [...new Set([...types.map((t) => t.typeId), ...compressedIds])];

  const prices: PriceMap = new Map();
  const set = (typeId: number, source: PriceSource, price: number | null | undefined) => {
    if (price == null || !(price > 0)) return;
    prices.set(typeId, { ...(prices.get(typeId) ?? {}), [source]: price });
  };

  // ESI global average/adjusted prices: one request for every type.
  const avg = await esi.get<{ type_id: number; average_price?: number; adjusted_price?: number }[]>("/markets/prices");
  const wanted = new Set(allIds);
  for (const p of avg.data) {
    if (!wanted.has(p.type_id)) continue;
    set(p.type_id, "esi_average", p.average_price);
    set(p.type_id, "esi_adjusted", p.adjusted_price);
  }

  // Jita 4-4 best buy/sell from The Forge regional orders (market-order group: 12k tokens / 15 min).
  // Without a type's orders its fallbacks would be taken for "no Jita market", so it's skipped below.
  const unfetched = new Set<number>();
  let firstError: EsiError | null = null;
  let rateLimited: EsiRateLimitedError | null = null;
  await mapLimit(allIds, 8, async (typeId) => {
    if (rateLimited) {
      unfetched.add(typeId);
      return;
    }
    try {
      const orders = await esi.getAllPages<MarketOrder>(`/markets/${THE_FORGE_REGION_ID}/orders`, {
        query: { order_type: "all", type_id: typeId },
      });
      const best = bestJitaPrices(orders.data);
      set(typeId, "jita_buy", best.buy);
      set(typeId, "jita_sell", best.sell);
    } catch (err) {
      if (!(err instanceof EsiError)) throw err;
      unfetched.add(typeId);
      firstError ??= err;
      if (err instanceof EsiRateLimitedError) rateLimited = err;
    }
  });
  if (firstError && unfetched.size === allIds.length) throw rateLimited ?? firstError;

  const priceRows = [...prices.entries()].flatMap(([typeId, p]) =>
    Object.entries(p).map(([source, price]) => ({ typeId, source: source as PriceSource, price: price!, updatedAt: new Date() })),
  );
  if (priceRows.length) {
    await db
      .insert(marketPrices)
      .values(priceRows)
      .onConflictDoUpdate({
        target: [marketPrices.typeId, marketPrices.source],
        set: { price: sql`excluded.price`, updatedAt: sql`excluded.updated_at` },
      });
  }

  const today = new Date().toISOString().slice(0, 10);
  const sources: ValuationSource[] = ["jita_buy", "jita_sell", "jita_split", "esi_average"];
  const valueRows: (typeof typeValues.$inferInsert)[] = [];
  const failed: number[] = [];
  for (const t of types) {
    if (unfetched.has(t.typeId) || (t.compressedTypeId && unfetched.has(t.compressedTypeId))) {
      failed.push(t.typeId);
      continue;
    }
    for (const source of sources) {
      const v = resolveUnitValue(
        {
          typeId: t.typeId,
          portionSize: t.portionSize,
          compressedTypeId: t.compressedTypeId,
          compressedPortionSize: t.compressedTypeId ? (compressedPortion.get(t.compressedTypeId) ?? null) : null,
        },
        source,
        prices,
      );
      if (v) valueRows.push({ typeId: t.typeId, source, unitPrice: v.unitPrice, basis: v.basis, updatedAt: new Date() });
    }
  }
  if (valueRows.length) {
    await db
      .insert(typeValues)
      .values(valueRows)
      .onConflictDoUpdate({
        target: [typeValues.typeId, typeValues.source],
        set: { unitPrice: sql`excluded.unit_price`, basis: sql`excluded.basis`, updatedAt: sql`excluded.updated_at` },
      });
    await db
      .insert(typeValueHistory)
      .values(valueRows.map((r) => ({ typeId: r.typeId, source: r.source, date: today, unitPrice: r.unitPrice })))
      .onConflictDoUpdate({
        target: [typeValueHistory.typeId, typeValueHistory.source, typeValueHistory.date],
        set: { unitPrice: sql`excluded.unit_price` },
      });
  }
  if (firstError) {
    log.warn("Could not fetch Jita orders", { types: unfetched.size, error: errorMessage(firstError) });
  }
  const summary = `Priced ${types.length - failed.length} types (${allIds.length - unfetched.size} incl. compressed)`;
  return { summary: failed.length ? `${summary}, ${failed.length} failed` : summary, failed, rateLimited };
}
