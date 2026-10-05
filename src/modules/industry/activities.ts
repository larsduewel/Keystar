/**
 * Industry job logic shared by the sync job, the pages and the tests. Pure: no database, no ESI.
 */

/** Industry activities as ESI reports them (`activity_id`), grouped the way the game's industry window does. */
export const INDUSTRY_ACTIVITIES = ["manufacturing", "te_research", "me_research", "copying", "invention", "reaction", "other"] as const;
export type IndustryActivity = (typeof INDUSTRY_ACTIVITIES)[number];

/** Filterable activities (the catch-all is only shown when a job falls into it). */
export const FILTER_ACTIVITIES: readonly IndustryActivity[] = INDUSTRY_ACTIVITIES.filter((a) => a !== "other");

/**
 * ESI `activity_id` → activity. Reactions appear as 9 in ESI and 11 in the SDE's `industryActivity`; both are mapped.
 * Legacy ids (2 "Researching Technology", 6 "Duplicating", 7 "Reverse Engineering") have no running jobs any more.
 */
export function activityOf(activityId: number): IndustryActivity {
  switch (activityId) {
    case 1:
      return "manufacturing";
    case 3:
      return "te_research";
    case 4:
      return "me_research";
    case 5:
      return "copying";
    case 8:
      return "invention";
    case 9:
    case 11:
      return "reaction";
    default:
      return "other";
  }
}

export function isIndustryActivity(value: string): value is IndustryActivity {
  return (INDUSTRY_ACTIVITIES as readonly string[]).includes(value);
}

/** Job states as ESI reports them. */
export const JOB_STATUSES = ["active", "paused", "ready", "delivered", "cancelled", "reverted"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

/**
 * Which jobs a view shows: running ones (installed, paused or waiting to be delivered), finished ones (delivered,
 * cancelled or reverted; ESI keeps them for 90 days), or everything.
 */
export type JobState = "running" | "finished" | "all";
export const JOB_STATES: readonly JobState[] = ["running", "finished", "all"];

export const RUNNING_STATUSES: readonly JobStatus[] = ["active", "paused", "ready"];
export const FINISHED_STATUSES: readonly JobStatus[] = ["delivered", "cancelled", "reverted"];

export function statusesOf(state: JobState): readonly JobStatus[] {
  return state === "running" ? RUNNING_STATUSES : state === "finished" ? FINISHED_STATUSES : JOB_STATUSES;
}

/** A job that finishes within this window is highlighted so its owner can be there to deliver it. */
export const ENDING_SOON_MS = 24 * 3600_000;

/** What the progress of a job needs: when it started, when it ends, and whether the game paused it. */
export interface JobTiming {
  status: JobStatus;
  startDate: Date;
  endDate: Date;
  pauseDate: Date | null;
}

export type JobPhase = "running" | "ending-soon" | "ready" | "paused" | "finished";

export interface JobProgress {
  /** Share of the job's duration that has passed at `now`, 0..1. A ready or finished job is 1. */
  fraction: number;
  /** Time until the job finishes (null once it is ready, paused or finished). */
  remainingMs: number | null;
  phase: JobPhase;
}

/**
 * Progress of a job at `now`. ESI reports `status: active` until the installer opens the industry window after the
 * end date, so an active job whose end date has passed counts as ready. A paused job stays where it was paused.
 */
export function jobProgress(job: JobTiming, now: Date): JobProgress {
  const span = job.endDate.getTime() - job.startDate.getTime();
  const elapsedAt = (t: number) => (span > 0 ? Math.min(1, Math.max(0, (t - job.startDate.getTime()) / span)) : 1);
  if (job.status === "delivered" || job.status === "cancelled" || job.status === "reverted") {
    return { fraction: 1, remainingMs: null, phase: "finished" };
  }
  if (job.status === "paused") {
    return { fraction: elapsedAt((job.pauseDate ?? now).getTime()), remainingMs: null, phase: "paused" };
  }
  const remainingMs = job.endDate.getTime() - now.getTime();
  if (job.status === "ready" || remainingMs <= 0) return { fraction: 1, remainingMs: null, phase: "ready" };
  return {
    fraction: elapsedAt(now.getTime()),
    remainingMs,
    phase: remainingMs < ENDING_SOON_MS ? "ending-soon" : "running",
  };
}

/** Days, hours and minutes of a duration (never negative). */
export function durationParts(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** NPC stations have ids in the 60 million range; anything above the 32-bit range is a player structure. */
export function isStructureId(locationId: number): boolean {
  return locationId > 2_147_483_647;
}

/** One job as ESI returns it (GET /characters/{id}/industry/jobs). */
export interface EsiIndustryJob {
  job_id: number;
  installer_id: number;
  /** The station or structure the job runs in. */
  facility_id: number;
  /** Legacy field; for structure jobs it may be missing or 0 while `facility_id` carries the id. */
  station_id?: number;
  activity_id: number;
  blueprint_id: number;
  blueprint_type_id: number;
  blueprint_location_id: number;
  output_location_id: number;
  runs: number;
  cost?: number;
  licensed_runs?: number;
  probability?: number;
  product_type_id?: number;
  status: string;
  duration: number;
  start_date: string;
  end_date: string;
  pause_date?: string;
  completed_date?: string;
  completed_character_id?: number;
  successful_runs?: number;
}

export interface IndustryJobRow {
  jobId: number;
  characterId: number;
  installerId: number;
  /** Where the job runs (`industry_locations`): `facility_id`, falling back to the legacy `station_id`. */
  locationId: number;
  facilityId: number;
  stationId: number | null;
  activityId: number;
  activity: IndustryActivity;
  blueprintId: number;
  blueprintTypeId: number;
  blueprintLocationId: number;
  outputLocationId: number;
  productTypeId: number | null;
  runs: number;
  licensedRuns: number | null;
  successfulRuns: number | null;
  probability: number | null;
  cost: number;
  duration: number;
  status: JobStatus;
  startDate: Date;
  endDate: Date;
  pauseDate: Date | null;
  completedDate: Date | null;
  completedCharacterId: number | null;
  updatedAt: Date;
}

/**
 * Maps ESI jobs to rows; a job with an unknown status is skipped rather than stored under a wrong one. The location
 * is `facility_id` (station or Upwell structure); `station_id` is only a fallback for old jobs that lack it.
 */
export function jobRows(characterId: number, jobs: EsiIndustryJob[], now: Date): IndustryJobRow[] {
  const rows: IndustryJobRow[] = [];
  for (const j of jobs) {
    if (!isJobStatus(j.status)) continue;
    const locationId = j.facility_id || j.station_id || 0;
    if (!locationId) continue;
    rows.push({
      jobId: j.job_id,
      characterId,
      installerId: j.installer_id,
      locationId,
      facilityId: j.facility_id || locationId,
      stationId: j.station_id ?? null,
      activityId: j.activity_id,
      activity: activityOf(j.activity_id),
      blueprintId: j.blueprint_id,
      blueprintTypeId: j.blueprint_type_id,
      blueprintLocationId: j.blueprint_location_id,
      outputLocationId: j.output_location_id,
      productTypeId: j.product_type_id ?? null,
      runs: j.runs,
      licensedRuns: j.licensed_runs ?? null,
      successfulRuns: j.successful_runs ?? null,
      probability: j.probability ?? null,
      cost: j.cost ?? 0,
      duration: j.duration,
      status: j.status,
      startDate: new Date(j.start_date),
      endDate: new Date(j.end_date),
      pauseDate: j.pause_date ? new Date(j.pause_date) : null,
      completedDate: j.completed_date ? new Date(j.completed_date) : null,
      completedCharacterId: j.completed_character_id ?? null,
      updatedAt: now,
    });
  }
  return rows;
}
