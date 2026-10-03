import { sql } from "drizzle-orm";
import { killmailAttackers, killmails, type Db } from "@/core/db";
import { env } from "@/core/env";
import { KEYSTAR_VERSION } from "@/core/esi";
import { ensureNames, ensureSystems, ensureTypes } from "@/core/eve/resolver";
import { monthsBetween, toRows, ZkillClient, type ZkillKillmail, type ZkillWindow } from "./zkill";

/** How far back the first import reaches. */
export const BACKFILL_DAYS = 90;
/** The regular sweep re-reads the last 7 days, which also picks up late-arriving killmails. */
const SWEEP_SECONDS = 7 * 24 * 3600;
/** If the last sync is older than this, the sweep would miss killmails: backfill the gap. */
const MAX_SWEEP_GAP_MS = 6 * 24 * 3600 * 1000;
const CHUNK = 500;

let client: ZkillClient | undefined;

export function getZkill(): ZkillClient {
  client ??= new ZkillClient({
    minIntervalMs: 200,
    userAgent: `Keystar/${KEYSTAR_VERSION} (${env().ESI_CONTACT}; +${env().SOURCE_URL})`,
  });
  return client;
}

export interface KillboardSyncState {
  /** Corporation the stored history was backfilled for. */
  corporationId?: number;
  lastSyncAt?: string;
}

export interface SyncPlan {
  mode: "backfill" | "sweep";
  windows: ZkillWindow[];
  /** Ignore killmails older than this (month listings start at the 1st). */
  since: Date;
}

/** Decides what to fetch: a backfill on first run/new corporation/long gap, otherwise a 7-day sweep. */
export function planSync(corporationId: number, state: KillboardSyncState, now: Date): SyncPlan {
  const last = state.lastSyncAt ? new Date(state.lastSyncAt) : null;
  const sameCorp = state.corporationId === corporationId;
  if (sameCorp && last && now.getTime() - last.getTime() <= MAX_SWEEP_GAP_MS) {
    return { mode: "sweep", windows: [{ pastSeconds: SWEEP_SECONDS }], since: new Date(now.getTime() - SWEEP_SECONDS * 1000) };
  }
  const floor = new Date(now.getTime() - BACKFILL_DAYS * 24 * 3600 * 1000);
  // After a gap, re-read from a day before the last sync; otherwise import the full history window.
  const since = sameCorp && last ? new Date(Math.max(floor.getTime(), last.getTime() - 24 * 3600 * 1000)) : floor;
  return { mode: "backfill", windows: monthsBetween(since, now), since };
}

/** Upserts killmails and their attackers; returns how many were new. */
export async function storeKillmails(db: Db, entries: ZkillKillmail[]): Promise<number> {
  let inserted = 0;
  const rows = entries.map(toRows);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await db
      .insert(killmails)
      .values(chunk.map((r) => r.killmail))
      .onConflictDoUpdate({
        target: killmails.killmailId,
        // zKillboard occasionally re-values a killmail; everything else is immutable.
        set: {
          totalValue: sql`excluded.total_value`,
          fittedValue: sql`excluded.fitted_value`,
          destroyedValue: sql`excluded.destroyed_value`,
          droppedValue: sql`excluded.dropped_value`,
          points: sql`excluded.points`,
          labels: sql`excluded.labels`,
          updatedAt: new Date(),
        },
        setWhere: sql`(${killmails.totalValue}, ${killmails.fittedValue}, ${killmails.destroyedValue}, ${killmails.droppedValue}, ${killmails.points}, ${killmails.labels})
          IS DISTINCT FROM (excluded.total_value, excluded.fitted_value, excluded.destroyed_value, excluded.dropped_value, excluded.points, excluded.labels)`,
      })
      .returning({ inserted: sql<boolean>`xmax = 0` });
    inserted += result.filter((r) => r.inserted).length;

    const attackers = chunk.flatMap((r) => r.attackers);
    for (let j = 0; j < attackers.length; j += CHUNK * 2) {
      await db
        .insert(killmailAttackers)
        .values(attackers.slice(j, j + CHUNK * 2))
        .onConflictDoNothing();
    }
  }
  return inserted;
}

/** Names, ship types and systems the dashboard shows for these killmails. */
export async function resolveKillmailNames(corporationId: number, entries: ZkillKillmail[]): Promise<void> {
  const characters = new Set<number>();
  const types = new Set<number>();
  const systems = new Set<number>();
  for (const km of entries) {
    systems.add(km.solar_system_id);
    types.add(km.victim.ship_type_id);
    if (km.victim.character_id) characters.add(km.victim.character_id);
    for (const a of km.attackers) {
      if (a.corporation_id !== corporationId) continue;
      if (a.character_id) characters.add(a.character_id);
      if (a.ship_type_id) types.add(a.ship_type_id);
    }
  }
  await ensureNames(characters);
  await ensureTypes(types);
  await ensureSystems(systems);
}

export interface SyncOutcome {
  mode: SyncPlan["mode"];
  fetched: number;
  inserted: number;
}

/** Pulls killmails for the corporation from zKillboard according to the plan. */
export async function syncCorporationKillmails(
  db: Db,
  corporationId: number,
  plan: SyncPlan,
  deps: {
    zkill?: Pick<ZkillClient, "corporationKillmails">;
    resolve?: typeof resolveKillmailNames;
  } = {},
): Promise<SyncOutcome> {
  const zkill = deps.zkill ?? getZkill();
  const resolve = deps.resolve ?? resolveKillmailNames;
  let fetched = 0;
  let inserted = 0;
  const seen = new Set<number>();
  for (const window of plan.windows) {
    for await (const page of zkill.corporationKillmails(corporationId, window)) {
      const fresh = page.filter((km) => !seen.has(km.killmail_id) && Date.parse(km.killmail_time) >= plan.since.getTime());
      fresh.forEach((km) => seen.add(km.killmail_id));
      if (!fresh.length) continue;
      fetched += fresh.length;
      inserted += await storeKillmails(db, fresh);
      await resolve(corporationId, fresh);
    }
  }
  return { mode: plan.mode, fetched, inserted };
}
