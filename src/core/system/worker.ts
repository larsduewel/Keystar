import { sql } from "drizzle-orm";
import { getDb, workerHeartbeats } from "@/core/db";
import type { SyncOwnerType } from "@/core/db/schema/sync";
import type { EsiClientStats } from "@/core/esi/client";
import type { ZkillClientStats } from "@/modules/killboard/zkill";
import type { ProcessRuntime } from "./runtime";

/** What a worker reports in `worker_heartbeats.info` (src/worker/index.ts). Older workers send only the first two. */
export interface HeartbeatInfo {
  running?: number;
  jobs?: number;
  concurrency?: number;
  demo?: boolean;
  runtime?: ProcessRuntime;
  esi?: EsiClientStats | null;
  zkill?: ZkillClientStats | null;
}

export interface WorkerHeartbeat {
  workerId: string;
  version: string | null;
  startedAt: string;
  lastBeatAt: string;
  info: HeartbeatInfo;
}

/** One line per job key and owner type: counts only, no owners. */
export interface JobSummary {
  jobKey: string;
  ownerType: SyncOwnerType;
  enabled: number;
  disabled: number;
  ok: number;
  error: number;
  running: number;
  pending: number;
  skipped: number;
  /** Enabled owners whose last runs failed. */
  failingOwners: number;
  /** Longest run of consecutive failures among enabled owners. */
  maxStreak: number;
  avgMs: number | null;
  maxMs: number | null;
  /** Due for more than 10 minutes and not running. */
  overdue: number;
  /** Locks whose lease ran out without the worker clearing them. */
  staleLocks: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
}

export interface JobError {
  jobKey: string;
  ownerType: SyncOwnerType;
  error: string;
  consecutiveFailures: number;
  lastRunAt: string | null;
}

export interface WorkerInfo {
  heartbeats: WorkerHeartbeat[];
  jobs: JobSummary[];
  /** Last error of every enabled job that is failing, unscrubbed (the package scrubs them). */
  errors: JobError[];
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export async function collectWorker(): Promise<WorkerInfo> {
  const db = getDb();
  const [beats, jobs, errors] = await Promise.all([
    db.select().from(workerHeartbeats),
    db.execute(sql`
      SELECT job_key, owner_type,
             count(*) FILTER (WHERE enabled)::int AS enabled,
             count(*) FILTER (WHERE NOT enabled)::int AS disabled,
             count(*) FILTER (WHERE enabled AND last_status = 'ok')::int AS ok,
             count(*) FILTER (WHERE enabled AND last_status = 'error')::int AS error,
             count(*) FILTER (WHERE enabled AND last_status = 'running')::int AS running,
             count(*) FILTER (WHERE enabled AND last_status = 'pending')::int AS pending,
             count(*) FILTER (WHERE enabled AND last_status = 'skipped')::int AS skipped,
             count(*) FILTER (WHERE enabled AND consecutive_failures > 0)::int AS failing_owners,
             COALESCE(max(consecutive_failures) FILTER (WHERE enabled), 0)::int AS max_streak,
             round(avg(last_duration_ms))::int AS avg_ms,
             max(last_duration_ms)::int AS max_ms,
             count(*) FILTER (WHERE enabled AND next_run_at < now() - interval '10 minutes'
                              AND (locked_until IS NULL OR locked_until < now()))::int AS overdue,
             count(*) FILTER (WHERE locked_by IS NOT NULL AND locked_until < now())::int AS stale_locks,
             max(last_run_at) AS last_run_at,
             max(last_success_at) AS last_success_at
      FROM sync_jobs GROUP BY job_key, owner_type ORDER BY job_key, owner_type`),
    db.execute(sql`
      SELECT job_key, owner_type, last_error, consecutive_failures, last_run_at
      FROM sync_jobs WHERE enabled AND last_status = 'error' AND last_error IS NOT NULL
      ORDER BY consecutive_failures DESC, last_run_at DESC LIMIT 200`),
  ]);

  return {
    heartbeats: beats
      .map((b) => ({
        workerId: b.workerId,
        version: b.version,
        startedAt: b.startedAt.toISOString(),
        lastBeatAt: b.lastBeatAt.toISOString(),
        info: (b.info ?? {}) as HeartbeatInfo,
      }))
      .sort((a, b) => b.lastBeatAt.localeCompare(a.lastBeatAt)),
    jobs: (jobs as unknown as Record<string, unknown>[]).map((r) => ({
      jobKey: r.job_key as string,
      ownerType: r.owner_type as SyncOwnerType,
      enabled: r.enabled as number,
      disabled: r.disabled as number,
      ok: r.ok as number,
      error: r.error as number,
      running: r.running as number,
      pending: r.pending as number,
      skipped: r.skipped as number,
      failingOwners: r.failing_owners as number,
      maxStreak: r.max_streak as number,
      avgMs: (r.avg_ms as number | null) ?? null,
      maxMs: (r.max_ms as number | null) ?? null,
      overdue: r.overdue as number,
      staleLocks: r.stale_locks as number,
      lastRunAt: iso(r.last_run_at),
      lastSuccessAt: iso(r.last_success_at),
    })),
    errors: (errors as unknown as Record<string, unknown>[]).map((r) => ({
      jobKey: r.job_key as string,
      ownerType: r.owner_type as SyncOwnerType,
      error: r.last_error as string,
      consecutiveFailures: r.consecutive_failures as number,
      lastRunAt: iso(r.last_run_at),
    })),
  };
}
