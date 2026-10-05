import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/core/db";
import { ENDING_SOON_MS, statusesOf, type IndustryActivity, type JobStatus } from "./activities";
import type { IndustryFilters } from "./filters";
import { INDUSTRY_JOBS_SCOPE, INDUSTRY_SCOPES, STRUCTURES_SCOPE } from "./module";

/** "The token holds both industry scopes", for `esi_tokens` aliased as `t`. */
const HOLDS_SCOPES = sql`t.scopes @> ARRAY[${INDUSTRY_JOBS_SCOPE}, ${STRUCTURES_SCOPE}]::text[]`;

/**
 * Queries for the industry jobs page. Everything is scoped to the viewer's own characters: there is no
 * corporation-wide view of industry jobs.
 */

export interface IndustryScope {
  /**
   * The viewer's characters that currently share their industry jobs (active token holding both scopes). A
   * character that switched access off keeps its stored jobs until they are deleted on the access page, but the
   * page no longer shows them, like a skill queue that is no longer shared.
   */
  ownCharacterIds: number[];
}

/** Of the viewer's characters, those with industry access on: the only ones the jobs page reads. */
export async function enabledCharacterIds(characterIds: number[]): Promise<number[]> {
  if (!characterIds.length) return [];
  const rows = await getDb().execute<{ character_id: unknown }>(sql`
    SELECT t.character_id FROM esi_tokens t
    WHERE t.character_id IN (${list(characterIds)}) AND t.status = 'active' AND ${HOLDS_SCOPES}`);
  return rows.map((r) => num(r.character_id));
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const toDate = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function list(values: (number | string)[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

/** The `WHERE` clause shared by the page, its count and its summary: scope and the filters. */
function jobConds(f: IndustryFilters, scope: IndustryScope): SQL {
  const chars = f.characters.length ? f.characters.filter((c) => scope.ownCharacterIds.includes(c)) : scope.ownCharacterIds;
  if (!chars.length) return sql`false`;
  const conds: SQL[] = [sql`j.character_id IN (${list(chars)})`, sql`j.status IN (${list([...statusesOf(f.state)])})`];
  if (f.activities.length) conds.push(sql`j.activity IN (${list(f.activities)})`);
  if (f.locations.length) conds.push(sql`j.location_id IN (${list(f.locations)})`);
  if (f.systems.length) conds.push(sql`loc.solar_system_id IN (${list(f.systems)})`);
  return sql.join(conds, sql` AND `);
}

const FROM = sql`FROM industry_jobs j LEFT JOIN industry_locations loc ON loc.location_id = j.location_id`;

export interface IndustryJob {
  jobId: number;
  characterId: number;
  characterName: string;
  activity: IndustryActivity;
  blueprintTypeId: number;
  blueprintName: string | null;
  productTypeId: number | null;
  productName: string | null;
  runs: number;
  licensedRuns: number | null;
  successfulRuns: number | null;
  probability: number | null;
  cost: number;
  status: JobStatus;
  startDate: Date;
  endDate: Date;
  pauseDate: Date | null;
  completedDate: Date | null;
  locationId: number;
  locationName: string | null;
  solarSystemId: number | null;
  systemName: string | null;
  security: number | null;
}

/**
 * One page of jobs: running ones soonest-ending first (a job waiting to be delivered before one still running), then
 * finished ones newest first.
 */
export async function getIndustryJobs(
  f: IndustryFilters,
  scope: IndustryScope,
  page: { limit: number; offset: number },
): Promise<{ jobs: IndustryJob[]; total: number }> {
  const db = getDb();
  const where = jobConds(f, scope);
  const [countRow] = await db.execute<{ total: unknown }>(sql`SELECT count(*) AS total ${FROM} WHERE ${where}`);
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT j.job_id, j.character_id, c.name AS character_name, j.activity, j.blueprint_type_id, bt.name AS blueprint_name,
           j.product_type_id, pt.name AS product_name, j.runs, j.licensed_runs, j.successful_runs, j.probability, j.cost,
           j.status, j.start_date, j.end_date, j.pause_date, j.completed_date, j.location_id,
           loc.name AS location_name, loc.solar_system_id, s.name AS system_name, s.security_status
    ${FROM}
    LEFT JOIN characters c ON c.character_id = j.character_id
    LEFT JOIN eve_types bt ON bt.type_id = j.blueprint_type_id
    LEFT JOIN eve_types pt ON pt.type_id = j.product_type_id
    LEFT JOIN eve_systems s ON s.system_id = loc.solar_system_id
    WHERE ${where}
    ORDER BY (j.status IN ('active', 'paused', 'ready')) DESC,
             CASE WHEN j.status IN ('active', 'paused', 'ready') THEN j.end_date END ASC,
             COALESCE(j.completed_date, j.end_date) DESC, j.job_id DESC
    LIMIT ${page.limit} OFFSET ${page.offset}`);
  return {
    total: num(countRow?.total),
    jobs: rows.map((r) => ({
      jobId: num(r.job_id),
      characterId: num(r.character_id),
      characterName: str(r.character_name) ?? String(r.character_id),
      activity: r.activity as IndustryActivity,
      blueprintTypeId: num(r.blueprint_type_id),
      blueprintName: str(r.blueprint_name),
      productTypeId: numOrNull(r.product_type_id),
      productName: str(r.product_name),
      runs: num(r.runs),
      licensedRuns: numOrNull(r.licensed_runs),
      successfulRuns: numOrNull(r.successful_runs),
      probability: numOrNull(r.probability),
      cost: num(r.cost),
      status: r.status as JobStatus,
      startDate: toDate(r.start_date)!,
      endDate: toDate(r.end_date)!,
      pauseDate: toDate(r.pause_date),
      completedDate: toDate(r.completed_date),
      locationId: num(r.location_id),
      locationName: str(r.location_name),
      solarSystemId: numOrNull(r.solar_system_id),
      systemName: str(r.system_name),
      security: numOrNull(r.security_status),
    })),
  };
}

export interface IndustrySummary {
  /** Jobs the filters match (all pages). */
  jobs: number;
  running: number;
  /** Finished in game, waiting for the installer to deliver them. */
  ready: number;
  paused: number;
  /** Running jobs that finish within 24 hours. */
  endingSoon: number;
  /** When the last of the running jobs finishes; null when none runs. */
  lastEndsAt: Date | null;
  /** Installation fees and facility taxes of the matched jobs, ISK. */
  cost: number;
  byActivity: Partial<Record<IndustryActivity, number>>;
}

/**
 * Totals over every job the filters match (not only the current page), aggregated in SQL so a long history costs
 * two small queries. Phases follow `jobProgress`: an active job past its end date counts as ready.
 */
export async function getIndustrySummary(f: IndustryFilters, scope: IndustryScope, now: Date): Promise<IndustrySummary> {
  const db = getDb();
  const where = jobConds(f, scope);
  // Dates go in as ISO strings: db.execute() does not serialise Date parameters.
  const at = sql`${now.toISOString()}::timestamptz`;
  const soon = sql`${new Date(now.getTime() + ENDING_SOON_MS).toISOString()}::timestamptz`;
  const running = sql`j.status = 'active' AND j.end_date > ${at}`;
  const [totals] = await db.execute<Record<string, unknown>>(sql`
    SELECT count(*) AS jobs,
           count(*) FILTER (WHERE ${running}) AS running,
           count(*) FILTER (WHERE j.status = 'ready' OR (j.status = 'active' AND j.end_date <= ${at})) AS ready,
           count(*) FILTER (WHERE j.status = 'paused') AS paused,
           count(*) FILTER (WHERE ${running} AND j.end_date < ${soon}) AS ending_soon,
           max(j.end_date) FILTER (WHERE ${running}) AS last_ends_at,
           coalesce(sum(j.cost), 0) AS cost
    ${FROM} WHERE ${where}`);
  const byActivity = await db.execute<Record<string, unknown>>(sql`
    SELECT j.activity, count(*) AS jobs ${FROM} WHERE ${where} GROUP BY j.activity`);
  return {
    jobs: num(totals?.jobs),
    running: num(totals?.running),
    ready: num(totals?.ready),
    paused: num(totals?.paused),
    endingSoon: num(totals?.ending_soon),
    lastEndsAt: toDate(totals?.last_ends_at),
    cost: num(totals?.cost),
    byActivity: Object.fromEntries(byActivity.map((r) => [r.activity as IndustryActivity, num(r.jobs)])),
  };
}

export interface IndustryFilterOptions {
  characters: { id: number; name: string }[];
  activities: IndustryActivity[];
  systems: { id: number; name: string; security: number | null }[];
  locations: { id: number; name: string; systemName: string | null }[];
}

/** What the pickers offer: the characters in scope, and the activities, systems and locations their jobs use. */
export async function getIndustryFilterOptions(scope: IndustryScope, t: { unknownLocation: (id: number) => string }): Promise<IndustryFilterOptions> {
  if (!scope.ownCharacterIds.length) return { characters: [], activities: [], systems: [], locations: [] };
  const db = getDb();
  const own = sql`j.character_id IN (${list(scope.ownCharacterIds)})`;
  const [characters, activities, systems, locations] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT c.character_id, c.name FROM characters c
      WHERE c.character_id IN (${list(scope.ownCharacterIds)}) ORDER BY c.name`),
    db.execute<Record<string, unknown>>(sql`SELECT DISTINCT j.activity FROM industry_jobs j WHERE ${own}`),
    db.execute<Record<string, unknown>>(sql`
      SELECT DISTINCT s.system_id, s.name, s.security_status
      ${FROM} JOIN eve_systems s ON s.system_id = loc.solar_system_id
      WHERE ${own} ORDER BY s.name`),
    db.execute<Record<string, unknown>>(sql`
      SELECT DISTINCT j.location_id, loc.name, s.name AS system_name
      ${FROM} LEFT JOIN eve_systems s ON s.system_id = loc.solar_system_id
      WHERE ${own} ORDER BY loc.name NULLS LAST, j.location_id`),
  ]);
  return {
    characters: characters.map((r) => ({ id: num(r.character_id), name: String(r.name) })),
    activities: activities.map((r) => r.activity as IndustryActivity),
    systems: systems.map((r) => ({ id: num(r.system_id), name: String(r.name), security: numOrNull(r.security_status) })),
    locations: locations.map((r) => ({
      id: num(r.location_id),
      name: str(r.name) ?? t.unknownLocation(num(r.location_id)),
      systemName: str(r.system_name),
    })),
  };
}

export interface IndustryCoverage {
  /** Own characters whose token holds both industry scopes and works. */
  tracked: number;
  /** Own characters with a working token without (full) industry access: the access page turns it on. */
  notEnabled: number;
  invalidTokens: number;
  lastSync: Date | null;
}

/** Over all of the viewer's characters, not only those in scope. */
export async function getIndustryCoverage(characterIds: number[]): Promise<IndustryCoverage> {
  if (!characterIds.length) return { tracked: 0, notEnabled: 0, invalidTokens: 0, lastSync: null };
  const [row] = await getDb().execute<Record<string, unknown>>(sql`
    SELECT count(*) FILTER (WHERE t.status = 'active' AND ${HOLDS_SCOPES}) AS tracked,
           count(*) FILTER (WHERE t.status = 'active' AND NOT (${HOLDS_SCOPES})) AS not_enabled,
           count(*) FILTER (WHERE t.status = 'invalid') AS invalid_tokens,
           max(j.last_success_at) AS last_sync
    FROM characters c
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = 'industry.character-jobs' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    WHERE c.character_id IN (${list(characterIds)})`);
  return {
    tracked: num(row?.tracked),
    notEnabled: num(row?.not_enabled),
    invalidTokens: num(row?.invalid_tokens),
    lastSync: toDate(row?.last_sync),
  };
}

export interface IndustryAccessStatus {
  characterId: number;
  name: string;
  grantedScopes: string[];
  /** Both industry scopes are granted. */
  granted: boolean;
  /** Switched off in Keystar while the active token still holds both scopes: can be switched back on without a login. */
  switchedOff: boolean;
  tokenStatus: "active" | "invalid" | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  /** Jobs are stored for this character. */
  hasData: boolean;
}

/** The viewer's characters with their industry access, for the access page. */
export async function getIndustryAccess(userId: string): Promise<IndustryAccessStatus[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, t.scopes, t.disabled_scopes, t.status AS token_status,
           j.last_success_at, j.last_status, j.last_error,
           EXISTS (SELECT 1 FROM industry_jobs ij WHERE ij.character_id = c.character_id) AS has_data
    FROM characters c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = 'industry.character-jobs' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    WHERE c.user_id = ${userId}::uuid
    ORDER BY c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);
  return rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    const disabled = Array.isArray(r.disabled_scopes) ? (r.disabled_scopes as string[]) : [];
    const granted = scopes.includes(INDUSTRY_JOBS_SCOPE) && scopes.includes(STRUCTURES_SCOPE);
    return {
      characterId: num(r.character_id),
      name: String(r.name),
      grantedScopes: scopes,
      granted,
      // A revoked token can't be switched back on in Keystar; it needs the EVE login.
      switchedOff:
        !granted &&
        r.token_status === "active" &&
        INDUSTRY_SCOPES.every((s) => scopes.includes(s) || disabled.includes(s)) &&
        INDUSTRY_SCOPES.some((s) => disabled.includes(s)),
      tokenStatus: r.token_status === "active" || r.token_status === "invalid" ? r.token_status : null,
      lastSuccessAt: toDate(r.last_success_at),
      lastStatus: str(r.last_status),
      lastError: str(r.last_error),
      hasData: Boolean(r.has_data),
    };
  });
}
