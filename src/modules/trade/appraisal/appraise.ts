import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { appraisalAttempts, appraisals, eveTypes, getDb, typeValues } from "@/core/db";
import { EsiError, getEsi } from "@/core/esi";
import { notePriceInterest, PRICE_MAX_AGE_MS, syncPrices } from "@/core/eve/prices";
import { ensureTypes } from "@/core/eve/resolver";
import { createLogger, errorMessage } from "@/core/logger";
import { shareId } from "@/lib/share-id";
import { assignTypes, candidateNames, parseAppraisalInput } from "./parse";
import { totalsOf, type AppraisalItem, type AppraisalTotals, type UnparsedLine } from "./types";

/** Distinct types per appraisal (each unknown type costs ESI requests). */
export const MAX_TYPES = 500;

/**
 * A paste with more distinct types than MAX_TYPES, refused rather than truncated.
 * The UI words it from `types` and `max` in the viewer's language; the message is for logs.
 */
export class AppraisalLimitError extends Error {
  constructor(
    readonly types: number,
    readonly max: number = MAX_TYPES,
  ) {
    super(`That paste contains ${types} different items; appraise at most ${max} at a time.`);
    this.name = "AppraisalLimitError";
  }
}

/**
 * ESI failed while resolving names or pricing items (an outage or a rate-limit
 * pause). Refused rather than saved: the snapshot would list real items as
 * unrecognised or carry missing and stale prices.
 */
export class AppraisalUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`ESI unavailable: ${errorMessage(cause)}`, { cause });
    this.name = "AppraisalUnavailableError";
  }
}

const log = createLogger("appraisal");

export const MAX_INPUT_CHARS = 200_000;
/**
 * Appraisals one user may start per APPRAISAL_RATE_WINDOW_MS (each may cost ESI
 * requests and store its paste). Failed, empty and deleted appraisals count too.
 */
export const APPRAISAL_RATE_LIMIT = 30;
export const APPRAISAL_RATE_WINDOW_MS = 10 * 60_000;
/** Saved appraisals (and their share links) are deleted after this many days. */
export const APPRAISAL_RETENTION_DAYS = 365;
/** ESI /universe/ids rejects the whole batch if any name is longer; no item name is. */
const MAX_NAME_LENGTH = 100;

/**
 * Lower-cased item name → type id: local static data first, then ESI /universe/ids.
 * Throws AppraisalUnavailableError when ESI fails, so a broken call isn't taken for "no such item".
 */
export async function resolveTypeNames(names: string[]): Promise<Map<string, number>> {
  const db = getDb();
  const byLower = new Map<string, number>();
  const lower = [...new Set(names.map((n) => n.toLowerCase()))];
  const findLocal = async (wanted: string[]) => {
    for (let i = 0; i < wanted.length; i += 1000) {
      const rows = await db
        .select({ typeId: eveTypes.typeId, name: eveTypes.name })
        .from(eveTypes)
        .where(inArray(sql`lower(${eveTypes.name})`, wanted.slice(i, i + 1000)));
      for (const r of rows) byLower.set(r.name.toLowerCase(), r.typeId);
    }
  };
  await findLocal(lower);

  const unknown = names.filter((n) => !byLower.has(n.toLowerCase()) && n.length <= MAX_NAME_LENGTH);
  const found: number[] = [];
  for (let i = 0; i < unknown.length; i += 500) {
    const res = await getEsi()
      .post<{ inventory_types?: { id: number; name: string }[] }>("/universe/ids", unknown.slice(i, i + 500))
      .catch((err: unknown) => {
        log.warn("Could not resolve item names", { names: unknown.length, error: errorMessage(err) });
        throw new AppraisalUnavailableError(err);
      });
    for (const t of res.data.inventory_types ?? []) {
      byLower.set(t.name.toLowerCase(), t.id);
      found.push(t.id);
    }
  }
  if (found.length) {
    // ensureTypes skips types ESI fails to return, which would leave resolved ids without a name or volume.
    await ensureTypes(found).catch((err: unknown) => {
      if (!(err instanceof EsiError)) throw err;
      log.warn("Could not load item types", { types: found.length, error: errorMessage(err) });
      throw new AppraisalUnavailableError(err);
    });
    const stored = await db.select({ typeId: eveTypes.typeId }).from(eveTypes).where(inArray(eveTypes.typeId, found));
    const missing = new Set(found).size - stored.length;
    if (missing) {
      log.warn("Could not load item types", { types: missing });
      throw new AppraisalUnavailableError(`${missing} resolved item types could not be loaded`);
    }
  }
  return byLower;
}

/**
 * Current Jita 4-4 buy/sell per type, pricing unknown or stale types live first.
 * Throws AppraisalUnavailableError when that live pricing fails.
 */
export async function jitaPrices(typeIds: number[]): Promise<Map<number, { buy: number | null; sell: number | null }>> {
  const db = getDb();
  const load = () =>
    db
      .select()
      .from(typeValues)
      .where(and(inArray(typeValues.typeId, typeIds), inArray(typeValues.source, ["jita_buy", "jita_sell"])));
  await notePriceInterest(db, typeIds);
  let rows = typeIds.length ? await load() : [];
  // A type is fresh only when both sides were valued recently. A recent row with a
  // fallback basis (e.g. the ESI average) counts: it records that Jita had no
  // orders an hour ago, and pricing again would find the same.
  const recent = (side: "jita_buy" | "jita_sell") =>
    new Set(
      rows
        .filter((r) => r.source === side && Date.now() - r.updatedAt.getTime() < PRICE_MAX_AGE_MS)
        .map((r) => r.typeId),
    );
  const [buyFresh, sellFresh] = [recent("jita_buy"), recent("jita_sell")];
  const stale = typeIds.filter((id) => !buyFresh.has(id) || !sellFresh.has(id));
  if (stale.length) {
    const { failed } = await syncPrices(db, getEsi(), stale).catch((err: unknown) => {
      if (!(err instanceof EsiError)) throw err;
      log.warn("Could not price items", { types: stale.length, error: errorMessage(err) });
      throw new AppraisalUnavailableError(err);
    });
    if (failed.length) throw new AppraisalUnavailableError(`${failed.length} items could not be priced`);
    rows = await load();
  }
  const out = new Map<number, { buy: number | null; sell: number | null }>();
  for (const id of typeIds) out.set(id, { buy: null, sell: null });
  for (const r of rows) {
    // Only direct market prices: fallbacks such as ESI averages would mislabel the Jita columns.
    if (r.basis !== "direct" && r.basis !== "compressed") continue;
    const p = out.get(r.typeId)!;
    if (r.source === "jita_buy") p.buy = r.unitPrice;
    else p.sell = r.unitPrice;
  }
  return out;
}

export interface AppraisalResult {
  items: AppraisalItem[];
  totals: AppraisalTotals;
  unparsed: UnparsedLine[];
}

export async function appraise(input: string): Promise<AppraisalResult> {
  const lines = parseAppraisalInput(input.slice(0, MAX_INPUT_CHARS));
  const typeIdsByName = await resolveTypeNames(candidateNames(lines));
  const { items: resolved, unparsed } = assignTypes(lines, (name) => typeIdsByName.get(name));
  if (resolved.length > MAX_TYPES) {
    throw new AppraisalLimitError(resolved.length);
  }
  const kept = resolved;
  const typeIds = kept.map((i) => i.typeId);

  const [types, prices] = await Promise.all([
    typeIds.length
      ? getDb()
          .select({ typeId: eveTypes.typeId, name: eveTypes.name, volume: eveTypes.volume, packaged: eveTypes.packagedVolume })
          .from(eveTypes)
          .where(inArray(eveTypes.typeId, typeIds))
      : Promise.resolve([]),
    jitaPrices(typeIds),
  ]);
  const meta = new Map(types.map((t) => [t.typeId, t]));
  const items: AppraisalItem[] = kept.map((i) => {
    const t = meta.get(i.typeId);
    const p = prices.get(i.typeId) ?? { buy: null, sell: null };
    return {
      typeId: i.typeId,
      name: t?.name ?? `Type ${i.typeId}`,
      quantity: i.quantity,
      buy: p.buy,
      sell: p.sell,
      volume: t?.packaged ?? t?.volume ?? 0,
    };
  });
  items.sort((a, b) => (b.sell ?? b.buy ?? 0) * b.quantity - (a.sell ?? a.buy ?? 0) * a.quantity || a.name.localeCompare(b.name));
  return { items, totals: totalsOf(items), unparsed };
}

/** Short, unguessable id for share links. */
export function appraisalId(length = 10): string {
  return shareId(length);
}

/** Serialises attempt reservations so parallel submits cannot all see the last free slot. */
const ATTEMPT_LOCK = 727_277;

/**
 * Records an appraisal attempt for the rate limit, or returns false when the
 * user has used up APPRAISAL_RATE_LIMIT in the window. Call before any ESI work.
 */
export async function reserveAppraisalAttempt(userId: string, now = new Date()): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ATTEMPT_LOCK}, hashtext(${userId}))`);
    const [recent] = await tx
      .select({ n: count() })
      .from(appraisalAttempts)
      .where(and(eq(appraisalAttempts.userId, userId), gt(appraisalAttempts.createdAt, new Date(now.getTime() - APPRAISAL_RATE_WINDOW_MS))));
    if ((recent?.n ?? 0) >= APPRAISAL_RATE_LIMIT) return false;
    await tx.insert(appraisalAttempts).values({ userId, createdAt: now });
    return true;
  });
}

export async function saveAppraisal(
  result: AppraisalResult,
  meta: { input: string; pricePercent: number; userId: string; userName: string | null },
): Promise<string> {
  const id = appraisalId();
  await getDb().insert(appraisals).values({
    id,
    createdBy: meta.userId,
    createdByName: meta.userName,
    pricePercent: meta.pricePercent,
    items: result.items,
    totals: result.totals,
    unparsed: result.unparsed,
    input: meta.input.slice(0, MAX_INPUT_CHARS),
  });
  return id;
}
