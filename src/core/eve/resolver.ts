import { inArray, sql } from "drizzle-orm";
import { eveConstellations, eveCorporations, eveEntities, eveGroups, eveSystems, eveTypes, getDb } from "@/core/db";
import { EsiError, getEsi } from "@/core/esi";
import { createLogger } from "@/core/logger";
import { classifyOre } from "@/core/eve/ore";
import { mapLimit } from "@/lib/concurrency";

/**
 * Resolves EVE ids into cached names/static data on demand. Sync jobs call
 * these after storing new data so the UI never has to talk to ESI.
 */
const log = createLogger("resolver");

function unique(ids: Iterable<number>): number[] {
  return [...new Set([...ids].filter((n) => Number.isSafeInteger(n) && n > 0))];
}

/** Names for characters/corporations/alliances/systems/types via POST /universe/names. */
export async function ensureNames(ids: Iterable<number>): Promise<void> {
  const wanted = unique(ids);
  if (!wanted.length) return;
  const db = getDb();
  const known = await db.select({ id: eveEntities.id }).from(eveEntities).where(inArray(eveEntities.id, wanted));
  const knownSet = new Set(known.map((r) => r.id));
  const missing = wanted.filter((id) => !knownSet.has(id));
  for (let i = 0; i < missing.length; i += 1000) {
    const chunk = missing.slice(i, i + 1000);
    try {
      const res = await getEsi().post<{ id: number; name: string; category: string }[]>("/universe/names", chunk);
      if (res.data.length) {
        await db
          .insert(eveEntities)
          .values(res.data.map((e) => ({ id: e.id, name: e.name, category: e.category })))
          .onConflictDoUpdate({
            target: eveEntities.id,
            set: { name: sql`excluded.name`, category: sql`excluded.category`, updatedAt: new Date() },
          });
      }
    } catch (err) {
      // /universe/names answers 404 for the whole batch if a single id is invalid; bisect to find it.
      // Anything else (outage, timeout, rate limit) would only multiply failing requests, so let the job fail.
      if (!(err instanceof EsiError) || err.status !== 404) throw err;
      if (chunk.length > 1) {
        const mid = Math.ceil(chunk.length / 2);
        await ensureNames(chunk.slice(0, mid));
        await ensureNames(chunk.slice(mid));
      } else {
        log.warn("Could not resolve id", { id: chunk[0], error: (err as Error).message });
      }
    }
  }
}

export async function ensureGroups(groupIds: Iterable<number>): Promise<void> {
  const wanted = unique(groupIds);
  if (!wanted.length) return;
  const db = getDb();
  const known = await db.select({ id: eveGroups.groupId }).from(eveGroups).where(inArray(eveGroups.groupId, wanted));
  const knownSet = new Set(known.map((r) => r.id));
  const missing = wanted.filter((id) => !knownSet.has(id));
  await mapLimit(missing, 4, async (groupId) => {
    const res = await getEsi().get<{ group_id: number; name: string; category_id: number; types: number[] }>(
      `/universe/groups/${groupId}`,
    );
    await db
      .insert(eveGroups)
      .values({ groupId, name: res.data.name, categoryId: res.data.category_id })
      .onConflictDoNothing();
  });
}

interface EsiType {
  type_id: number;
  name: string;
  group_id: number;
  volume?: number;
  packaged_volume?: number;
  portion_size?: number;
  market_group_id?: number;
  published: boolean;
}

/**
 * Type ids ESI recently answered 404 for, with when to try again. Every 404
 * spends the per-IP error budget that pauses all ESI calls once drained, so
 * pasted junk ids (d-scans, appraisals) are not looked up over and over.
 */
const unknownTypes = new Map<number, number>();
const UNKNOWN_TYPE_TTL_MS = 6 * 3600_000;
const MAX_UNKNOWN_TYPES = 10_000;

function isUnknownType(typeId: number, now: number): boolean {
  const until = unknownTypes.get(typeId);
  if (until === undefined) return false;
  if (until > now) return true;
  unknownTypes.delete(typeId);
  return false;
}

function rememberUnknownType(typeId: number, now: number): void {
  unknownTypes.delete(typeId);
  unknownTypes.set(typeId, now + UNKNOWN_TYPE_TTL_MS);
  // Maps iterate in insertion order: drop the oldest entry.
  if (unknownTypes.size > MAX_UNKNOWN_TYPES) unknownTypes.delete(unknownTypes.keys().next().value!);
}

export interface EnsureTypesOptions {
  /** Look up at most this many types on ESI (the rest stay unresolved). */
  maxLookups?: number;
  /**
   * Stop starting lookups once the shared client reports fewer errors left
   * than this, so user input cannot drain the budget the jobs depend on.
   */
  errorHeadroom?: number;
}

/**
 * Ensures type rows exist (with group/category). For raw ores, ice and gas it
 * also links the "Compressed …" variant from the same group for price fallback.
 */
export async function ensureTypes(typeIds: Iterable<number>, opts: EnsureTypesOptions = {}): Promise<void> {
  const wanted = unique(typeIds);
  if (!wanted.length) return;
  const db = getDb();
  const known = await db.select({ id: eveTypes.typeId }).from(eveTypes).where(inArray(eveTypes.typeId, wanted));
  const knownSet = new Set(known.map((r) => r.id));
  const now = Date.now();
  const missing = wanted.filter((id) => !knownSet.has(id) && !isUnknownType(id, now)).slice(0, opts.maxLookups);
  if (!missing.length) return;

  const fetched: EsiType[] = [];
  const esi = getEsi();
  await mapLimit(missing, 6, async (typeId) => {
    const remain = esi.stats().errorLimitRemain;
    if (opts.errorHeadroom !== undefined && remain !== null && remain < opts.errorHeadroom) return;
    try {
      fetched.push((await esi.get<EsiType>(`/universe/types/${typeId}`)).data);
    } catch (err) {
      if (err instanceof EsiError && err.status === 404) rememberUnknownType(typeId, Date.now());
      log.warn("Could not resolve type", { typeId, error: (err as Error).message });
    }
  });
  if (!fetched.length) return;
  const groupIds = unique(fetched.map((t) => t.group_id));
  await ensureGroups(groupIds);
  await upsertTypes(fetched);
  // Only ores, ice and gas have compressed variants; ships and modules would fetch whole groups for nothing.
  // classifyOre covers gas too, which lives outside the asteroid category.
  const groups = await db
    .select({ groupId: eveGroups.groupId, categoryId: eveGroups.categoryId })
    .from(eveGroups)
    .where(inArray(eveGroups.groupId, groupIds));
  await linkCompressedVariants(groups.filter((g) => classifyOre(g.groupId, g.categoryId) !== "other").map((g) => g.groupId));
}

async function upsertTypes(types: EsiType[]): Promise<void> {
  if (!types.length) return;
  await getDb()
    .insert(eveTypes)
    .values(
      types.map((t) => ({
        typeId: t.type_id,
        name: t.name.trim(),
        groupId: t.group_id,
        volume: t.volume ?? null,
        packagedVolume: t.packaged_volume ?? null,
        portionSize: t.portion_size ?? null,
        marketGroupId: t.market_group_id ?? null,
        published: t.published,
      })),
    )
    .onConflictDoUpdate({
      target: eveTypes.typeId,
      set: {
        name: sql`excluded.name`,
        groupId: sql`excluded.group_id`,
        volume: sql`excluded.volume`,
        packagedVolume: sql`excluded.packaged_volume`,
        portionSize: sql`excluded.portion_size`,
        marketGroupId: sql`excluded.market_group_id`,
        published: sql`excluded.published`,
        updatedAt: new Date(),
      },
    });
}

/** Fetches every type of the given groups once, so "Compressed X" can be matched to "X". */
async function linkCompressedVariants(groupIds: number[]): Promise<void> {
  const db = getDb();
  await mapLimit(groupIds, 2, async (groupId) => {
    const group = await getEsi().get<{ types: number[] }>(`/universe/groups/${groupId}`);
    const existing = await db.select().from(eveTypes).where(inArray(eveTypes.typeId, group.data.types));
    const existingIds = new Set(existing.map((t) => t.typeId));
    const extra: EsiType[] = [];
    await mapLimit(
      group.data.types.filter((id) => !existingIds.has(id)),
      6,
      async (typeId) => {
        try {
          extra.push((await getEsi().get<EsiType>(`/universe/types/${typeId}`)).data);
        } catch {
          // ignore unresolvable variants
        }
      },
    );
    await upsertTypes(extra);
    const all = [...existing.map((t) => ({ id: t.typeId, name: t.name })), ...extra.map((t) => ({ id: t.type_id, name: t.name.trim() }))];
    const byName = new Map(all.map((t) => [t.name.toLowerCase(), t.id]));
    for (const t of all) {
      if (t.name.toLowerCase().startsWith("compressed ")) continue;
      const compressed = byName.get(`compressed ${t.name.toLowerCase()}`);
      if (compressed) {
        await db.update(eveTypes).set({ compressedTypeId: compressed }).where(sql`${eveTypes.typeId} = ${t.id}`);
      }
    }
  });
}

export async function ensureSystems(systemIds: Iterable<number>): Promise<void> {
  const wanted = unique(systemIds);
  if (!wanted.length) return;
  const db = getDb();
  const known = await db.select({ id: eveSystems.systemId }).from(eveSystems).where(inArray(eveSystems.systemId, wanted));
  const knownSet = new Set(known.map((r) => r.id));
  const missing = wanted.filter((id) => !knownSet.has(id));
  await mapLimit(missing, 6, async (systemId) => {
    try {
      const res = await getEsi().get<{ name: string; security_status: number; constellation_id: number }>(
        `/universe/systems/${systemId}`,
      );
      await db
        .insert(eveSystems)
        .values({
          systemId,
          name: res.data.name,
          securityStatus: res.data.security_status,
          constellationId: res.data.constellation_id,
        })
        .onConflictDoNothing();
    } catch (err) {
      log.warn("Could not resolve system", { systemId, error: (err as Error).message });
    }
  });
}

/** Constellation → region for the given systems' constellations; region names go to eve_entities. */
export async function ensureConstellations(constellationIds: Iterable<number>): Promise<void> {
  const wanted = unique(constellationIds);
  if (!wanted.length) return;
  const db = getDb();
  const known = await db
    .select({ id: eveConstellations.constellationId })
    .from(eveConstellations)
    .where(inArray(eveConstellations.constellationId, wanted));
  const knownSet = new Set(known.map((r) => r.id));
  const missing = wanted.filter((id) => !knownSet.has(id));
  const regions = new Set<number>();
  await mapLimit(missing, 6, async (constellationId) => {
    try {
      const res = await getEsi().get<{ name: string; region_id: number }>(`/universe/constellations/${constellationId}`);
      regions.add(res.data.region_id);
      await db
        .insert(eveConstellations)
        .values({ constellationId, name: res.data.name, regionId: res.data.region_id })
        .onConflictDoNothing();
    } catch (err) {
      log.warn("Could not resolve constellation", { constellationId, error: (err as Error).message });
    }
  });
  await ensureNames(regions);
}

interface EsiCorporation {
  name: string;
  ticker: string;
  alliance_id?: number;
  member_count?: number;
}

/** Refreshes public corporation info (always re-fetches; ESI caching keeps it cheap). */
export async function refreshCorporations(corporationIds: Iterable<number>): Promise<void> {
  const wanted = unique(corporationIds);
  const db = getDb();
  await mapLimit(wanted, 4, async (corporationId) => {
    try {
      const res = await getEsi().get<EsiCorporation>(`/corporations/${corporationId}`);
      const values = {
        corporationId,
        name: res.data.name,
        ticker: res.data.ticker,
        allianceId: res.data.alliance_id ?? null,
        memberCount: res.data.member_count ?? null,
        updatedAt: new Date(),
      };
      await db.insert(eveCorporations).values(values).onConflictDoUpdate({ target: eveCorporations.corporationId, set: values });
    } catch (err) {
      log.warn("Could not refresh corporation", { corporationId, error: (err as Error).message });
    }
  });
}
