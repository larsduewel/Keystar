import { and, eq, gte, sql } from "drizzle-orm";
import {
  miningActivity,
  miningActivityCoverage,
  miningCharacterLedger,
  miningObserverLedger,
  miningObservers,
  type Db,
} from "@/core/db";
import { forgetCharacterEsiCache } from "@/core/esi";
import { ensureNames, ensureSystems, ensureTypes } from "@/core/eve/resolver";
import type { JobDefinition, PriceInterestProvider } from "@/core/sync/types";
import { addDays, isoDate } from "@/lib/dates";
import { observationTime, planActivity } from "./activity";
import { dedupeCharacterLedger, dedupeObserverLedger } from "./dedupe";
import { MINING_LEDGER_SCOPE } from "./module";

interface CharacterMiningEntry {
  date: string;
  quantity: number;
  solar_system_id: number;
  type_id: number;
}

interface Observer {
  last_updated: string;
  observer_id: number;
  observer_type: string;
}

interface ObserverEntry {
  character_id: number;
  last_updated: string;
  quantity: number;
  recorded_corporation_id: number;
  type_id: number;
}

const CHUNK = 1000;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Whether the character's token currently shares its mining ledger; `lock` share-locks the token row. A revoked token
 * still counts: its run fails at the token refresh and says so, instead of reporting the ledger as switched off.
 */
async function sharesLedger(db: Db | Tx, characterId: number, lock = false): Promise<boolean> {
  const [token] = await db.execute<{ scopes: string[] }>(
    sql`SELECT scopes FROM esi_tokens WHERE character_id = ${characterId}${lock ? sql` FOR SHARE` : sql``}`,
  );
  return Boolean(token?.scopes.includes(MINING_LEDGER_SCOPE));
}

export const characterLedgerJob: JobDefinition = {
  key: "mining.character-ledger",
  label: (t) => t.mining.module.jobs.characterLedger,
  module: "mining",
  owner: "character",
  requiredScopes: [MINING_LEDGER_SCOPE],
  intervalSeconds: 900,
  async run({ esi, db, characterId }) {
    // Switching the ledger off promises to stop reading at once; the planner only disables this schedule on its next pass.
    if (!(await sharesLedger(db, characterId!))) return { summary: "Mining ledger is switched off" };
    const res = await esi.getAllPages<CharacterMiningEntry>(`/characters/${characterId}/mining`, {
      characterId: characterId!,
    });
    const rows = dedupeCharacterLedger(
      res.data.map((e) => ({
        characterId: characterId!,
        date: e.date,
        solarSystemId: e.solar_system_id,
        typeId: e.type_id,
        quantity: e.quantity,
        updatedAt: new Date(),
      })),
    );
    // A snapshot served from Keystar's own cache was already applied by the run that fetched it (or will be by the
    // next one, if that run failed): writing it again could only hide growth from the activity measurement.
    if (res.fromCache) return { summary: `${rows.length} ledger entries (cached)`, nextRunAt: res.expiresAt };
    const observedAt = observationTime(res.lastModified, new Date());
    let windows = 0;
    let stale = false;
    let switchedOff = false;

    await db.transaction(async (tx) => {
      // Switching the ledger off, then deleting the stored entries, must stay that way: the share lock makes those
      // actions wait for this write, or this write see the switched-off token. Taken first, before the coverage row.
      if (!(await sharesLedger(tx, characterId!, true))) {
        switchedOff = true;
        // The response was cached on its way in, possibly after a delete cleared the cache: a run after switching back
        // on would take it as already applied and write nothing.
        await forgetCharacterEsiCache(tx, characterId!, `/characters/${characterId}/mining`);
        return;
      }
      // Growth is measured against the stored ledger, so read it before the upsert.
      const recentFrom = addDays(isoDate(observedAt), -2);
      const [coverage] = await tx
        .select()
        .from(miningActivityCoverage)
        .where(eq(miningActivityCoverage.characterId, characterId!))
        .for("update");
      const before = coverage
        ? await tx
            .select({
              date: miningCharacterLedger.date,
              solarSystemId: miningCharacterLedger.solarSystemId,
              typeId: miningCharacterLedger.typeId,
              quantity: miningCharacterLedger.quantity,
            })
            .from(miningCharacterLedger)
            .where(and(eq(miningCharacterLedger.characterId, characterId!), gte(miningCharacterLedger.date, recentFrom)))
        : [];
      const plan = planActivity({
        before,
        after: rows.filter((r) => r.date >= recentFrom),
        coverage: coverage ?? null,
        observedAt,
      });
      // Not newer than what is stored: don't roll the ledger back to an older snapshot.
      if (!plan) {
        stale = true;
        return;
      }

      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx
          .insert(miningCharacterLedger)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: [
              miningCharacterLedger.characterId,
              miningCharacterLedger.date,
              miningCharacterLedger.solarSystemId,
              miningCharacterLedger.typeId,
            ],
            set: { quantity: sql`excluded.quantity`, updatedAt: sql`excluded.updated_at` },
            setWhere: sql`${miningCharacterLedger.quantity} IS DISTINCT FROM excluded.quantity`,
          });
      }

      if (plan.window) {
        const window = plan.window;
        await tx
          .insert(miningActivity)
          .values(
            plan.deltas.map((d) => ({
              characterId: characterId!,
              windowStart: window.start,
              windowEnd: window.end,
              date: d.date,
              typeId: d.typeId,
              quantity: d.quantity,
            })),
          )
          .onConflictDoNothing();
        windows = 1;
      }
      await tx
        .insert(miningActivityCoverage)
        .values({ characterId: characterId!, ...plan.coverage })
        .onConflictDoUpdate({
          target: miningActivityCoverage.characterId,
          set: { lastObservedAt: plan.coverage.lastObservedAt, lastGrowthAt: plan.coverage.lastGrowthAt },
        });
    });

    if (switchedOff) return { summary: "Mining ledger was switched off during the sync" };
    await ensureTypes(rows.map((r) => r.typeId));
    await ensureSystems(rows.map((r) => r.solarSystemId));
    return {
      summary: `${rows.length} ledger entries${stale ? " (older snapshot, skipped)" : res.notModified ? " (unchanged)" : ""}${
        windows ? ", mining activity recorded" : ""
      }`,
      nextRunAt: res.expiresAt,
    };
  },
};

export const corporationObserversJob: JobDefinition = {
  key: "mining.corporation-observers",
  label: (t) => t.mining.module.jobs.observers,
  module: "mining",
  owner: "corporation",
  requiredScopes: ["esi-industry.read_corporation_mining.v1"],
  preferredCorpRoles: ["Accountant"],
  intervalSeconds: 3600,
  async run({ esi, db, ownerId, characterId }) {
    const corporationId = ownerId;
    const observers = await esi.getAllPages<Observer>(`/corporation/${corporationId}/mining/observers`, {
      characterId: characterId!,
    });

    for (const o of observers.data) {
      await db
        .insert(miningObservers)
        .values({
          observerId: o.observer_id,
          corporationId,
          observerType: o.observer_type,
          lastUpdated: o.last_updated,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: miningObservers.observerId,
          set: { lastUpdated: o.last_updated, corporationId, updatedAt: new Date() },
        });
    }

    let entries = 0;
    const characterIds = new Set<number>();
    const typeIds = new Set<number>();
    for (const o of observers.data) {
      const ledger = await esi.getAllPages<ObserverEntry>(
        `/corporation/${corporationId}/mining/observers/${o.observer_id}`,
        { characterId: characterId! },
      );
      const rows = dedupeObserverLedger(
        ledger.data.map((e) => {
          characterIds.add(e.character_id);
          characterIds.add(e.recorded_corporation_id);
          typeIds.add(e.type_id);
          return {
            observerId: o.observer_id,
            corporationId,
            characterId: e.character_id,
            recordedCorporationId: e.recorded_corporation_id,
            date: e.last_updated,
            typeId: e.type_id,
            quantity: e.quantity,
            updatedAt: new Date(),
          };
        }),
      );
      entries += rows.length;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db
          .insert(miningObserverLedger)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: [
              miningObserverLedger.observerId,
              miningObserverLedger.characterId,
              miningObserverLedger.date,
              miningObserverLedger.typeId,
            ],
            set: {
              quantity: sql`excluded.quantity`,
              recordedCorporationId: sql`excluded.recorded_corporation_id`,
              updatedAt: sql`excluded.updated_at`,
            },
            setWhere: sql`${miningObserverLedger.quantity} IS DISTINCT FROM excluded.quantity`,
          });
      }
    }
    await ensureTypes(typeIds);
    await ensureNames(characterIds);
    return { summary: `${observers.data.length} observers, ${entries} entries`, nextRunAt: observers.expiresAt };
  },
};

/** Names and locations of refineries, so observers are not just numeric ids. */
export const corporationStructuresJob: JobDefinition = {
  key: "mining.corporation-structures",
  label: (t) => t.mining.module.jobs.structures,
  module: "mining",
  owner: "corporation",
  requiredScopes: ["esi-corporations.read_structures.v1"],
  preferredCorpRoles: ["Station_Manager"],
  intervalSeconds: 6 * 3600,
  async run({ esi, db, ownerId, characterId }) {
    // A 403 here makes the scheduler retry with another character's token.
    const structures = await esi.getAllPages<{ structure_id: number; name?: string; system_id: number; type_id: number }>(
      `/corporations/${ownerId}/structures`,
      { characterId: characterId! },
    );
    let named = 0;
    for (const s of structures.data) {
      const updated = await db
        .update(miningObservers)
        .set({ name: s.name ?? null, solarSystemId: s.system_id, structureTypeId: s.type_id, updatedAt: new Date() })
        .where(sql`${miningObservers.observerId} = ${s.structure_id}`)
        .returning({ id: miningObservers.observerId });
      named += updated.length;
    }
    await ensureSystems(structures.data.map((s) => s.system_id));
    return { summary: `${structures.data.length} structures, ${named} observers named`, nextRunAt: structures.expiresAt };
  },
};

export const miningPriceInterest: PriceInterestProvider = async (db) => {
  const rows = await db.execute<{ type_id: number }>(sql`
    SELECT DISTINCT type_id FROM mining_character_ledger
    UNION SELECT DISTINCT type_id FROM mining_observer_ledger`);
  return rows.map((r) => Number(r.type_id));
};

export const miningJobs: JobDefinition[] = [characterLedgerJob, corporationObserversJob, corporationStructuresJob];
