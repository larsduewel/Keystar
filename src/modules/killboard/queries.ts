import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/core/db";
import { CURSOR_FORMAT, formatLiveCursor, type LiveCursor } from "@/core/live-cursor";
import { addDays, utcDayBounds } from "@/lib/dates";
import { spanOf, type DateRange, type KillboardWindows } from "./filters";

/**
 * Killboard aggregates for one corporation. Definitions (same as zKillboard):
 * - a **kill** is a killmail where at least one attacker flew for the
 *   corporation at the time and the victim did not;
 * - a **loss** is a killmail whose victim flew for the corporation (awox
 *   kills of corp mates count as losses only);
 * - ISK is zKillboard's total value (ship, fitting and cargo), counted in
 *   full for every pilot and ship type involved.
 */

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

function bounds(r: DateRange) {
  return utcDayBounds(r.from, r.to);
}

function within(col: SQL, r: DateRange): SQL {
  const { start, end } = bounds(r);
  return sql`(${col} >= ${start}::timestamptz AND ${col} < ${end}::timestamptz)`;
}

const T = sql.raw("k.killmail_time");

function killsIn(corp: number, r: DateRange): SQL {
  return sql`
    SELECT k.* FROM killmails k
    WHERE ${within(T, r)}
      AND k.victim_corporation_id IS DISTINCT FROM ${corp}
      AND EXISTS (SELECT 1 FROM killmail_attackers a WHERE a.killmail_id = k.killmail_id AND a.corporation_id = ${corp})`;
}

function lossesIn(corp: number, r: DateRange): SQL {
  return sql`SELECT k.* FROM killmails k WHERE k.victim_corporation_id = ${corp} AND ${within(T, r)}`;
}

export interface Totals {
  kills: number;
  losses: number;
  iskDestroyed: number;
  iskLost: number;
  soloKills: number;
}

export function efficiency(destroyed: number, lost: number): number | null {
  return destroyed + lost > 0 ? destroyed / (destroyed + lost) : null;
}

export async function getTotals(corp: number, r: DateRange): Promise<Totals> {
  const [row] = await getDb().execute<Record<string, unknown>>(sql`
    WITH k AS (${killsIn(corp, r)}), l AS (${lossesIn(corp, r)})
    SELECT (SELECT COUNT(*) FROM k)::int AS kills,
           (SELECT COUNT(*) FROM l)::int AS losses,
           (SELECT COALESCE(SUM(total_value), 0) FROM k)::float8 AS destroyed,
           (SELECT COALESCE(SUM(total_value), 0) FROM l)::float8 AS lost,
           (SELECT COUNT(*) FROM k WHERE solo)::int AS solo`);
  return {
    kills: num(row?.kills),
    losses: num(row?.losses),
    iskDestroyed: num(row?.destroyed),
    iskLost: num(row?.lost),
    soloKills: num(row?.solo),
  };
}

/** Per-window counts used for "this week vs previous week" deltas. */
interface WeekCounts {
  week: number;
  prevWeek: number;
}

export interface SystemRow extends WeekCounts {
  systemId: number;
  name: string | null;
  security: number | null;
  count: number;
  value: number;
}

export async function getTopSystems(corp: number, w: KillboardWindows, side: "kills" | "losses", limit = 7): Promise<SystemRow[]> {
  const span = spanOf(w.period, w.week, w.prevWeek);
  const source = side === "kills" ? killsIn(corp, span) : lossesIn(corp, span);
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH k AS (${source})
    SELECT k.solar_system_id::float8 AS id, s.name, s.security_status::float8 AS security,
           COUNT(*) FILTER (WHERE ${within(T, w.period)})::int AS n,
           COALESCE(SUM(k.total_value) FILTER (WHERE ${within(T, w.period)}), 0)::float8 AS value,
           COUNT(*) FILTER (WHERE ${within(T, w.week)})::int AS wk,
           COUNT(*) FILTER (WHERE ${within(T, w.prevWeek)})::int AS pwk
    FROM k LEFT JOIN eve_systems s ON s.system_id = k.solar_system_id
    GROUP BY k.solar_system_id, s.name, s.security_status
    HAVING COUNT(*) FILTER (WHERE ${within(T, w.period)}) > 0
    ORDER BY n DESC, value DESC, id
    LIMIT ${limit}`);
  return rows.map((r) => ({
    systemId: num(r.id),
    name: str(r.name),
    security: r.security === null ? null : num(r.security),
    count: num(r.n),
    value: num(r.value),
    week: num(r.wk),
    prevWeek: num(r.pwk),
  }));
}

export interface ActivityRow {
  killmailId: number;
  kind: "kill" | "loss";
  time: string;
  shipTypeId: number;
  shipName: string | null;
  systemId: number;
  systemName: string | null;
  victimId: number | null;
  victimName: string | null;
  value: number;
  solo: boolean;
}

export async function getRecentActivity(corp: number, r: DateRange, limit = 12): Promise<ActivityRow[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ev AS (
      SELECT 'kill'::text AS kind, k.* FROM (${killsIn(corp, r)}) k
      UNION ALL
      SELECT 'loss'::text AS kind, k.* FROM (${lossesIn(corp, r)}) k
    )
    SELECT ev.kind, ev.killmail_id::float8 AS id, ev.killmail_time AS time, ev.victim_ship_type_id AS ship_id,
           t.name AS ship, ev.solar_system_id::float8 AS system_id, s.name AS system,
           ev.victim_character_id::float8 AS victim_id, e.name AS victim, ev.total_value::float8 AS value, ev.solo
    FROM ev
    LEFT JOIN eve_types t ON t.type_id = ev.victim_ship_type_id
    LEFT JOIN eve_systems s ON s.system_id = ev.solar_system_id
    LEFT JOIN eve_entities e ON e.id = ev.victim_character_id
    ORDER BY ev.killmail_time DESC, ev.killmail_id DESC
    LIMIT ${limit}`);
  return rows.map((row) => ({
    killmailId: num(row.id),
    kind: row.kind === "loss" ? "loss" : "kill",
    time: new Date(String(row.time)).toISOString(),
    shipTypeId: num(row.ship_id),
    shipName: str(row.ship),
    systemId: num(row.system_id),
    systemName: str(row.system),
    victimId: row.victim_id === null ? null : num(row.victim_id),
    victimName: str(row.victim),
    value: num(row.value),
    solo: row.solo === true,
  }));
}

export interface ShipRow {
  typeId: number;
  name: string | null;
  /** Kills where a member flew this hull, and their total value. */
  kills: number;
  destroyed: number;
  /** Losses of this hull, and their total value. */
  losses: number;
  lost: number;
  /** Week-over-week changes in kills and losses. */
  killsDelta: number;
  lossesDelta: number;
}

/** Ship types flown on kills and lost, one row per hull. */
export async function getShips(corp: number, w: KillboardWindows): Promise<ShipRow[]> {
  const span = spanOf(w.period, w.week, w.prevWeek);
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH k AS (${killsIn(corp, span)}),
    l AS (${lossesIn(corp, span)}),
    used AS (
      SELECT DISTINCT a.killmail_id, a.ship_type_id
      FROM killmail_attackers a JOIN k ON k.killmail_id = a.killmail_id
      WHERE a.corporation_id = ${corp} AND a.ship_type_id IS NOT NULL
    ),
    flown AS (
      SELECT u.ship_type_id AS type_id,
             COUNT(*) FILTER (WHERE ${within(T, w.period)})::int AS kills,
             COALESCE(SUM(k.total_value) FILTER (WHERE ${within(T, w.period)}), 0)::float8 AS destroyed,
             COUNT(*) FILTER (WHERE ${within(T, w.week)})::int AS wk,
             COUNT(*) FILTER (WHERE ${within(T, w.prevWeek)})::int AS pwk
      FROM used u JOIN k ON k.killmail_id = u.killmail_id
      GROUP BY 1
    ),
    lost AS (
      SELECT k.victim_ship_type_id AS type_id,
             COUNT(*) FILTER (WHERE ${within(T, w.period)})::int AS losses,
             COALESCE(SUM(k.total_value) FILTER (WHERE ${within(T, w.period)}), 0)::float8 AS lost,
             COUNT(*) FILTER (WHERE ${within(T, w.week)})::int AS wk,
             COUNT(*) FILTER (WHERE ${within(T, w.prevWeek)})::int AS pwk
      FROM l k
      GROUP BY 1
    )
    SELECT COALESCE(f.type_id, x.type_id) AS type_id, t.name,
           COALESCE(f.kills, 0) AS kills, COALESCE(f.destroyed, 0) AS destroyed,
           COALESCE(x.losses, 0) AS losses, COALESCE(x.lost, 0) AS lost,
           COALESCE(f.wk, 0) - COALESCE(f.pwk, 0) AS dk,
           COALESCE(x.wk, 0) - COALESCE(x.pwk, 0) AS dl
    FROM flown f FULL OUTER JOIN lost x ON x.type_id = f.type_id
    LEFT JOIN eve_types t ON t.type_id = COALESCE(f.type_id, x.type_id)
    WHERE COALESCE(f.kills, 0) + COALESCE(x.losses, 0) > 0
    ORDER BY COALESCE(f.destroyed, 0) - COALESCE(x.lost, 0) DESC, type_id`);
  return rows.map((r) => ({
    typeId: num(r.type_id),
    name: str(r.name),
    kills: num(r.kills),
    destroyed: num(r.destroyed),
    losses: num(r.losses),
    lost: num(r.lost),
    killsDelta: num(r.dk),
    lossesDelta: num(r.dl),
  }));
}

export interface PilotRow {
  characterId: number;
  name: string | null;
  kills: number;
  losses: number;
  finalBlows: number;
  solo: number;
  destroyed: number;
  lost: number;
  killsDelta: number;
  lossesDelta: number;
}

/** Member performance: everyone who flew for the corporation on a kill or loss. */
export async function getPilots(corp: number, w: KillboardWindows): Promise<PilotRow[]> {
  const span = spanOf(w.period, w.week, w.prevWeek);
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH k AS (${killsIn(corp, span)}),
    l AS (${lossesIn(corp, span)}),
    att AS (
      SELECT a.killmail_id, a.character_id, bool_or(a.final_blow) AS fb
      FROM killmail_attackers a JOIN k ON k.killmail_id = a.killmail_id
      WHERE a.corporation_id = ${corp} AND a.character_id IS NOT NULL
      GROUP BY 1, 2
    ),
    ks AS (
      SELECT att.character_id,
             COUNT(*) FILTER (WHERE ${within(T, w.period)})::int AS kills,
             COUNT(*) FILTER (WHERE ${within(T, w.period)} AND att.fb)::int AS fb,
             COUNT(*) FILTER (WHERE ${within(T, w.period)} AND k.solo)::int AS solo,
             COALESCE(SUM(k.total_value) FILTER (WHERE ${within(T, w.period)}), 0)::float8 AS destroyed,
             COUNT(*) FILTER (WHERE ${within(T, w.week)})::int AS wk,
             COUNT(*) FILTER (WHERE ${within(T, w.prevWeek)})::int AS pwk
      FROM att JOIN k ON k.killmail_id = att.killmail_id
      GROUP BY 1
    ),
    ls AS (
      SELECT k.victim_character_id AS character_id,
             COUNT(*) FILTER (WHERE ${within(T, w.period)})::int AS losses,
             COALESCE(SUM(k.total_value) FILTER (WHERE ${within(T, w.period)}), 0)::float8 AS lost,
             COUNT(*) FILTER (WHERE ${within(T, w.week)})::int AS wk,
             COUNT(*) FILTER (WHERE ${within(T, w.prevWeek)})::int AS pwk
      FROM l k WHERE k.victim_character_id IS NOT NULL
      GROUP BY 1
    )
    SELECT COALESCE(ks.character_id, ls.character_id)::float8 AS id, e.name,
           COALESCE(ks.kills, 0) AS kills, COALESCE(ls.losses, 0) AS losses,
           COALESCE(ks.fb, 0) AS fb, COALESCE(ks.solo, 0) AS solo,
           COALESCE(ks.destroyed, 0) AS destroyed, COALESCE(ls.lost, 0) AS lost,
           COALESCE(ks.wk, 0) - COALESCE(ks.pwk, 0) AS dk,
           COALESCE(ls.wk, 0) - COALESCE(ls.pwk, 0) AS dl
    FROM ks FULL OUTER JOIN ls ON ls.character_id = ks.character_id
    LEFT JOIN eve_entities e ON e.id = COALESCE(ks.character_id, ls.character_id)
    WHERE COALESCE(ks.kills, 0) + COALESCE(ls.losses, 0) > 0
    ORDER BY kills DESC, destroyed DESC, id`);
  return rows.map((r) => ({
    characterId: num(r.id),
    name: str(r.name),
    kills: num(r.kills),
    losses: num(r.losses),
    finalBlows: num(r.fb),
    solo: num(r.solo),
    destroyed: num(r.destroyed),
    lost: num(r.lost),
    killsDelta: num(r.dk),
    lossesDelta: num(r.dl),
  }));
}

export interface NotableKillmail {
  killmailId: number;
  shipName: string | null;
  systemName: string | null;
  victimName: string | null;
  /** For kills: the member who landed the final blow, if any. */
  finalBlowName: string | null;
  value: number;
}

/** The most valuable kill or loss in a window. */
export async function getNotable(corp: number, r: DateRange, side: "kills" | "losses"): Promise<NotableKillmail | null> {
  const source = side === "kills" ? killsIn(corp, r) : lossesIn(corp, r);
  const [row] = await getDb().execute<Record<string, unknown>>(sql`
    WITH k AS (${source})
    SELECT k.killmail_id::float8 AS id, t.name AS ship, s.name AS system, v.name AS victim, k.total_value::float8 AS value,
           (SELECT e.name FROM killmail_attackers a JOIN eve_entities e ON e.id = a.character_id
             WHERE a.killmail_id = k.killmail_id AND a.final_blow AND a.corporation_id = ${corp} LIMIT 1) AS fb
    FROM k
    LEFT JOIN eve_types t ON t.type_id = k.victim_ship_type_id
    LEFT JOIN eve_systems s ON s.system_id = k.solar_system_id
    LEFT JOIN eve_entities v ON v.id = k.victim_character_id
    ORDER BY k.total_value DESC, k.killmail_id
    LIMIT 1`);
  if (!row) return null;
  return {
    killmailId: num(row.id),
    shipName: str(row.ship),
    systemName: str(row.system),
    victimName: str(row.victim),
    finalBlowName: str(row.fb),
    value: num(row.value),
  };
}

export interface KillboardStatus {
  /** Oldest stored killmail for the corporation. */
  since: string | null;
  killmails: number;
  /** Start of the last successful sync of *this* corporation (null after a home corporation change). */
  lastSyncAt: Date | null;
  lastError: string | null;
}

export async function getKillboardStatus(corp: number): Promise<KillboardStatus> {
  const db = getDb();
  const [[data], [job]] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT MIN(k.killmail_time) AS since, COUNT(*)::int AS n FROM killmails k
      WHERE k.victim_corporation_id = ${corp}
         OR EXISTS (SELECT 1 FROM killmail_attackers a WHERE a.killmail_id = k.killmail_id AND a.corporation_id = ${corp})`),
    // The sync job is global; its metadata records which corporation it last synced and when that run started.
    db.execute<Record<string, unknown>>(sql`
      SELECT CASE WHEN meta->>'corporationId' = ${String(corp)} THEN meta->>'lastSyncAt' END AS last_sync, last_error
      FROM sync_jobs WHERE job_key = 'killboard.zkill-sync' ORDER BY id LIMIT 1`),
  ]);
  return {
    since: data?.since ? new Date(String(data.since)).toISOString() : null,
    killmails: num(data?.n),
    lastSyncAt: job?.last_sync ? new Date(String(job.last_sync)) : null,
    lastError: str(job?.last_error),
  };
}

export interface DailyActivity {
  date: string;
  kills: number;
  losses: number;
  destroyed: number;
  lost: number;
}

/** Kills and losses per EVE day, with empty days filled in. */
export async function getDailyActivity(corp: number, r: DateRange): Promise<DailyActivity[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ev AS (
      SELECT 'kill'::text AS kind, k.killmail_time, k.total_value FROM (${killsIn(corp, r)}) k
      UNION ALL
      SELECT 'loss'::text AS kind, k.killmail_time, k.total_value FROM (${lossesIn(corp, r)}) k
    )
    SELECT to_char(killmail_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
           COUNT(*) FILTER (WHERE kind = 'kill')::int AS kills,
           COUNT(*) FILTER (WHERE kind = 'loss')::int AS losses,
           COALESCE(SUM(total_value) FILTER (WHERE kind = 'kill'), 0)::float8 AS destroyed,
           COALESCE(SUM(total_value) FILTER (WHERE kind = 'loss'), 0)::float8 AS lost
    FROM ev GROUP BY 1`);
  const byDay = new Map(rows.map((row) => [String(row.day), row]));
  const out: DailyActivity[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
    const row = byDay.get(d);
    out.push({
      date: d,
      kills: num(row?.kills),
      losses: num(row?.losses),
      destroyed: num(row?.destroyed),
      lost: num(row?.lost),
    });
  }
  return out;
}

/** How old a killmail may be and still be announced live (older ones arrive through backfills). */
const LIVE_MAX_AGE_HOURS = 3;
const LIVE_LIMIT = 10;

export { formatLiveCursor, liveCursorNow, parseLiveCursor, type LiveCursor } from "@/core/live-cursor";

export interface LiveEvent {
  killmailId: number;
  kind: "kill" | "loss";
  time: string;
  /** The destroyed hull: lost by the corporation (loss) or destroyed by it (kill). */
  shipTypeId: number;
  shipName: string | null;
  victimId: number | null;
  victimName: string | null;
  victimTicker: string | null;
  /**
   * Loss: the final blow (an outsider). Kill: the corporation's pilot who landed
   * the final blow, or did the most damage when an outsider landed it.
   */
  attacker: {
    characterId: number | null;
    name: string | null;
    ticker: string | null;
    shipTypeId: number | null;
    shipName: string | null;
    finalBlow: boolean;
  } | null;
  attackerCount: number;
  systemId: number;
  systemName: string | null;
  security: number | null;
  regionName: string | null;
  value: number;
  solo: boolean;
}

/** Kills and losses stored after the cursor (oldest first), with everything a notification shows. */
export async function getLiveEvents(corp: number, since: LiveCursor): Promise<{ events: LiveEvent[]; cursor: string }> {
  const fresh = sql`(k.first_seen_at, k.killmail_id) > (${since.at}::timestamptz, ${since.id})
    AND k.killmail_time > now() - make_interval(hours => ${LIVE_MAX_AGE_HOURS})`;
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ev AS (
      SELECT 'kill'::text AS kind, k.* FROM killmails k
      WHERE ${fresh}
        AND k.victim_corporation_id IS DISTINCT FROM ${corp}
        AND EXISTS (SELECT 1 FROM killmail_attackers a WHERE a.killmail_id = k.killmail_id AND a.corporation_id = ${corp})
      UNION ALL
      SELECT 'loss'::text AS kind, k.* FROM killmails k WHERE ${fresh} AND k.victim_corporation_id = ${corp}
    )
    SELECT ev.kind, ev.killmail_id::float8 AS id, ev.killmail_time AS time,
           to_char(ev.first_seen_at AT TIME ZONE 'UTC', ${CURSOR_FORMAT}) AS seen,
           ev.victim_ship_type_id AS ship_id, st.name AS ship,
           ev.victim_character_id::float8 AS victim_id, ve.name AS victim, vc.ticker AS victim_ticker,
           a.idx IS NOT NULL AS has_attacker, a.character_id::float8 AS attacker_id, ae.name AS attacker,
           ac.ticker AS attacker_ticker, a.ship_type_id AS attacker_ship_id, ast.name AS attacker_ship, a.final_blow,
           ev.attacker_count, ev.solar_system_id::float8 AS system_id, s.name AS system,
           s.security_status::float8 AS security, re.name AS region, ev.total_value::float8 AS value, ev.solo
    FROM ev
    LEFT JOIN LATERAL (
      SELECT a.* FROM killmail_attackers a
      WHERE a.killmail_id = ev.killmail_id AND (ev.kind = 'loss' OR a.corporation_id = ${corp})
      ORDER BY a.final_blow DESC, a.damage_done DESC, a.idx
      LIMIT 1
    ) a ON true
    LEFT JOIN eve_types st ON st.type_id = ev.victim_ship_type_id
    LEFT JOIN eve_entities ve ON ve.id = ev.victim_character_id
    LEFT JOIN eve_corporations vc ON vc.corporation_id = ev.victim_corporation_id
    LEFT JOIN eve_entities ae ON ae.id = a.character_id
    LEFT JOIN eve_corporations ac ON ac.corporation_id = a.corporation_id
    LEFT JOIN eve_types ast ON ast.type_id = a.ship_type_id
    LEFT JOIN eve_systems s ON s.system_id = ev.solar_system_id
    LEFT JOIN eve_constellations c ON c.constellation_id = s.constellation_id
    LEFT JOIN eve_entities re ON re.id = c.region_id
    ORDER BY ev.first_seen_at, ev.killmail_id
    LIMIT ${LIVE_LIMIT}`);
  const events = rows.map(
    (r): LiveEvent => ({
      killmailId: num(r.id),
      kind: r.kind === "loss" ? "loss" : "kill",
      time: new Date(String(r.time)).toISOString(),
      shipTypeId: num(r.ship_id),
      shipName: str(r.ship),
      victimId: r.victim_id === null ? null : num(r.victim_id),
      victimName: str(r.victim),
      victimTicker: str(r.victim_ticker),
      attacker: r.has_attacker
        ? {
            characterId: r.attacker_id === null ? null : num(r.attacker_id),
            name: str(r.attacker),
            ticker: str(r.attacker_ticker),
            shipTypeId: r.attacker_ship_id === null ? null : num(r.attacker_ship_id),
            shipName: str(r.attacker_ship),
            finalBlow: r.final_blow === true,
          }
        : null,
      attackerCount: num(r.attacker_count),
      systemId: num(r.system_id),
      systemName: str(r.system),
      security: r.security === null ? null : num(r.security),
      regionName: str(r.region),
      value: num(r.value),
      solo: r.solo === true,
    }),
  );
  const last = rows.at(-1);
  return { events, cursor: formatLiveCursor(last ? { at: String(last.seen), id: num(last.id) } : since) };
}
