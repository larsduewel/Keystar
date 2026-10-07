import { and, asc, eq, gt, sql } from "drizzle-orm";
import { intelScans } from "@/core/db";
import { env } from "@/core/env";
import { triggerJobs } from "@/core/sync/scheduler";
import type { JobDefinition } from "@/core/sync/types";
import { writeBriefing } from "./ai/generate";
import {
  DIGEST_KEEP_NEWEST,
  DIGEST_RETENTION_DAYS,
  DSCAN_LOOKUP_WINDOW_MS,
  PILOT_RETENTION_DAYS,
  RESCORE_WINDOW_MS,
  SCAN_RETENTION_DAYS,
} from "./constants";
import { allianceContactsJob, corporationContactsJob } from "./contacts";
import { BRIEFING_JOB, SCAN_WORKER_JOB } from "./scans";
import { demoSource, zkillSource } from "./source";
import { runScanWorker } from "./worker";

/** Idle workers look for retries this often (new scans wake the job right away). */
const IDLE_POLL_MS = 60_000;

/** Reads pilots from zKillboard for open scans: statistics first, then their newest killmails. */
export const scanWorkerJob: JobDefinition = {
  key: SCAN_WORKER_JOB,
  label: (t) => t.intel.module.jobs.scanWorker,
  module: "intel",
  owner: "global",
  intervalSeconds: 2,
  async run({ db, esi, log }) {
    const demo = env().KEYSTAR_DEMO_MODE;
    const out = await runScanWorker({ db, esi, log }, { source: demo ? demoSource({ db }) : zkillSource(), offline: demo });
    if (out.readyScans.length) await triggerJobs({ jobKey: BRIEFING_JOB });
    const idleUntil = out.nextDueAt && out.nextDueAt.getTime() > Date.now() ? out.nextDueAt : new Date(Date.now() + IDLE_POLL_MS);
    return {
      summary: out.processed ? `${out.processed} pilot steps, ${out.remaining} waiting` : "Idle",
      nextRunAt: out.remaining > 0 ? null : idleUntil,
    };
  },
};

/** Writes the briefing of scans that just became ready (Claude or the template). */
export const briefingJob: JobDefinition = {
  key: BRIEFING_JOB,
  label: (t) => t.intel.module.jobs.briefings,
  module: "intel",
  owner: "global",
  intervalSeconds: 60,
  async run({ db }) {
    const pending = await db
      .select()
      .from(intelScans)
      .where(
        and(
          eq(intelScans.status, "ready"),
          eq(intelScans.briefingStatus, "pending"),
          gt(intelScans.createdAt, new Date(Date.now() - RESCORE_WINDOW_MS)),
        ),
      )
      .orderBy(asc(intelScans.createdAt))
      .limit(3);
    const sources: string[] = [];
    for (const scan of pending) {
      const note = await writeBriefing(scan, { createdBy: null, automatic: true });
      if (note) sources.push(note.source);
    }
    return { summary: pending.length ? `Wrote ${pending.length} briefing(s): ${sources.join(", ")}` : "Nothing to brief" };
  },
};

/** Retention: old killmail digests, pilots nobody scanned for months, old scans, d-scan lookups outside the rate window. */
export const intelHousekeepingJob: JobDefinition = {
  key: "intel.housekeeping",
  label: (t) => t.intel.module.jobs.housekeeping,
  module: "intel",
  owner: "global",
  intervalSeconds: 6 * 3600,
  async run({ db }) {
    const digest = await db.execute(sql`
      DELETE FROM intel_pilot_killmails k
      WHERE k.killmail_time < now() - make_interval(days => ${DIGEST_RETENTION_DAYS})
        AND NOT EXISTS (
          SELECT 1 FROM (
            SELECT killmail_id FROM intel_pilot_killmails n
            WHERE n.character_id = k.character_id ORDER BY n.killmail_time DESC LIMIT ${DIGEST_KEEP_NEWEST}
          ) newest WHERE newest.killmail_id = k.killmail_id)`);
    const pilots = await db.execute(sql`
      DELETE FROM intel_pilots p
      WHERE p.last_requested_at < now() - make_interval(days => ${PILOT_RETENTION_DAYS})
        AND NOT EXISTS (SELECT 1 FROM intel_queue q WHERE q.character_id = p.character_id)`);
    await db.execute(sql`
      DELETE FROM intel_pilot_killmails k
      WHERE NOT EXISTS (SELECT 1 FROM intel_pilots p WHERE p.character_id = k.character_id)`);
    const scans = await db.execute(sql`DELETE FROM intel_scans WHERE created_at < now() - make_interval(days => ${SCAN_RETENTION_DAYS})`);
    // Work nobody is waiting for any more (its scans are gone or long finished).
    const queue = await db.execute(sql`
      DELETE FROM intel_queue q
      WHERE q.requested_at < now() - make_interval(secs => ${RESCORE_WINDOW_MS / 1000})
        AND NOT EXISTS (
          SELECT 1 FROM intel_scan_pilots sp JOIN intel_scans s ON s.id = sp.scan_id
          WHERE sp.character_id = q.character_id AND s.created_at > now() - make_interval(secs => ${RESCORE_WINDOW_MS / 1000}))`);
    await db.execute(sql`DELETE FROM intel_ai_notes WHERE scan_id IS NULL AND created_at < now() - interval '90 days'`);
    await db.execute(sql`DELETE FROM intel_dscan_lookups WHERE created_at < now() - make_interval(secs => ${DSCAN_LOOKUP_WINDOW_MS / 1000})`);
    return {
      summary: `Pruned ${digest.count ?? 0} killmail digests, ${pilots.count ?? 0} pilots, ${scans.count ?? 0} scans, ${queue.count ?? 0} stale queue rows`,
    };
  },
};

export const intelJobs: JobDefinition[] = [scanWorkerJob, briefingJob, intelHousekeepingJob, corporationContactsJob, allianceContactsJob];
