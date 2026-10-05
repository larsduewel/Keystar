import { and, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import {
  characterCorpRoles,
  characters,
  corporationMembers,
  esiCache,
  eveConstellations,
  eveSystems,
  workerHeartbeats,
} from "@/core/db";
import { purgeExpiredSessions } from "@/core/auth/session";
import { fetchAffiliations } from "@/core/eve/affiliation";
import { recentPriceInterest, syncPrices } from "@/core/eve/prices";
import { ensureConstellations, ensureNames, ensureSystems, refreshCorporations } from "@/core/eve/resolver";
import { isListedSystem } from "@/core/eve/systems";
import { setSetting } from "@/core/settings";
import { trackedCorporations } from "./scheduler";
import type { JobDefinition, PriceInterestProvider } from "./types";

export const serverStatusJob: JobDefinition = {
  key: "core.server-status",
  label: (t) => t.core.jobs.serverStatus,
  module: "core",
  owner: "global",
  intervalSeconds: 300,
  async run({ esi }) {
    const res = await esi.get<{ players: number; server_version: string; start_time: string }>("/status");
    await setSetting("eve.serverStatus", {
      players: res.data.players,
      serverVersion: res.data.server_version,
      startTime: res.data.start_time,
      checkedAt: new Date().toISOString(),
    });
    return { summary: `${res.data.players.toLocaleString("en-US")} pilots online`, nextRunAt: res.expiresAt };
  },
};

export const affiliationsJob: JobDefinition = {
  key: "core.affiliations",
  label: (t) => t.core.jobs.affiliations,
  module: "core",
  owner: "global",
  intervalSeconds: 3600,
  async run({ esi, db }) {
    const rows = await db.select({ id: characters.characterId }).from(characters);
    const ids = rows.map((r) => r.id);
    let changed = 0;
    const corpIds = new Set<number>(await trackedCorporations());
    const allianceIds = new Set<number>();
    for (const a of await fetchAffiliations(esi, ids)) {
      corpIds.add(a.corporationId);
      if (a.allianceId) allianceIds.add(a.allianceId);
      const updated = await db
        .update(characters)
        .set({
          corporationId: a.corporationId,
          allianceId: a.allianceId,
          affiliationUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          sql`${characters.characterId} = ${a.characterId} AND (${characters.corporationId} <> ${a.corporationId} OR ${characters.allianceId} IS DISTINCT FROM ${a.allianceId})`,
        )
        .returning({ id: characters.characterId });
      changed += updated.length;
    }
    await refreshCorporations(corpIds);
    await ensureNames([...corpIds, ...allianceIds]);
    return { summary: `${ids.length} characters checked, ${changed} changed corporation` };
  },
};

export const characterRolesJob: JobDefinition = {
  key: "core.character-roles",
  label: (t) => t.core.jobs.characterRoles,
  module: "core",
  owner: "character",
  requiredScopes: ["esi-characters.read_corporation_roles.v1"],
  intervalSeconds: 3600,
  async run({ esi, db, characterId }) {
    const res = await esi.get<{ roles?: string[] }>(`/characters/${characterId}/roles`, { characterId: characterId! });
    const roles = res.data.roles ?? [];
    await db
      .insert(characterCorpRoles)
      .values({ characterId: characterId!, roles, updatedAt: new Date() })
      .onConflictDoUpdate({ target: characterCorpRoles.characterId, set: { roles, updatedAt: new Date() } });
    return { summary: roles.length ? roles.join(", ") : "No corporation roles", nextRunAt: res.expiresAt };
  },
};

export const corporationMembersJob: JobDefinition = {
  key: "core.corporation-members",
  label: (t) => t.core.jobs.corporationMembers,
  module: "core",
  owner: "corporation",
  requiredScopes: ["esi-corporations.read_corporation_membership.v1"],
  intervalSeconds: 3600,
  async run({ esi, db, ownerId, characterId }) {
    const res = await esi.get<number[]>(`/corporations/${ownerId}/members`, { characterId: characterId! });
    // Applied on every run, also when ESI answers "not modified": the cache entry is written before this write, so a
    // run whose write failed would otherwise leave the roster stale until the member list changes. As a diff, an
    // unchanged roster writes nothing.
    await db.transaction(async (tx) => {
      await tx
        .delete(corporationMembers)
        .where(
          res.data.length
            ? and(eq(corporationMembers.corporationId, ownerId), notInArray(corporationMembers.characterId, res.data))
            : eq(corporationMembers.corporationId, ownerId),
        );
      if (res.data.length) {
        await tx
          .insert(corporationMembers)
          .values(res.data.map((id) => ({ corporationId: ownerId, characterId: id, updatedAt: new Date() })))
          .onConflictDoNothing();
      }
    });
    await ensureNames(res.data);
    return { summary: `${res.data.length} members`, nextRunAt: res.expiresAt };
  },
};

export function marketPricesJob(providers: PriceInterestProvider[]): JobDefinition {
  return {
    key: "core.market-prices",
    label: (t) => t.core.jobs.marketPrices,
    module: "core",
    owner: "global",
    intervalSeconds: 3600,
    async run({ esi, db }) {
      const ids = new Set<number>();
      for (const provider of providers) for (const id of await provider(db)) ids.add(id);
      // Types appraised or estimated recently stay fresh too; older ones are priced again on demand.
      for (const id of await recentPriceInterest(db)) ids.add(id);
      const result = await syncPrices(db, esi, [...ids]);
      // What was priced is written; failing the run makes the scheduler wait for the limit to lift.
      if (result.rateLimited) throw result.rateLimited;
      return { summary: result.summary };
    },
  };
}

/** Systems and constellations fetched per run while the list fills; the first load spreads over about half an hour. */
const SYSTEMS_PER_RUN = 500;
const CONSTELLATIONS_PER_RUN = 300;
/** New systems are rare (a handful per decade); unknown names are still looked up on demand. */
const SYSTEMS_RECHECK_MS = 30 * 24 * 3600 * 1000;
/** A run that resolved nothing (ESI trouble) waits this long before the next try. */
const SYSTEMS_STALLED_MS = 6 * 3600 * 1000;

/** Every known-space and wormhole system with its region, so the system picker can offer them all. */
export const universeSystemsJob: JobDefinition = {
  key: "core.universe-systems",
  label: (t) => t.core.jobs.universeSystems,
  module: "core",
  owner: "global",
  // A floor only: while anything is missing the job runs again a minute later, then nextRunAt spaces it out.
  intervalSeconds: 60,
  async run({ esi, db }) {
    const res = await esi.get<number[]>("/universe/systems");
    const listed = res.data.filter(isListedSystem);
    const known = new Set((await db.select({ id: eveSystems.systemId }).from(eveSystems)).map((r) => r.id));
    const missingSystems = listed.filter((id) => !known.has(id));
    const systemBatch = missingSystems.slice(0, SYSTEMS_PER_RUN);
    await ensureSystems(systemBatch);

    // Constellations carry the region; ensureConstellations also names new regions.
    const missingConstellations = await db
      .selectDistinct({ id: eveSystems.constellationId })
      .from(eveSystems)
      .leftJoin(eveConstellations, eq(eveConstellations.constellationId, eveSystems.constellationId))
      .where(and(isNotNull(eveSystems.constellationId), isNull(eveConstellations.constellationId)))
      .then((rows) => rows.map((r) => r.id!));
    const constellationBatch = missingConstellations.slice(0, CONSTELLATIONS_PER_RUN);
    await ensureConstellations(constellationBatch);
    // Region names an earlier run could not fetch; known names are skipped.
    await ensureNames((await db.selectDistinct({ id: eveConstellations.regionId }).from(eveConstellations)).map((r) => r.id));

    const systems = systemBatch.length ? await db.$count(eveSystems, inArray(eveSystems.systemId, systemBatch)) : 0;
    const constellations = constellationBatch.length
      ? await db.$count(eveConstellations, inArray(eveConstellations.constellationId, constellationBatch))
      : 0;
    if (!missingSystems.length && !missingConstellations.length) {
      return { summary: `All ${listed.length} systems known`, nextRunAt: new Date(Date.now() + SYSTEMS_RECHECK_MS) };
    }
    return {
      summary:
        `Loaded ${systems} systems (${missingSystems.length - systems} remaining), ` +
        `${constellations} constellations (${missingConstellations.length - constellations} remaining)`,
      nextRunAt: systems + constellations === 0 ? new Date(Date.now() + SYSTEMS_STALLED_MS) : null,
    };
  },
};

export const housekeepingJob: JobDefinition = {
  key: "core.housekeeping",
  label: (t) => t.core.jobs.housekeeping,
  module: "core",
  owner: "global",
  intervalSeconds: 6 * 3600,
  async run({ db }) {
    const sessions = await purgeExpiredSessions();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    // Responses without an Expires header have no expiry to go by; their last write stands in.
    const cache = await db
      .delete(esiCache)
      .where(or(lt(esiCache.expiresAt, weekAgo), and(isNull(esiCache.expiresAt), lt(esiCache.updatedAt, weekAgo))))
      .returning({ key: esiCache.key });
    await db.delete(workerHeartbeats).where(lt(workerHeartbeats.lastBeatAt, new Date(Date.now() - 24 * 3600 * 1000)));
    return { summary: `Purged ${sessions} sessions, ${cache.length} cache entries` };
  },
};
