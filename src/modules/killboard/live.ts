import { inArray, isNotNull, and } from "drizzle-orm";
import { eveCorporations, eveSystems, getDb, type Db } from "@/core/db";
import { env } from "@/core/env";
import { KEYSTAR_VERSION } from "@/core/esi";
import { ensureConstellations, ensureNames, ensureTypes, refreshCorporations } from "@/core/eve/resolver";
import { getSetting } from "@/core/settings";
import type { JobDefinition } from "@/core/sync/types";
import { errorMessage } from "@/core/logger";
import { recordFeedKillmails } from "@/modules/gatecheck/ingest";
import { resolveKillmailNames, storeKillmails } from "./sync";
import { involvesCorporation, R2z2Client, ZkillError, type ZkillKillmail } from "./zkill";

/** zKillboard asks R2Z2 readers to wait at least 6 seconds after catching up; we wait 10. */
export const LIVE_POLL_SECONDS = 10;
/** Sequence files live for at least 24 hours; past this, jump to the present (the hourly sweep fills the gap). */
const STALE_STATE_MS = 20 * 3600_000;
/** Upper bound per run (about 30 seconds at R2Z2's suggested 10 requests a second). */
const MAX_PER_RUN = 300;
/** After R2Z2 refuses us (403/429), stay away for a while. */
const REFUSED_BACKOFF_MS = 10 * 60_000;
/**
 * Starting over, read this many files back from the pointer (a few hours of New
 * Eden), so the gate check knows recent camps right away instead of an hour later.
 */
export const START_BACKLOG = 2500;
/** Hand killmails to observers (the gate check) in batches of this size. */
const OBSERVE_BATCH = 100;

export interface LiveFeedState {
  /** Corporation the position was kept for (none while no home corporation is set). */
  corporationId?: number;
  /** Next sequence number to read. */
  sequence?: number;
  updatedAt?: string;
}

let client: R2z2Client | undefined;

function getR2z2(): R2z2Client {
  client ??= new R2z2Client({
    userAgent: `Keystar/${KEYSTAR_VERSION} (${env().ESI_CONTACT}; +${env().SOURCE_URL})`,
  });
  return client;
}

/** Where to continue: the stored position, unless it's for another corporation or too old to still exist. */
export function resumeSequence(state: LiveFeedState, corporationId: number | null, now: Date): number | null {
  if ((state.corporationId ?? null) !== corporationId || !Number.isSafeInteger(state.sequence)) return null;
  const updated = state.updatedAt ? Date.parse(state.updatedAt) : NaN;
  if (!Number.isFinite(updated) || now.getTime() - updated > STALE_STATE_MS) return null;
  return state.sequence!;
}

export interface LiveFeedOutcome {
  /** Next sequence number to read; null when not even the starting point could be read. */
  sequence: number | null;
  /** Requests made (sequence files, missing ones included, and pointer reads); capped per run. */
  requests: number;
  scanned: number;
  stored: number;
  caughtUp: boolean;
  /** Started over at the pointer (minus the backlog) instead of resuming. */
  restarted: boolean;
  error: ZkillError | null;
}

/**
 * Sees every killmail the reader reads, in batches (the gate check stores the
 * ones near stargates). `last` marks the final batch of the run.
 */
export type FeedObserver = (killmails: ZkillKillmail[], batch: { first: boolean; last: boolean; restarted: boolean; caughtUp: boolean }) => Promise<void>;

/**
 * Reads R2Z2 forward from the stored position and stores every killmail the
 * corporation is on as soon as it is seen (so the browser can announce it).
 * Every killmail read also goes to `observe`, if given.
 */
export async function readLiveFeed(
  db: Db,
  corporationId: number | null,
  state: LiveFeedState,
  deps: {
    r2z2?: Pick<R2z2Client, "sequence" | "entry">;
    store?: (db: Db, entries: ZkillKillmail[]) => Promise<number>;
    resolve?: (corporationId: number, entries: ZkillKillmail[]) => Promise<void>;
    observe?: FeedObserver;
    /** Files to read back from the pointer when starting over (default 0: start at the pointer). */
    backlog?: number;
    now?: Date;
    maxPerRun?: number;
  } = {},
): Promise<LiveFeedOutcome> {
  const r2z2 = deps.r2z2 ?? getR2z2();
  const store = deps.store ?? storeKillmails;
  const resolve = deps.resolve ?? resolveLiveNames;
  const max = deps.maxPerRun ?? MAX_PER_RUN;

  let sequence = resumeSequence(state, corporationId, deps.now ?? new Date());
  const restarted = sequence === null;
  let requests = 0;
  let scanned = 0;
  let stored = 0;
  let caughtUp = false;
  let error: ZkillError | null = null;
  let pending: ZkillKillmail[] = [];
  let first = true;
  const flush = async (last: boolean) => {
    if (!deps.observe || (!pending.length && !last)) return;
    const batch = pending;
    pending = [];
    await deps.observe(batch, { first, last, restarted, caughtUp });
    first = false;
  };
  try {
    if (sequence === null) {
      requests += 1;
      sequence = Math.max(0, (await r2z2.sequence()) - (deps.backlog ?? 0));
    }
    while (requests < max) {
      requests += 1;
      const res = await r2z2.entry(sequence);
      if (res.kind === "pending") {
        // A missing number below the published pointer is a gap, not the end of the feed.
        requests += 1;
        const head = await r2z2.sequence();
        if (head > sequence) {
          sequence += 1;
          continue;
        }
        caughtUp = true;
        break;
      }
      scanned += 1;
      sequence += 1;
      if (!res.killmail) continue;
      if (corporationId !== null && involvesCorporation(res.killmail, corporationId)) {
        await store(db, [res.killmail]);
        await resolve(corporationId, [res.killmail]);
        stored += 1;
      }
      pending.push(res.killmail);
      if (pending.length >= OBSERVE_BATCH) await flush(false);
    }
  } catch (err) {
    if (!(err instanceof ZkillError)) throw err;
    error = err;
  }
  // Whatever was read before an error still counts: the position moves past it.
  await flush(true);
  return { sequence, requests, scanned, stored, caughtUp, restarted, error };
}

/**
 * Everything a live notification shows: the usual killboard names plus, for
 * losses, the (outside) final-blow pilot and ship, corporation tickers and the
 * system's region.
 */
export async function resolveLiveNames(corporationId: number, entries: ZkillKillmail[]): Promise<void> {
  await resolveKillmailNames(corporationId, entries);
  const characters = new Set<number>();
  const types = new Set<number>();
  const corporations = new Set<number>([corporationId]);
  for (const km of entries) {
    if (km.victim.corporation_id) corporations.add(km.victim.corporation_id);
    const fb = km.attackers.find((a) => a.final_blow);
    if (fb?.character_id) characters.add(fb.character_id);
    if (fb?.ship_type_id) types.add(fb.ship_type_id);
    if (fb?.corporation_id) corporations.add(fb.corporation_id);
  }
  await ensureNames(characters);
  await ensureTypes(types);

  const db = getDb();
  const known = await db
    .select({ id: eveCorporations.corporationId })
    .from(eveCorporations)
    .where(inArray(eveCorporations.corporationId, [...corporations]));
  const knownSet = new Set(known.map((r) => r.id));
  await refreshCorporations([...corporations].filter((id) => !knownSet.has(id)));

  const systems = await db
    .select({ constellationId: eveSystems.constellationId })
    .from(eveSystems)
    .where(and(inArray(eveSystems.systemId, entries.map((km) => km.solar_system_id)), isNotNull(eveSystems.constellationId)));
  await ensureConstellations(systems.map((s) => s.constellationId!));
}

/**
 * Kills and losses of the home corporation within seconds, from zKillboard's
 * live feed (R2Z2). The same read feeds the gate check with every kill near a
 * stargate, so it runs without a home corporation too.
 */
export const liveFeedJob: JobDefinition = {
  key: "killboard.live-feed",
  label: (t) => t.killboard.module.jobs.liveFeed,
  module: "killboard",
  owner: "global",
  intervalSeconds: LIVE_POLL_SECONDS,
  async run({ db, meta, log }) {
    // Demo data is fake; the worker leaves this job out in demo mode, and it never calls zKillboard there itself.
    if (env().KEYSTAR_DEMO_MODE) return { summary: "Demo mode: the live feed is off" };
    const corporationId = (await getSetting("corp.homeCorporationId")) ?? null;
    const state = meta as LiveFeedState;
    let gateKills = 0;
    const out = await readLiveFeed(db, corporationId, state, {
      backlog: START_BACKLOG,
      // Fail the job if a batch cannot be stored, so its sequence is retried.
      observe: async (killmails, batch) => {
        try {
          gateKills += await recordFeedKillmails(db, killmails, { restarted: batch.restarted && batch.first, caughtUp: batch.last && batch.caughtUp });
        } catch (err) {
          log.warn("Gate check could not store killmails", { error: errorMessage(err) });
          throw err;
        }
      },
    });
    const refused = out.error?.status === 403 || out.error?.status === 429;
    // Nothing read at all: report the failure so it shows on the sync page (and backs off).
    // A refusal instead keeps away for the full cooldown, whatever it interrupted.
    if (out.error && !refused && out.scanned === 0) throw out.error;
    const moved = out.sequence !== null && out.sequence !== state.sequence;
    const next: LiveFeedState =
      out.sequence === null
        ? state
        : { ...(corporationId === null ? {} : { corporationId }), sequence: out.sequence, updatedAt: moved ? new Date().toISOString() : state.updatedAt };
    const corp = corporationId === null ? "no home corporation" : `${out.stored} for the corporation`;
    const read = out.sequence === null ? "Read nothing" : `Read ${out.scanned} killmails up to #${out.sequence - 1}, ${corp}, ${gateKills} for the gate check`;
    return {
      summary: out.error ? `${read} (stopped: ${out.error.message}${refused ? "; retrying in 10 minutes" : ""})` : read,
      // Behind: continue right away (the scheduler still waits the interval); refused: stay away for a while.
      nextRunAt: refused ? new Date(Date.now() + REFUSED_BACKOFF_MS) : null,
      meta: { ...next },
    };
  },
};
