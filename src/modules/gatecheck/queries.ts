import "server-only";
import { and, eq, gte, inArray, isNotNull, min, sql } from "drizzle-orm";
import { eveConstellations, eveEntities, eveSystems, eveTypes, gatecheckFeed, gatecheckKills, getDb, type Db } from "@/core/db";
import type { FeedStatus, KillRecord } from "./check";

const KILL_COLUMNS = {
  killmailId: gatecheckKills.killmailId,
  killmailTime: gatecheckKills.killmailTime,
  solarSystemId: gatecheckKills.solarSystemId,
  gateId: gatecheckKills.gateId,
  gateDistanceM: gatecheckKills.gateDistanceM,
  victimCharacterId: gatecheckKills.victimCharacterId,
  victimCorporationId: gatecheckKills.victimCorporationId,
  victimAllianceId: gatecheckKills.victimAllianceId,
  victimShipTypeId: gatecheckKills.victimShipTypeId,
  totalValue: gatecheckKills.totalValue,
  attackerCount: gatecheckKills.attackerCount,
  attackerCharacterIds: gatecheckKills.attackerCharacterIds,
  attackerCorporationIds: gatecheckKills.attackerCorporationIds,
  attackerAllianceIds: gatecheckKills.attackerAllianceIds,
  attackerShipTypeIds: gatecheckKills.attackerShipTypeIds,
  attackerWeaponTypeIds: gatecheckKills.attackerWeaponTypeIds,
  npc: gatecheckKills.npc,
  concord: gatecheckKills.concord,
};

/** Safety cap on history rows per check (the busiest pipes see a few thousand kills a month). */
const MAX_HISTORY_ROWS = 50_000;

export async function loadFeedStatus(db: Db = getDb()): Promise<FeedStatus & { lastKillmailAt: Date | null; historySince: Date | null }> {
  const [[feed], [oldest]] = await Promise.all([
    db.select().from(gatecheckFeed).where(eq(gatecheckFeed.id, 1)),
    db
      .select({ t: min(gatecheckKills.killmailTime) })
      .from(gatecheckKills)
      .where(isNotNull(gatecheckKills.gateId)),
  ]);
  return {
    coverageSince: feed?.coverageSince ?? null,
    caughtUpAt: feed?.caughtUpAt ?? null,
    lastKillmailAt: feed?.lastKillmailAt ?? null,
    historySince: oldest?.t ?? null,
  };
}

/** Every stored kill in these systems since `since`. */
export function killsInSystems(systemIds: number[], since: Date, db: Db = getDb()): Promise<KillRecord[]> {
  if (!systemIds.length) return Promise.resolve([]);
  return db
    .select(KILL_COLUMNS)
    .from(gatecheckKills)
    .where(and(inArray(gatecheckKills.solarSystemId, systemIds), gte(gatecheckKills.killmailTime, since)));
}

/** Kills at these gates since `since`: the history camp estimates are built from. */
export function killsAtGates(systemIds: number[], gateIds: number[], since: Date, db: Db = getDb()): Promise<KillRecord[]> {
  if (!systemIds.length || !gateIds.length) return Promise.resolve([]);
  return db
    .select(KILL_COLUMNS)
    .from(gatecheckKills)
    .where(
      and(
        inArray(gatecheckKills.solarSystemId, systemIds),
        inArray(gatecheckKills.gateId, gateIds),
        gte(gatecheckKills.killmailTime, since),
      ),
    )
    .limit(MAX_HISTORY_ROWS);
}

/** Kills anywhere with any of these pilots among the attackers, since `since`. */
export function killsByPilots(characterIds: number[], since: Date, db: Db = getDb()): Promise<KillRecord[]> {
  if (!characterIds.length) return Promise.resolve([]);
  const ids = sql`ARRAY[${sql.join(
    characterIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::bigint[]`;
  return db
    .select(KILL_COLUMNS)
    .from(gatecheckKills)
    .where(and(gte(gatecheckKills.killmailTime, since), sql`${gatecheckKills.attackerCharacterIds} && ${ids}`));
}

/** Inventory group per type, for the tags (types not named yet are missing). */
export async function typeGroups(typeIds: Iterable<number>, db: Db = getDb()): Promise<Map<number, number>> {
  const ids = [...new Set([...typeIds].filter((id) => id > 0))];
  if (!ids.length) return new Map();
  const rows = await db.select({ id: eveTypes.typeId, groupId: eveTypes.groupId }).from(eveTypes).where(inArray(eveTypes.typeId, ids));
  return new Map(rows.map((r) => [r.id, r.groupId]));
}

/** Region names of systems, where the universe job has filed them. */
export async function systemRegions(systemIds: number[], db: Db = getDb()): Promise<Map<number, string>> {
  if (!systemIds.length) return new Map();
  const rows = await db
    .select({ id: eveSystems.systemId, region: eveEntities.name })
    .from(eveSystems)
    .innerJoin(eveConstellations, eq(eveConstellations.constellationId, eveSystems.constellationId))
    .innerJoin(eveEntities, eq(eveEntities.id, eveConstellations.regionId))
    .where(inArray(eveSystems.systemId, systemIds));
  return new Map(rows.map((r) => [r.id, r.region]));
}
