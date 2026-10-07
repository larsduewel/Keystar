import { eq, sql } from "drizzle-orm";
import { gatecheckFeed, gatecheckKills, type Db } from "@/core/db";
import { ensureTypes } from "@/core/eve/resolver";
import { createLogger, errorMessage } from "@/core/logger";
import type { ZkillKillmail } from "@/modules/killboard/zkill";
import { toGateKill } from "./classify";
import type { GatecheckKillInsert } from "./schema";
import { getUniverse } from "./universe-data";

const log = createLogger("gatecheck");
const FEED_ROW = 1;
const CHUNK = 500;

/** Rows to store for a batch of killmails from the live feed (known space with stargates only). */
export function gateKillRows(entries: readonly ZkillKillmail[]): GatecheckKillInsert[] {
  const { gates } = getUniverse();
  const rows = new Map<number, GatecheckKillInsert>();
  for (const km of entries) {
    const row = toGateKill(km, gates.get(km.solar_system_id));
    if (row) rows.set(row.killmailId, row);
  }
  return [...rows.values()];
}

export interface FeedProgress {
  /** The reader started over (first run, or its position had expired): coverage starts again. */
  restarted: boolean;
  /** The reader reached the end of the feed in this run. */
  caughtUp: boolean;
}

/**
 * Stores the gate check's share of what the live feed read: every killmail in
 * a system with stargates (each killmail once). Hull and weapon types are
 * named afterwards, so the page can tell smartbombs and interdictors apart;
 * a failure there only costs names, never kills.
 */
export async function recordFeedKillmails(
  db: Db,
  entries: readonly ZkillKillmail[],
  progress: FeedProgress,
  now = new Date(),
): Promise<number> {
  const rows = gateKillRows(entries);
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(gatecheckKills)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }
  await updateFeed(db, rows, progress, now);
  if (rows.length) {
    const types = new Set<number>();
    for (const r of rows) {
      types.add(r.victimShipTypeId);
      for (const t of r.attackerShipTypeIds ?? []) types.add(t);
      for (const t of r.attackerWeaponTypeIds ?? []) types.add(t);
    }
    try {
      await ensureTypes(types, { maxLookups: 200, errorHeadroom: 50 });
    } catch (err) {
      log.warn("Could not name kill types", { error: errorMessage(err) });
    }
  }
  return rows.length;
}

async function updateFeed(db: Db, rows: GatecheckKillInsert[], progress: FeedProgress, now: Date): Promise<void> {
  const newest = rows.reduce<Date | null>((max, r) => (!max || r.killmailTime > max ? r.killmailTime : max), null);
  const [current] = await db.select().from(gatecheckFeed).where(eq(gatecheckFeed.id, FEED_ROW));
  if (!current || progress.restarted) {
    // Coverage starts with the oldest killmail of the first batch read after a (re)start.
    const oldest = rows.reduce<Date | null>((min, r) => (!min || r.killmailTime < min ? r.killmailTime : min), null);
    const since = oldest && oldest < now ? oldest : now;
    await db
      .insert(gatecheckFeed)
      .values({
        id: FEED_ROW,
        coverageSince: since,
        caughtUpAt: progress.caughtUp ? now : null,
        lastKillmailAt: newest,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: gatecheckFeed.id,
        set: {
          coverageSince: since,
          caughtUpAt: progress.caughtUp ? now : null,
          lastKillmailAt: newest,
          updatedAt: now,
        },
      });
    return;
  }
  await db
    .update(gatecheckFeed)
    .set({
      ...(progress.caughtUp ? { caughtUpAt: now } : {}),
      ...(newest
        ? {
            lastKillmailAt: sql`GREATEST(${gatecheckFeed.lastKillmailAt}, ${newest})`,
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(gatecheckFeed.id, FEED_ROW));
}
