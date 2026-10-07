import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { eveGroups, eveTypes, getDb, intelDscanLookups, type Db } from "@/core/db";
import { countDscan } from "@/core/eve/dscan";
import { ensureTypes } from "@/core/eve/resolver";
import { env } from "@/core/env";
import { DSCAN_ERROR_HEADROOM, DSCAN_LOOKUP_LIMIT, DSCAN_LOOKUP_WINDOW_MS, DSCAN_MAX_LOOKUPS } from "./constants";
import { hullClass, SHIP_GROUPS, type HullClass } from "./hulls";
import { DAY_MS } from "./score/decay";
import type { DscanEntry, PilotProfile, Standing } from "./types";

/**
 * D-scan → pilots: which of the scanned pilots probably flies which hull on
 * the d-scan, from the hulls each pilot actually flew recently. Exact hull
 * matches count fully, the same hull class only a little.
 */

export const MAX_DSCAN_CHARS = 50_000;
const SHIP_CATEGORY = 6;
/** A class match (e.g. any interdictor for a Sabre) counts this much of an exact one. */
const CLASS_FACTOR = 0.25;
const MIN_EVIDENCE = 0.15;

/** Serialises lookup reservations so parallel pastes cannot all see the last free slot. */
const LOOKUP_LOCK = 727_278;

/**
 * Records a d-scan paste that needs ESI type lookups, or returns false when
 * the user has used up DSCAN_LOOKUP_LIMIT in the window.
 */
export async function reserveDscanLookup(userId: string, now = new Date(), db: Db = getDb()): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOOKUP_LOCK}, hashtext(${userId}))`);
    const [recent] = await tx
      .select({ n: count() })
      .from(intelDscanLookups)
      .where(and(eq(intelDscanLookups.userId, userId), gt(intelDscanLookups.createdAt, new Date(now.getTime() - DSCAN_LOOKUP_WINDOW_MS))));
    if ((recent?.n ?? 0) >= DSCAN_LOOKUP_LIMIT) return false;
    await tx.insert(intelDscanLookups).values({ userId, createdAt: now });
    return true;
  });
}

/**
 * Ships on a pasted d-scan (pods left out), with their groups. Types we don't
 * know yet are looked up on ESI within limits (per paste, per user, and the
 * shared error budget); a paste of made-up ids must not pause ESI for everyone.
 * Ships that stay unresolved are left out.
 */
export async function dscanShips(
  text: string,
  opts: { userId: string; now?: Date; db?: Db },
): Promise<{ ships: DscanEntry[]; objects: number; lines: number }> {
  const db = opts.db ?? getDb();
  const { entries, lines } = countDscan(text);
  if (!entries.length) return { ships: [], objects: 0, lines };
  const ids = entries.map((e) => e.typeId);
  const load = () =>
    db
      .select({ id: eveTypes.typeId, groupId: eveTypes.groupId, name: eveTypes.name })
      .from(eveTypes)
      .innerJoin(eveGroups, eq(eveGroups.groupId, eveTypes.groupId))
      .where(and(inArray(eveTypes.typeId, ids), eq(eveGroups.categoryId, SHIP_CATEGORY)));
  let ships = await load();
  if (!env().KEYSTAR_DEMO_MODE) {
    const knownAll = await db.select({ id: eveTypes.typeId }).from(eveTypes).where(inArray(eveTypes.typeId, ids));
    const known = new Set(knownAll.map((k) => k.id));
    // Entries come most common first, so the cap keeps the types that matter most.
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length && (await reserveDscanLookup(opts.userId, opts.now, db))) {
      await ensureTypes(unknown, { maxLookups: DSCAN_MAX_LOOKUPS, errorHeadroom: DSCAN_ERROR_HEADROOM });
      ships = await load();
    }
  }
  const byId = new Map(ships.map((s) => [s.id, s]));
  const out = entries
    .filter((e) => byId.has(e.typeId) && byId.get(e.typeId)!.groupId !== SHIP_GROUPS.capsule)
    .map((e) => ({ typeId: e.typeId, name: byId.get(e.typeId)!.name, count: e.count, groupId: byId.get(e.typeId)!.groupId }));
  return { ships: out, objects: entries.reduce((s, e) => s + e.count, 0), lines };
}

export interface DscanPilot {
  characterId: number;
  name: string;
  standing: Standing;
  profile: PilotProfile | null;
}

export interface DscanCandidate {
  characterId: number;
  evidence: number;
  exact: boolean;
  lastAt: string | null;
  uses: number;
}

export interface DscanMatchRow {
  typeId: number;
  name: string;
  count: number;
  cls: HullClass;
  candidates: DscanCandidate[];
  /** Pilots assigned to this hull, at most `count`. */
  assigned: { characterId: number; confidence: "likely" | "possible" | "guess" }[];
}

export function confidenceOf(c: DscanCandidate, now: Date): "likely" | "possible" | "guess" {
  if (!c.exact) return "guess";
  return c.lastAt && now.getTime() - Date.parse(c.lastAt) <= 7 * DAY_MS ? "likely" : "possible";
}

export function matchDscan(entries: DscanEntry[], pilots: DscanPilot[], now: Date): DscanMatchRow[] {
  const hostile = pilots.filter((p) => p.profile && p.standing.cls !== "own" && p.standing.cls !== "blue");
  const rows: DscanMatchRow[] = entries.map((e) => {
    const cls = hullClass(e.groupId ?? null);
    const candidates: DscanCandidate[] = [];
    for (const p of hostile) {
      const hulls = p.profile!.hulls;
      const exact = hulls.find((h) => h.shipTypeId === e.typeId);
      if (exact) {
        candidates.push({ characterId: p.characterId, evidence: exact.weight, exact: true, lastAt: exact.lastAt, uses: exact.count });
        continue;
      }
      if (cls === "other") continue;
      const same = hulls.filter((h) => hullClass(h.groupId) === cls);
      const weight = same.reduce((s, h) => s + h.weight, 0) * CLASS_FACTOR;
      if (weight >= MIN_EVIDENCE) {
        const lastAt = same.map((h) => h.lastAt).filter((t): t is string => !!t).sort().at(-1) ?? null;
        candidates.push({ characterId: p.characterId, evidence: weight, exact: false, lastAt, uses: same.reduce((s, h) => s + h.count, 0) });
      }
    }
    candidates.sort((a, b) => Number(b.exact) - Number(a.exact) || b.evidence - a.evidence);
    return { typeId: e.typeId, name: e.name, count: e.count, cls, candidates: candidates.slice(0, 6), assigned: [] };
  });

  // Greedy: strongest evidence first, each pilot flies one hull, each hull has `count` pilots.
  const pairs = rows.flatMap((row, i) => row.candidates.map((c) => ({ i, c })));
  pairs.sort((a, b) => Number(b.c.exact) - Number(a.c.exact) || b.c.evidence - a.c.evidence);
  const taken = new Set<number>();
  for (const { i, c } of pairs) {
    const row = rows[i];
    if (taken.has(c.characterId) || row.assigned.length >= row.count || c.evidence < MIN_EVIDENCE) continue;
    row.assigned.push({ characterId: c.characterId, confidence: confidenceOf(c, now) });
    taken.add(c.characterId);
  }
  return rows;
}
