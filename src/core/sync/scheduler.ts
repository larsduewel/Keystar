import { and, eq, sql } from "drizzle-orm";
import { getDb, syncJobs, type Db } from "@/core/db";
import type { SyncOwnerType } from "@/core/db/schema/sync";
import { EsiForbiddenError, EsiRateLimitedError, type EsiClient } from "@/core/esi/client";
import { TokenInvalidError } from "@/core/esi/tokens";
import { createLogger, errorMessage, type Logger } from "@/core/logger";
import { getSetting } from "@/core/settings";
import type { JobDefinition, JobResult } from "./types";

const log = createLogger("scheduler");
const LOCK_MINUTES = 15;
const LEASE_RENEW_MS = 5 * 60 * 1000;

type SyncJobRow = typeof syncJobs.$inferSelect;

export class NoEligibleCharacterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoEligibleCharacterError";
  }
}

function pgTextArray(values: readonly string[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/** Corporations whose corporation-level jobs should run. */
export async function trackedCorporations(): Promise<number[]> {
  const home = await getSetting("corp.homeCorporationId");
  return home ? [home] : [];
}

/**
 * Ensures a schedule row exists for every eligible (job, owner) pair and
 * disables rows whose owner is no longer eligible (token revoked, scope
 * removed, account disabled, character left the corporation, …).
 */
export async function planJobs(jobs: JobDefinition[], db: Db = getDb()): Promise<void> {
  const corps = await trackedCorporations();

  for (const job of jobs) {
    const scopes = job.requiredScopes ?? [];
    let eligible: number[];

    if (job.owner === "global") {
      eligible = [0];
    } else if (job.owner === "character") {
      // A disabled account's characters stay idle until it is enabled again; corporation jobs skip them too.
      const rows = await db.execute<{ id: string }>(sql`
        SELECT t.character_id AS id
        FROM esi_tokens t
        JOIN characters c ON c.character_id = t.character_id
        JOIN users u ON u.id = c.user_id
        WHERE t.status = 'active' AND t.scopes @> ${pgTextArray(scopes)} AND NOT u.is_disabled`);
      eligible = rows.map((r) => Number(r.id));
    } else {
      if (!corps.length) {
        eligible = [];
      } else {
        const rows = await db.execute<{ id: string }>(sql`
          SELECT DISTINCT c.corporation_id AS id
          FROM characters c
          JOIN esi_tokens t ON t.character_id = c.character_id
          JOIN users u ON u.id = c.user_id
          WHERE t.status = 'active' AND t.scopes @> ${pgTextArray(scopes)} AND NOT u.is_disabled
            AND c.corporation_id IN (${sql.join(
              corps.map((c) => sql`${c}`),
              sql`, `,
            )})`);
        eligible = rows.map((r) => Number(r.id));
      }
    }

    if (eligible.length) {
      await db
        .insert(syncJobs)
        .values(eligible.map((ownerId) => ({ jobKey: job.key, ownerType: job.owner, ownerId })))
        .onConflictDoUpdate({
          target: [syncJobs.jobKey, syncJobs.ownerType, syncJobs.ownerId],
          set: { enabled: true, nextRunAt: sql`now()`, updatedAt: sql`now()` },
          setWhere: sql`${syncJobs.enabled} = false`,
        });
    }
    await db.execute(sql`
      UPDATE sync_jobs SET enabled = false, updated_at = now()
      WHERE job_key = ${job.key} AND owner_type = ${job.owner} AND enabled = true
      ${eligible.length ? sql`AND owner_id NOT IN (${sql.join(eligible.map((id) => sql`${id}`), sql`, `)})` : sql``}`);
  }
}

/** Atomically claims up to `limit` due jobs for this worker. */
export async function claimDueJobs(
  workerId: string,
  jobKeys: string[],
  limit: number,
  db: Db = getDb(),
): Promise<SyncJobRow[]> {
  if (limit <= 0 || !jobKeys.length) return [];
  const rows = await db.execute<Record<string, unknown>>(sql`
    UPDATE sync_jobs SET
      locked_until = now() + make_interval(mins => ${LOCK_MINUTES}),
      locked_by = ${workerId},
      last_status = 'running',
      last_run_at = now(),
      updated_at = now()
    WHERE id IN (
      SELECT id FROM sync_jobs
      WHERE enabled = true AND next_run_at <= now()
        AND (locked_until IS NULL OR locked_until < now())
        AND job_key IN (${sql.join(
          jobKeys.map((k) => sql`${k}`),
          sql`, `,
        )})
      ORDER BY next_run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  return db
    .select()
    .from(syncJobs)
    .where(sql`${syncJobs.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
}

/** Characters whose tokens may serve a corporation job, best candidates first; disabled accounts never do. */
export async function corporationCandidates(db: Db, corporationId: number, job: JobDefinition): Promise<number[]> {
  const roles = [...(job.preferredCorpRoles ?? []), "Director"];
  const roleFilter = job.anyCorpMember ? sql`` : sql`AND (r.roles IS NULL OR r.roles && ${pgTextArray(roles)})`;
  const rows = await db.execute<{ id: string }>(sql`
    SELECT c.character_id AS id
    FROM characters c
    JOIN esi_tokens t ON t.character_id = c.character_id
    JOIN users u ON u.id = c.user_id
    LEFT JOIN character_corp_roles r ON r.character_id = c.character_id
    WHERE c.corporation_id = ${corporationId}
      AND t.status = 'active' AND NOT u.is_disabled
      AND t.scopes @> ${pgTextArray(job.requiredScopes ?? [])}
      ${roleFilter}
    ORDER BY COALESCE(r.roles && ${pgTextArray(roles)}, false) DESC, (r.roles IS NOT NULL) DESC,
      t.last_refreshed_at DESC NULLS LAST`);
  return rows.map((r) => Number(r.id));
}

function backoffSeconds(failures: number): number {
  return Math.min(60 * 2 ** Math.max(0, failures - 1), 6 * 3600);
}

/** Runs a claimed job and records the outcome on its schedule row. */
export async function executeJob(
  row: SyncJobRow,
  job: JobDefinition,
  deps: { esi: EsiClient; db?: Db; logger?: Logger },
): Promise<void> {
  const db = deps.db ?? getDb();
  const jobLog = (deps.logger ?? log).child(`${job.key}#${row.ownerId}`);
  const started = Date.now();
  const meta = (row.meta ?? {}) as Record<string, unknown>;

  const runWith = (characterId: number | null) =>
    job.run({
      jobId: row.id,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      characterId,
      esi: deps.esi,
      db,
      log: jobLog,
      meta,
    });

  // Keep the lease alive while the job runs so a slow job is never claimed twice.
  const renewal = setInterval(() => {
    db.update(syncJobs)
      .set({ lockedUntil: sql`now() + make_interval(mins => ${LOCK_MINUTES})` })
      .where(and(eq(syncJobs.id, row.id), eq(syncJobs.lockedBy, row.lockedBy ?? "")))
      .catch((err) => jobLog.warn("Could not renew job lease", { error: errorMessage(err) }));
  }, LEASE_RENEW_MS);

  try {
    let result: JobResult | void;
    let usedCharacter: number | null = null;

    if (row.ownerType === "character") {
      usedCharacter = row.ownerId;
      result = await runWith(row.ownerId);
    } else if (row.ownerType === "corporation") {
      const candidates = await corporationCandidates(db, row.ownerId, job);
      let lastError: unknown;
      result = undefined;
      let succeeded = false;
      for (const candidate of candidates) {
        try {
          result = await runWith(candidate);
          usedCharacter = candidate;
          succeeded = true;
          break;
        } catch (err) {
          if (err instanceof EsiForbiddenError || err instanceof TokenInvalidError) {
            lastError = err;
            jobLog.debug("Candidate rejected", { candidate, error: errorMessage(err) });
            continue;
          }
          throw err;
        }
      }
      if (!succeeded) {
        const who = job.anyCorpMember
          ? "No linked member with the required scopes"
          : `No linked character with ${job.preferredCorpRoles?.join("/") ?? "the required"} role`;
        throw new NoEligibleCharacterError(`${who} could access this data${lastError ? ` (${errorMessage(lastError)})` : ""}`);
      }
    } else {
      result = await runWith(null);
    }

    const minNext = Date.now() + job.intervalSeconds * 1000;
    const next = Math.max(minNext, result?.nextRunAt?.getTime() ?? 0);
    // A trigger that arrived while the job ran (next_run_at moved past the claim) wins over the computed slot.
    const nextRunAt = sql`CASE WHEN ${syncJobs.nextRunAt} > ${syncJobs.lastRunAt} THEN ${syncJobs.nextRunAt} ELSE ${new Date(next).toISOString()}::timestamptz END`;
    await db
      .update(syncJobs)
      .set({
        lastStatus: "ok",
        lastSuccessAt: new Date(),
        lastError: null,
        lastSummary: result?.summary ?? null,
        lastDurationMs: Date.now() - started,
        consecutiveFailures: 0,
        nextRunAt,
        lockedUntil: null,
        lockedBy: null,
        meta: { ...meta, ...(result?.meta ?? {}), ...(usedCharacter ? { characterId: usedCharacter } : {}) },
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, row.id));
    jobLog.debug("Job finished", { ms: Date.now() - started, summary: result?.summary });
  } catch (err) {
    const message = errorMessage(err);
    let nextRunAt: Date;
    let failures = row.consecutiveFailures;
    if (err instanceof EsiRateLimitedError) {
      nextRunAt = new Date(err.retryAt.getTime() + Math.random() * 10_000);
    } else {
      failures += 1;
      nextRunAt = new Date(Date.now() + backoffSeconds(failures) * 1000);
      if (err instanceof TokenInvalidError || err instanceof NoEligibleCharacterError) {
        nextRunAt = new Date(Date.now() + Math.max(3600, backoffSeconds(failures)) * 1000);
      }
    }
    jobLog.warn("Job failed", { error: message, failures });
    await db
      .update(syncJobs)
      .set({
        lastStatus: "error",
        lastError: message.slice(0, 1000),
        lastDurationMs: Date.now() - started,
        consecutiveFailures: failures,
        nextRunAt,
        lockedUntil: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, row.id));
  } finally {
    clearInterval(renewal);
  }
}

/** Queue jobs to run as soon as a worker is free. */
export async function triggerJobs(filter: { id?: number; ownerType?: SyncOwnerType; ownerId?: number; jobKey?: string }) {
  const conditions = [eq(syncJobs.enabled, true)];
  if (filter.id !== undefined) conditions.push(eq(syncJobs.id, filter.id));
  if (filter.ownerType) conditions.push(eq(syncJobs.ownerType, filter.ownerType));
  if (filter.ownerId !== undefined) conditions.push(eq(syncJobs.ownerId, filter.ownerId));
  if (filter.jobKey) conditions.push(eq(syncJobs.jobKey, filter.jobKey));
  return getDb()
    .update(syncJobs)
    .set({ nextRunAt: sql`now()`, updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: syncJobs.id, jobKey: syncJobs.jobKey, ownerType: syncJobs.ownerType, ownerId: syncJobs.ownerId });
}
