import { hostname } from "node:os";
import { sql } from "drizzle-orm";
import { closeDb, getDb, workerHeartbeats } from "@/core/db";
import { env } from "@/core/env";
import { esiStats, getEsi, KEYSTAR_VERSION } from "@/core/esi";
import { createLogger, errorMessage } from "@/core/logger";
import { getSetting } from "@/core/settings";
import { claimDueJobs, executeJob, planJobs } from "@/core/sync/scheduler";
import { processRuntime } from "@/core/system/runtime";
import type { HeartbeatInfo } from "@/core/system/worker";
import { JOBS } from "@/modules/jobs";
import { zkillStats } from "@/modules/killboard/sync";
import { runMigrations } from "@/scripts/migrate";

/**
 * Keystar background worker: plans and runs ESI sync jobs. Run exactly one
 * or several — jobs are claimed with FOR UPDATE SKIP LOCKED.
 */
const log = createLogger("worker");
const workerId = `${hostname()}:${process.pid}`;

/** Demo data has fake characters and tokens, so only public, global jobs run in demo mode. */
const DEMO_SAFE_JOBS = new Set([
  "core.server-status",
  "core.market-prices",
  "core.housekeeping",
  "killboard.situation-report",
  // Threat intel reads generated demo data instead of zKillboard in demo mode.
  "intel.scan-worker",
  "intel.briefings",
  "intel.housekeeping",
]);
const ACTIVE_JOBS = env().KEYSTAR_DEMO_MODE ? JOBS.filter((j) => DEMO_SAFE_JOBS.has(j.key)) : JOBS;
const jobsByKey = new Map(ACTIVE_JOBS.map((j) => [j.key, j]));
const running = new Set<Promise<void>>();
let stopping = false;

const PLAN_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

async function heartbeat(): Promise<void> {
  // Shown in System Info and the support package (src/core/system), since the web process can't see this one.
  const info: HeartbeatInfo = {
    running: running.size,
    jobs: ACTIVE_JOBS.length,
    concurrency: env().WORKER_CONCURRENCY,
    demo: env().KEYSTAR_DEMO_MODE,
    runtime: processRuntime(),
    esi: esiStats(),
    zkill: zkillStats(),
  };
  await getDb()
    .insert(workerHeartbeats)
    .values({ workerId, version: KEYSTAR_VERSION, info: { ...info } })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerId,
      set: { lastBeatAt: sql`now()`, info: { ...info } },
    });
}

async function tick(): Promise<void> {
  if (await getSetting("sync.paused")) return;
  const capacity = env().WORKER_CONCURRENCY - running.size;
  if (capacity <= 0) return;
  const claimed = await claimDueJobs(workerId, [...jobsByKey.keys()], capacity);
  for (const row of claimed) {
    const job = jobsByKey.get(row.jobKey)!;
    const p = executeJob(row, job, { esi: getEsi(), logger: log }).finally(() => running.delete(p));
    running.add(p);
  }
}

function every(ms: number, fn: () => Promise<void>, name: string): NodeJS.Timeout {
  let busy = false;
  return setInterval(() => {
    if (busy || stopping) return;
    busy = true;
    fn()
      .catch((err) => log.error(`${name} failed`, { error: errorMessage(err) }))
      .finally(() => {
        busy = false;
      });
  }, ms);
}

async function main(): Promise<void> {
  const e = env();
  log.info("Starting Keystar worker", { workerId, version: KEYSTAR_VERSION, concurrency: e.WORKER_CONCURRENCY });
  if (e.KEYSTAR_DEMO_MODE) log.warn("Demo mode: only running public global jobs", { jobs: [...jobsByKey.keys()] });
  if (process.env.SKIP_MIGRATIONS !== "true") await runMigrations(e.DATABASE_URL);

  await heartbeat();
  await planJobs(ACTIVE_JOBS);
  await tick();

  const timers = [
    every(HEARTBEAT_INTERVAL_MS, heartbeat, "heartbeat"),
    every(PLAN_INTERVAL_MS, () => planJobs(ACTIVE_JOBS), "planner"),
    every(TICK_INTERVAL_MS, tick, "tick"),
  ];

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`Received ${signal}, finishing ${running.size} running job(s)…`);
    timers.forEach(clearInterval);
    await Promise.race([Promise.allSettled([...running]), new Promise((r) => setTimeout(r, 25_000))]);
    // Release anything still locked by this worker so another worker can pick it up.
    await getDb()
      .execute(
        sql`UPDATE sync_jobs SET locked_until = NULL, locked_by = NULL, last_status = 'pending' WHERE locked_by = ${workerId}`,
      )
      .catch(() => undefined);
    await getDb().delete(workerHeartbeats).where(sql`${workerHeartbeats.workerId} = ${workerId}`).catch(() => undefined);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log.error("Worker crashed", { error: errorMessage(err) });
  process.exit(1);
});
