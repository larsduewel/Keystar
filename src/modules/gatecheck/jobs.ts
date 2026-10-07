import { sql } from "drizzle-orm";
import type { JobDefinition } from "@/core/sync/types";
import { GATE_HISTORY_DAYS, OTHER_KILL_DAYS } from "./constants";

/**
 * Retention: kills at gates for GATE_HISTORY_DAYS (camp history), other kills
 * for OTHER_KILL_DAYS. The kills themselves are
 * stored by the killboard's live feed job (see ingest.ts).
 */
export const gatecheckHousekeepingJob: JobDefinition = {
  key: "gatecheck.housekeeping",
  label: (t) => t.gatecheck.module.jobs.housekeeping,
  module: "gatecheck",
  owner: "global",
  intervalSeconds: 6 * 3600,
  async run({ db }) {
    const gate = await db.execute(sql`
      DELETE FROM gatecheck_kills WHERE gate_id IS NOT NULL AND killmail_time < now() - make_interval(days => ${GATE_HISTORY_DAYS})`);
    const other = await db.execute(sql`
      DELETE FROM gatecheck_kills WHERE gate_id IS NULL AND killmail_time < now() - make_interval(days => ${OTHER_KILL_DAYS})`);
    return {
      summary: `Deleted ${gate.count ?? 0} gate kills and ${other.count ?? 0} other kills past retention`,
    };
  },
};

export const gatecheckJobs: JobDefinition[] = [gatecheckHousekeepingJob];
