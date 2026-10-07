import { lt } from "drizzle-orm";
import { appraisalAttempts, appraisals } from "@/core/db";
import type { JobDefinition } from "@/core/sync/types";
import { APPRAISAL_RATE_WINDOW_MS, APPRAISAL_RETENTION_DAYS } from "./appraisal/appraise";

/**
 * Retention: appraisals older than APPRAISAL_RETENTION_DAYS (their share links
 * stop working) and rate-limit attempts outside the window.
 */
export const tradeHousekeepingJob: JobDefinition = {
  key: "trade.housekeeping",
  label: (t) => t.trade.module.jobs.housekeeping,
  module: "trade",
  owner: "global",
  intervalSeconds: 6 * 3600,
  async run({ db }) {
    const deleted = await db
      .delete(appraisals)
      .where(lt(appraisals.createdAt, new Date(Date.now() - APPRAISAL_RETENTION_DAYS * 24 * 3600 * 1000)))
      .returning({ id: appraisals.id });
    await db.delete(appraisalAttempts).where(lt(appraisalAttempts.createdAt, new Date(Date.now() - APPRAISAL_RATE_WINDOW_MS)));
    return { summary: `Pruned ${deleted.length} appraisals` };
  },
};

export const tradeJobs: JobDefinition[] = [tradeHousekeepingJob];
