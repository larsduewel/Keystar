"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { assertPermission } from "@/core/auth/dal";
import { eveTypes, getDb, typeValues } from "@/core/db";
import { EsiError, getEsi } from "@/core/esi";
import { notePriceInterest, PRICE_MAX_AGE_MS, syncPrices } from "@/core/eve/prices";
import { ensureTypes } from "@/core/eve/resolver";
import { createLogger, errorMessage } from "@/core/logger";
import { getSetting } from "@/core/settings";
import { MINING_PERMISSIONS } from "../module";

const log = createLogger("field-estimator");

/** ESI /universe/ids rejects the whole batch if any name is longer; no ore name is. */
const MAX_NAME_LENGTH = 100;

export interface SurveyPrice {
  typeId: number;
  name: string;
  unitPrice: number | null;
  basis: string | null;
}

export interface SurveyPricing {
  /** Lower-cased ore name → price. */
  prices: Record<string, SurveyPrice>;
  /**
   * ESI failed resolving names or pricing types. Those are left out of `prices`
   * (rather than sent as unpriced) so the next request tries them again.
   */
  esiUnavailable: boolean;
}

/**
 * Values the ore types from a pasted survey scan with Keystar's configured
 * price source. Unknown names are resolved through ESI; types without a recent
 * value are priced live, and the hourly price job keeps them fresh while they
 * keep being asked for.
 */
export async function priceSurveyTypes(names: string[]): Promise<SurveyPricing> {
  await assertPermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 200);
  if (!wanted.length) return { prices: {}, esiUnavailable: false };

  const db = getDb();
  const lower = wanted.map((n) => n.toLowerCase());
  const findTypes = () =>
    db
      .select({ typeId: eveTypes.typeId, name: eveTypes.name })
      .from(eveTypes)
      .where(inArray(sql`lower(${eveTypes.name})`, lower));

  let esiUnavailable = false;
  let types = await findTypes();
  const known = new Set(types.map((t) => t.name.toLowerCase()));
  const unknown = wanted.filter((n) => !known.has(n.toLowerCase()) && n.length <= MAX_NAME_LENGTH);
  if (unknown.length) {
    const res = await getEsi()
      .post<{ inventory_types?: { id: number; name: string }[] }>("/universe/ids", unknown)
      .catch((err: unknown) => {
        log.warn("Could not resolve ore names", { names: unknown.length, error: errorMessage(err) });
        esiUnavailable = true;
        return null;
      });
    const ids = res?.data.inventory_types?.map((t) => t.id) ?? [];
    if (ids.length) {
      await ensureTypes(ids).catch((err: unknown) => {
        if (!(err instanceof EsiError)) throw err;
        log.warn("Could not load ore types", { types: ids.length, error: errorMessage(err) });
      });
      types = await findTypes();
      // ensureTypes skips types ESI fails to return; their names are left out and tried again next time.
      const stored = await db.select({ typeId: eveTypes.typeId }).from(eveTypes).where(inArray(eveTypes.typeId, ids));
      if (stored.length < new Set(ids).size) esiUnavailable = true;
    }
  }

  const source = await getSetting("mining.valuationSource");
  const typeIds = types.map((t) => t.typeId);
  const loadValues = () =>
    typeIds.length
      ? db
          .select()
          .from(typeValues)
          .where(and(eq(typeValues.source, source), inArray(typeValues.typeId, typeIds)))
      : Promise.resolve([]);

  await notePriceInterest(db, typeIds);
  let values = await loadValues();
  const fresh = (v: (typeof values)[number]) => Date.now() - v.updatedAt.getTime() < PRICE_MAX_AGE_MS;
  const unpriced = typeIds.filter((id) => !values.some((v) => v.typeId === id && fresh(v)));
  let failed = new Set<number>();
  if (unpriced.length) {
    const result = await syncPrices(db, getEsi(), unpriced).catch((err: unknown) => {
      if (!(err instanceof EsiError)) throw err;
      log.warn("Could not price ore types", { types: unpriced.length, error: errorMessage(err) });
      return null;
    });
    failed = new Set(result?.failed ?? unpriced);
    if (failed.size) esiUnavailable = true;
    values = await loadValues();
  }

  const prices: Record<string, SurveyPrice> = {};
  for (const t of types) {
    if (failed.has(t.typeId)) continue;
    const v = values.find((x) => x.typeId === t.typeId);
    prices[t.name.toLowerCase()] = { typeId: t.typeId, name: t.name, unitPrice: v?.unitPrice ?? null, basis: v?.basis ?? null };
  }
  return { prices, esiUnavailable };
}
