import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/core/db";
import type { ValuationSource } from "@/core/db/schema/eve";
import { ORE_CLASSES, oreClassSqlCase, type OreClass } from "@/core/eve/ore";
import { addDays, daysBetween, type MiningFilters, type MiningView } from "./filters";
import { MINING_LEDGER_SCOPE } from "./module";

/**
 * Aggregation queries for the mining dashboards. Every query starts from the
 * same `ledger` CTE, which applies filters, the user's data scope,
 * de-duplication between sources and valuation.
 */

export interface MiningScope {
  /**
   * Shows corporation-wide mining (mining.view.corp, corporation view):
   * characters currently in the home corporation plus refineries owned by it.
   * Otherwise only the viewer's own characters.
   */
  corp: boolean;
  /**
   * The viewer's own characters, whatever their corporation (alts in other
   * corporations included). They make up the "My characters" view.
   */
  ownCharacterIds: number[];
  /** Corporation whose data corporation-wide views are limited to. */
  homeCorporationId: number | null;
}

/** Whether the viewer can switch between the corporation and "My characters" views. */
export function canViewCorpMining(user: { can: (permission: string) => boolean }, homeCorporationId: number | null): boolean {
  return user.can("mining.view.corp") && homeCorporationId !== null;
}

/**
 * Corporation-wide access needs a home corporation to isolate to; until one is
 * configured, users with corporation access see their own characters only.
 * The "own" view narrows corporation access to the viewer's own characters.
 */
export function miningScope(
  user: { can: (permission: string) => boolean; characterIds: number[] },
  homeCorporationId: number | null,
  view: MiningView = "corp",
): MiningScope {
  return {
    corp: view === "corp" && canViewCorpMining(user, homeCorporationId),
    ownCharacterIds: user.characterIds,
    homeCorporationId,
  };
}

/**
 * Corporation-wide views must not show data from other corporations (guests,
 * a previous home corporation's refineries, characters that left). Without a
 * home corporation they show nothing rather than everything.
 */
function homeCorpConds(scope: MiningScope) {
  if (!scope.corp) return { personal: () => sql``, observer: () => sql`` };
  const home = scope.homeCorporationId;
  if (!home) return { personal: () => sql`AND false`, observer: () => sql`AND false` };
  return {
    personal: (col: string) =>
      sql`AND EXISTS (SELECT 1 FROM characters hc WHERE hc.character_id = ${sql.raw(col)} AND hc.corporation_id = ${home})`,
    observer: (col: string) => sql`AND ${sql.raw(col)} = ${home}`,
  };
}

export interface Valuation {
  source: ValuationSource;
  mode: "current" | "historical";
}

export const ORE_CLASS_SQL = sql.raw(oreClassSqlCase("t.group_id", "g.category_id"));

function list(values: (number | string)[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

/**
 * The `ledger` CTE every mining query builds on (also composed by the P&L in
 * pnl/queries.ts): filtered, scoped, de-duplicated and valued ledger rows.
 */
export function ledgerCte(f: MiningFilters, scope: MiningScope, val: Valuation, range?: { from: string; to: string }): SQL {
  const from = range?.from ?? f.from;
  const to = range?.to ?? f.to;

  let chars = f.characters;
  if (!scope.corp) chars = chars.length ? chars.filter((c) => scope.ownCharacterIds.includes(c)) : scope.ownCharacterIds;
  const charCond = (col: string) =>
    !scope.corp && chars.length === 0
      ? sql`AND false`
      : chars.length
        ? sql`AND ${sql.raw(col)} IN (${list(chars)})`
        : sql``;
  const homeCorp = homeCorpConds(scope);

  const personal = sql`
    SELECT 'personal'::text AS source, l.character_id, l.date, l.solar_system_id, l.type_id,
           l.quantity::float8 AS quantity, NULL::bigint AS observer_id
    FROM mining_character_ledger l
    WHERE l.date BETWEEN ${from}::date AND ${to}::date ${charCond("l.character_id")}
      ${homeCorp.personal("l.character_id")}`;

  // In the combined view, observer rows already present in a member's personal
  // ledger (same character, day and ore) would be counted twice.
  const dedupe =
    f.source === "all"
      ? sql`AND NOT EXISTS (SELECT 1 FROM mining_character_ledger p
             WHERE p.character_id = o.character_id AND p.date = o.date AND p.type_id = o.type_id)`
      : sql``;
  const observer = sql`
    SELECT 'observer'::text AS source, o.character_id, o.date, obs.solar_system_id, o.type_id,
           o.quantity::float8 AS quantity, o.observer_id
    FROM mining_observer_ledger o
    LEFT JOIN mining_observers obs ON obs.observer_id = o.observer_id
    WHERE o.date BETWEEN ${from}::date AND ${to}::date ${charCond("o.character_id")} ${dedupe}
      ${homeCorp.observer("o.corporation_id")}`;

  const union =
    f.source === "personal" ? personal : f.source === "observer" ? observer : sql`${personal} UNION ALL ${observer}`;

  const price =
    val.mode === "historical"
      ? sql`COALESCE((SELECT h.unit_price FROM type_value_history h
           WHERE h.type_id = r.type_id AND h.source = ${val.source} AND h.date <= r.date
           ORDER BY h.date DESC LIMIT 1), v.unit_price)`
      : sql`v.unit_price`;

  const conds: SQL[] = [];
  if (f.types.length) conds.push(sql`r.type_id IN (${list(f.types)})`);
  if (f.systems.length) conds.push(sql`r.solar_system_id IN (${list(f.systems)})`);
  if (f.classes.length) conds.push(sql`(${ORE_CLASS_SQL}) IN (${list(f.classes)})`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

  return sql`ledger AS (
    SELECT r.source, r.character_id, r.date, r.solar_system_id, r.type_id, r.quantity, r.observer_id,
           t.name AS type_name, t.group_id,
           COALESCE(t.volume, 0)::float8 AS unit_volume,
           ${ORE_CLASS_SQL} AS ore_class,
           COALESCE(${price}, 0)::float8 AS unit_price
    FROM (${union}) r
    LEFT JOIN eve_types t ON t.type_id = r.type_id
    LEFT JOIN eve_groups g ON g.group_id = t.group_id
    LEFT JOIN type_values v ON v.type_id = r.type_id AND v.source = ${val.source}
    ${where}
  )`;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export interface Totals {
  quantity: number;
  volume: number;
  value: number;
  characters: number;
  miners: number;
  activeDays: number;
  types: number;
  unpricedRows: number;
}

async function totals(f: MiningFilters, scope: MiningScope, val: Valuation, range?: { from: string; to: string }): Promise<Totals> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${ledgerCte(f, scope, val, range)}
    SELECT COALESCE(SUM(l.quantity), 0)::float8 AS quantity,
           COALESCE(SUM(l.quantity * l.unit_volume), 0)::float8 AS volume,
           COALESCE(SUM(l.quantity * l.unit_price), 0)::float8 AS value,
           COUNT(DISTINCT l.character_id)::int AS characters,
           COUNT(DISTINCT COALESCE(c.user_id::text, 'c' || l.character_id))::int AS miners,
           COUNT(DISTINCT l.date)::int AS active_days,
           COUNT(DISTINCT l.type_id)::int AS types,
           COUNT(*) FILTER (WHERE l.unit_price = 0)::int AS unpriced_rows
    FROM ledger l LEFT JOIN characters c ON c.character_id = l.character_id`);
  const r = rows[0] ?? {};
  return {
    quantity: num(r.quantity),
    volume: num(r.volume),
    value: num(r.value),
    characters: num(r.characters),
    miners: num(r.miners),
    activeDays: num(r.active_days),
    types: num(r.types),
    unpricedRows: num(r.unpriced_rows),
  };
}

export async function getMiningSummary(f: MiningFilters, scope: MiningScope, val: Valuation) {
  const span = daysBetween(f.from, f.to);
  const prevTo = addDays(f.from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const [current, previous] = await Promise.all([
    totals(f, scope, val),
    totals(f, scope, val, { from: prevFrom, to: prevTo }),
  ]);
  return { current, previous, previousRange: { from: prevFrom, to: prevTo } };
}

export type ClassValues = Partial<Record<OreClass, number>>;

export interface DailyPoint {
  date: string;
  total: number;
  byClass: ClassValues;
  quantity: number;
  volume: number;
  value: number;
}

export async function getDailySeries(f: MiningFilters, scope: MiningScope, val: Valuation): Promise<DailyPoint[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${ledgerCte(f, scope, val)}
    SELECT to_char(l.date, 'YYYY-MM-DD') AS date, l.ore_class,
           SUM(l.quantity)::float8 AS quantity,
           SUM(l.quantity * l.unit_volume)::float8 AS volume,
           SUM(l.quantity * l.unit_price)::float8 AS value
    FROM ledger l GROUP BY 1, 2 ORDER BY 1`);

  const byDate = new Map<string, DailyPoint>();
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) {
    byDate.set(d, { date: d, total: 0, byClass: {}, quantity: 0, volume: 0, value: 0 });
  }
  for (const r of rows) {
    const point = byDate.get(String(r.date));
    if (!point) continue;
    const metricValue = num(r[f.metric]);
    const cls = String(r.ore_class) as OreClass;
    point.byClass[cls] = (point.byClass[cls] ?? 0) + metricValue;
    point.total += metricValue;
    point.quantity += num(r.quantity);
    point.volume += num(r.volume);
    point.value += num(r.value);
  }
  return [...byDate.values()];
}

export interface DailyTypeRow {
  date: string;
  typeId: number;
  name: string;
  oreClass: OreClass;
  /** The filters' metric. */
  amount: number;
}

/** Per-day totals of each type, for the daily chart's per-ore view. */
export async function getDailyTypeSeries(f: MiningFilters, scope: MiningScope, val: Valuation): Promise<DailyTypeRow[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${ledgerCte(f, scope, val)}
    SELECT to_char(l.date, 'YYYY-MM-DD') AS date, l.type_id::int AS type_id,
           MAX(l.type_name) AS name, MAX(l.ore_class) AS ore_class,
           SUM(l.quantity)::float8 AS quantity,
           SUM(l.quantity * l.unit_volume)::float8 AS volume,
           SUM(l.quantity * l.unit_price)::float8 AS value
    FROM ledger l GROUP BY 1, 2 ORDER BY 1`);
  return rows.map((r) => ({
    date: String(r.date),
    typeId: num(r.type_id),
    name: (r.name as string | null) ?? `Type ${r.type_id}`,
    oreClass: (r.ore_class as OreClass) ?? "other",
    amount: num(r[f.metric]),
  }));
}

export interface MemberRow {
  key: string;
  userId: string | null;
  portraitId: number;
  name: string;
  ownerName: string | null;
  characters: number;
  quantity: number;
  volume: number;
  value: number;
  activeDays: number;
  byClass: ClassValues;
}

export async function getMemberBreakdown(f: MiningFilters, scope: MiningScope, val: Valuation): Promise<MemberRow[]> {
  const keyExpr =
    f.groupBy === "user"
      ? sql`COALESCE(c.user_id::text, 'char:' || l.character_id)`
      : sql`l.character_id::text`;
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${ledgerCte(f, scope, val)},
    keyed AS (
      SELECT ${keyExpr} AS key, l.*, c.user_id, c.name AS char_name
      FROM ledger l LEFT JOIN characters c ON c.character_id = l.character_id
    ),
    agg AS (
      SELECT k.key,
             MAX(k.user_id::text) AS user_id,
             MIN(k.character_id)::float8 AS any_character,
             MAX(k.char_name) AS char_name,
             COUNT(DISTINCT k.character_id)::int AS characters,
             SUM(k.quantity)::float8 AS quantity,
             SUM(k.quantity * k.unit_volume)::float8 AS volume,
             SUM(k.quantity * k.unit_price)::float8 AS value,
             COUNT(DISTINCT k.date)::int AS active_days
      FROM keyed k GROUP BY k.key
    ),
    classes AS (
      SELECT k.key, jsonb_object_agg(k.ore_class, k.metric) AS by_class
      FROM (
        SELECT key, ore_class,
               SUM(CASE ${f.metric}::text WHEN 'value' THEN quantity * unit_price
                                          WHEN 'volume' THEN quantity * unit_volume
                                          ELSE quantity END)::float8 AS metric
        FROM keyed GROUP BY key, ore_class
      ) k GROUP BY k.key
    )
    SELECT a.*, cl.by_class,
           u.main_character_id::float8 AS main_id,
           mc.name AS main_name,
           e.name AS entity_name
    FROM agg a
    LEFT JOIN classes cl ON cl.key = a.key
    LEFT JOIN users u ON u.id::text = a.user_id
    LEFT JOIN characters mc ON mc.character_id = u.main_character_id
    LEFT JOIN eve_entities e ON e.id = a.any_character::bigint
    ORDER BY ${sql.raw(f.metric)} DESC NULLS LAST
    LIMIT 500`);

  return rows.map((r) => {
    const anyCharacter = num(r.any_character);
    const userMode = f.groupBy === "user";
    const portraitId = userMode && r.main_id ? num(r.main_id) : anyCharacter;
    const charName = (r.char_name as string | null) ?? (r.entity_name as string | null) ?? `Character ${anyCharacter}`;
    return {
      key: String(r.key),
      userId: (r.user_id as string | null) ?? null,
      portraitId,
      name: userMode ? ((r.main_name as string | null) ?? charName) : charName,
      ownerName: !userMode ? ((r.main_name as string | null) ?? null) : null,
      characters: num(r.characters),
      quantity: num(r.quantity),
      volume: num(r.volume),
      value: num(r.value),
      activeDays: num(r.active_days),
      byClass: (r.by_class as ClassValues | null) ?? {},
    };
  });
}

export interface TypeRow {
  typeId: number;
  name: string;
  groupName: string | null;
  oreClass: OreClass;
  quantity: number;
  volume: number;
  value: number;
  unitPrice: number;
}

export async function getTypeBreakdown(f: MiningFilters, scope: MiningScope, val: Valuation): Promise<TypeRow[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${ledgerCte(f, scope, val)}
    SELECT l.type_id::int AS type_id,
           MAX(l.type_name) AS name, MAX(l.ore_class) AS ore_class, MAX(g.name) AS group_name,
           SUM(l.quantity)::float8 AS quantity,
           SUM(l.quantity * l.unit_volume)::float8 AS volume,
           SUM(l.quantity * l.unit_price)::float8 AS value
    FROM ledger l LEFT JOIN eve_groups g ON g.group_id = l.group_id
    GROUP BY l.type_id ORDER BY ${sql.raw(f.metric)} DESC NULLS LAST`);
  return rows.map((r) => ({
    typeId: num(r.type_id),
    name: (r.name as string | null) ?? `Type ${r.type_id}`,
    groupName: (r.group_name as string | null) ?? null,
    oreClass: (r.ore_class as OreClass) ?? "other",
    quantity: num(r.quantity),
    volume: num(r.volume),
    value: num(r.value),
    unitPrice: num(r.quantity) > 0 ? num(r.value) / num(r.quantity) : 0,
  }));
}

export interface SystemRow {
  systemId: number | null;
  name: string;
  security: number | null;
  quantity: number;
  volume: number;
  value: number;
  miners: number;
}

export async function getSystemBreakdown(f: MiningFilters, scope: MiningScope, val: Valuation): Promise<SystemRow[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${ledgerCte(f, scope, val)}
    SELECT l.solar_system_id::float8 AS system_id, MAX(s.name) AS name, MAX(s.security_status)::float8 AS security,
           SUM(l.quantity)::float8 AS quantity,
           SUM(l.quantity * l.unit_volume)::float8 AS volume,
           SUM(l.quantity * l.unit_price)::float8 AS value,
           COUNT(DISTINCT l.character_id)::int AS miners
    FROM ledger l LEFT JOIN eve_systems s ON s.system_id = l.solar_system_id
    GROUP BY l.solar_system_id ORDER BY ${sql.raw(f.metric)} DESC NULLS LAST LIMIT 100`);
  return rows.map((r) => ({
    systemId: r.system_id === null ? null : num(r.system_id),
    name: (r.name as string | null) ?? (r.system_id === null ? "Unknown location" : `System ${r.system_id}`),
    security: r.security === null ? null : num(r.security),
    quantity: num(r.quantity),
    volume: num(r.volume),
    value: num(r.value),
    miners: num(r.miners),
  }));
}

export interface LedgerRow {
  date: string;
  source: "personal" | "observer";
  characterId: number;
  characterName: string;
  ownerName: string | null;
  typeId: number;
  typeName: string;
  oreClass: OreClass;
  systemId: number | null;
  systemName: string | null;
  security: number | null;
  observerName: string | null;
  quantity: number;
  volume: number;
  unitPrice: number;
  value: number;
}

export async function getLedgerRows(
  f: MiningFilters,
  scope: MiningScope,
  val: Valuation,
  opts: { limit: number; offset: number; count?: boolean },
): Promise<{ rows: LedgerRow[]; total: number }> {
  const db = getDb();
  const withCount = opts.count ?? true;
  const [rows, count] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      WITH ${ledgerCte(f, scope, val)}
      SELECT to_char(l.date, 'YYYY-MM-DD') AS date, l.source, l.character_id::float8 AS character_id,
             COALESCE(c.name, e.name) AS character_name, mc.name AS owner_name,
             l.type_id::int AS type_id, l.type_name, l.ore_class,
             l.solar_system_id::float8 AS system_id, s.name AS system_name, s.security_status::float8 AS security,
             obs.name AS observer_name,
             l.quantity, (l.quantity * l.unit_volume)::float8 AS volume, l.unit_price,
             (l.quantity * l.unit_price)::float8 AS value
      FROM ledger l
      LEFT JOIN characters c ON c.character_id = l.character_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN characters mc ON mc.character_id = u.main_character_id
      LEFT JOIN eve_entities e ON e.id = l.character_id
      LEFT JOIN eve_systems s ON s.system_id = l.solar_system_id
      LEFT JOIN mining_observers obs ON obs.observer_id = l.observer_id
      -- Fully deterministic order (a row's identity is source + observer + character + day + system + ore)
      -- so OFFSET paging (UI pages, streamed CSV export) never skips or repeats rows.
      ORDER BY l.date DESC, value DESC, l.character_id, l.type_id, l.solar_system_id NULLS LAST, l.source,
               l.observer_id NULLS FIRST
      LIMIT ${opts.limit} OFFSET ${opts.offset}`),
    withCount
      ? db.execute<{ total: number }>(sql`WITH ${ledgerCte(f, scope, val)} SELECT COUNT(*)::int AS total FROM ledger`)
      : Promise.resolve([] as { total: number }[]),
  ]);
  return {
    total: num(count[0]?.total),
    rows: rows.map((r) => ({
      date: String(r.date),
      source: r.source as "personal" | "observer",
      characterId: num(r.character_id),
      characterName: (r.character_name as string | null) ?? `Character ${r.character_id}`,
      ownerName: (r.owner_name as string | null) ?? null,
      typeId: num(r.type_id),
      typeName: (r.type_name as string | null) ?? `Type ${r.type_id}`,
      oreClass: (r.ore_class as OreClass) ?? "other",
      systemId: r.system_id === null ? null : num(r.system_id),
      systemName: (r.system_name as string | null) ?? null,
      security: r.security === null ? null : num(r.security),
      observerName: (r.observer_name as string | null) ?? null,
      quantity: num(r.quantity),
      volume: num(r.volume),
      unitPrice: num(r.unit_price),
      value: num(r.value),
    })),
  };
}

export interface LedgerDayTotals {
  date: string;
  entries: number;
  characters: number;
  quantity: number;
  volume: number;
  value: number;
}

/**
 * Per-day totals for the ledger's day groups, newest first. Rows are paged, so a
 * day can straddle pages; its header still sums every entry of that day. The
 * entry counts add up to the ledger's row count.
 */
export async function getLedgerDayTotals(f: MiningFilters, scope: MiningScope, val: Valuation): Promise<LedgerDayTotals[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${ledgerCte(f, scope, val)}
    SELECT to_char(l.date, 'YYYY-MM-DD') AS date, COUNT(*)::int AS entries,
           COUNT(DISTINCT l.character_id)::int AS characters,
           SUM(l.quantity)::float8 AS quantity,
           SUM(l.quantity * l.unit_volume)::float8 AS volume,
           SUM(l.quantity * l.unit_price)::float8 AS value
    FROM ledger l
    GROUP BY l.date
    ORDER BY l.date DESC`);
  return rows.map((r) => ({
    date: String(r.date),
    entries: num(r.entries),
    characters: num(r.characters),
    quantity: num(r.quantity),
    volume: num(r.volume),
    value: num(r.value),
  }));
}

export interface FilterOptions {
  characters: { id: number; name: string; registered: boolean }[];
  types: { id: number; name: string; oreClass: OreClass; groupName: string | null }[];
  systems: { id: number; name: string; security: number | null }[];
}

/** Values for the filter pickers: everything that appears in the visible ledgers. */
export async function getFilterOptions(scope: MiningScope): Promise<FilterOptions> {
  const db = getDb();
  const own = scope.ownCharacterIds;
  const homeCorp = homeCorpConds(scope);
  const charScope = (col: string) =>
    scope.corp ? sql`` : own.length ? sql`WHERE ${sql.raw(col)} IN (${list(own)})` : sql`WHERE false`;
  // Qualify the column: inside homeCorp's EXISTS subquery a bare name would bind to the inner table.
  const personalScope = (col: string) =>
    sql`${charScope(col)} ${scope.corp ? sql`WHERE true ${homeCorp.personal(`mining_character_ledger.${col}`)}` : sql``}`;
  const observerScope = (col: string) =>
    sql`${charScope(col)} ${scope.corp ? sql`WHERE true ${homeCorp.observer("corporation_id")}` : sql``}`;

  const [chars, types, systems] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT x.character_id::float8 AS id, COALESCE(c.name, e.name, 'Character ' || x.character_id) AS name,
             (c.character_id IS NOT NULL) AS registered
      FROM (SELECT DISTINCT character_id FROM mining_character_ledger ${personalScope("character_id")}
            UNION SELECT DISTINCT character_id FROM mining_observer_ledger ${observerScope("character_id")}) x
      LEFT JOIN characters c ON c.character_id = x.character_id
      LEFT JOIN eve_entities e ON e.id = x.character_id
      ORDER BY 2`),
    db.execute<Record<string, unknown>>(sql`
      SELECT x.type_id::int AS id, COALESCE(t.name, 'Type ' || x.type_id) AS name, ${ORE_CLASS_SQL} AS ore_class,
             g.name AS group_name
      FROM (SELECT DISTINCT type_id FROM mining_character_ledger ${personalScope("character_id")}
            UNION SELECT DISTINCT type_id FROM mining_observer_ledger ${observerScope("character_id")}) x
      LEFT JOIN eve_types t ON t.type_id = x.type_id
      LEFT JOIN eve_groups g ON g.group_id = t.group_id
      ORDER BY 2`),
    db.execute<Record<string, unknown>>(sql`
      SELECT x.id::float8 AS id, COALESCE(s.name, 'System ' || x.id) AS name, s.security_status::float8 AS security
      FROM (SELECT DISTINCT solar_system_id AS id FROM mining_character_ledger ${personalScope("character_id")}
            UNION ${
              scope.corp
                ? sql`SELECT DISTINCT solar_system_id FROM mining_observers WHERE solar_system_id IS NOT NULL ${homeCorp.observer("corporation_id")}`
                : sql`SELECT DISTINCT obs.solar_system_id FROM mining_observer_ledger o
                      JOIN mining_observers obs ON obs.observer_id = o.observer_id
                      ${charScope("o.character_id")} AND obs.solar_system_id IS NOT NULL`
            }) x
      LEFT JOIN eve_systems s ON s.system_id = x.id
      ORDER BY 2`),
  ]);

  return {
    characters: chars.map((r) => ({ id: num(r.id), name: String(r.name), registered: Boolean(r.registered) })),
    types: types.map((r) => ({
      id: num(r.id),
      name: String(r.name),
      oreClass: (r.ore_class as OreClass) ?? "other",
      groupName: (r.group_name as string | null) ?? null,
    })),
    systems: systems.map((r) => ({ id: num(r.id), name: String(r.name), security: r.security === null ? null : num(r.security) })),
  };
}

export interface ObserverSummary {
  observerId: number;
  name: string | null;
  systemName: string | null;
  security: number | null;
  lastUpdated: string | null;
  quantity: number;
  volume: number;
  value: number;
  miners: number;
  foreignMiners: number;
  byClass: ClassValues;
  topMiners: { characterId: number; name: string; value: number; quantity: number; foreign: boolean }[];
}

/** Whether the home corporation has any moon-drill structures (ESI observers) on record. */
export async function hasObservers(homeCorporationId: number | null): Promise<boolean> {
  if (homeCorporationId === null) return false;
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT EXISTS (SELECT 1 FROM mining_observers WHERE corporation_id = ${homeCorporationId}) AS present`);
  return rows[0]?.present === true;
}

/** Per-refinery totals for the date range (corporation scope only). */
export async function getObserverSummaries(f: MiningFilters, val: Valuation, homeCorporationId: number | null) {
  if (homeCorporationId === null) return [];
  const obsFilters: MiningFilters = { ...f, source: "observer" };
  const scope: MiningScope = { corp: true, ownCharacterIds: [], homeCorporationId };
  const db = getDb();
  const [observers, perMiner] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      WITH ${ledgerCte(obsFilters, scope, val)},
      cls AS (
        SELECT observer_id, jsonb_object_agg(ore_class, v) AS by_class FROM (
          SELECT observer_id, ore_class, SUM(quantity * unit_price)::float8 AS v FROM ledger GROUP BY 1, 2
        ) x GROUP BY observer_id
      )
      SELECT o.observer_id::float8 AS observer_id, o.name, s.name AS system_name, s.security_status::float8 AS security,
             to_char(o.last_updated, 'YYYY-MM-DD') AS last_updated,
             COALESCE(SUM(l.quantity), 0)::float8 AS quantity,
             COALESCE(SUM(l.quantity * l.unit_volume), 0)::float8 AS volume,
             COALESCE(SUM(l.quantity * l.unit_price), 0)::float8 AS value,
             COUNT(DISTINCT l.character_id)::int AS miners,
             MAX(cls.by_class::text) AS by_class
      FROM mining_observers o
      LEFT JOIN ledger l ON l.observer_id = o.observer_id
      LEFT JOIN eve_systems s ON s.system_id = o.solar_system_id
      LEFT JOIN cls ON cls.observer_id = o.observer_id
      WHERE true ${homeCorpConds(scope).observer("o.corporation_id")}
      GROUP BY o.observer_id, o.name, s.name, s.security_status, o.last_updated
      ORDER BY value DESC`),
    db.execute<Record<string, unknown>>(sql`
      WITH ${ledgerCte(obsFilters, scope, val)}
      SELECT l.observer_id::float8 AS observer_id, l.character_id::float8 AS character_id,
             COALESCE(c.name, e.name, 'Character ' || l.character_id) AS name,
             SUM(l.quantity)::float8 AS quantity, SUM(l.quantity * l.unit_price)::float8 AS value,
             BOOL_OR(ol.recorded_corporation_id IS DISTINCT FROM ${homeCorporationId ?? 0}) AS foreign_miner
      FROM ledger l
      LEFT JOIN mining_observer_ledger ol
        ON ol.observer_id = l.observer_id AND ol.character_id = l.character_id AND ol.date = l.date AND ol.type_id = l.type_id
      LEFT JOIN characters c ON c.character_id = l.character_id
      LEFT JOIN eve_entities e ON e.id = l.character_id
      GROUP BY 1, 2, 3 ORDER BY value DESC`),
  ]);

  const miners = new Map<number, ObserverSummary["topMiners"]>();
  const foreign = new Map<number, number>();
  for (const r of perMiner) {
    const id = num(r.observer_id);
    const isForeign = Boolean(r.foreign_miner) && homeCorporationId !== null;
    if (isForeign) foreign.set(id, (foreign.get(id) ?? 0) + 1);
    const arr = miners.get(id) ?? [];
    arr.push({ characterId: num(r.character_id), name: String(r.name), value: num(r.value), quantity: num(r.quantity), foreign: isForeign });
    miners.set(id, arr);
  }

  return observers.map<ObserverSummary>((r) => {
    const id = num(r.observer_id);
    return {
      observerId: id,
      name: (r.name as string | null) ?? null,
      systemName: (r.system_name as string | null) ?? null,
      security: r.security === null ? null : num(r.security),
      lastUpdated: (r.last_updated as string | null) ?? null,
      quantity: num(r.quantity),
      volume: num(r.volume),
      value: num(r.value),
      miners: num(r.miners),
      foreignMiners: foreign.get(id) ?? 0,
      byClass: r.by_class ? (JSON.parse(String(r.by_class)) as ClassValues) : {},
      topMiners: (miners.get(id) ?? []).slice(0, 8),
    };
  });
}

export const ALL_ORE_CLASSES = ORE_CLASSES;

export interface Coverage {
  /** Characters whose working token shares the mining ledger. */
  trackedCharacters: number;
  /** Characters that don't share it (no token, or a token without the scope): opt-in, so not a problem. */
  notEnabled: number;
  /** Characters sharing it whose token EVE revoked. */
  invalidTokens: number;
  lastLedgerSync: Date | null;
  lastObserverSync: Date | null;
  observerError: string | null;
  unregisteredMembers: number | null;
}

/** How complete and fresh the mining data is, so numbers can be trusted. */
export async function getCoverage(scope: MiningScope): Promise<Coverage> {
  const own = scope.ownCharacterIds;
  const homeCorporationId = scope.homeCorporationId;
  const charFilter = scope.corp
    ? homeCorporationId
      ? sql`AND c.corporation_id = ${homeCorporationId}`
      : sql`AND false`
    : own.length
      ? sql`AND c.character_id IN (${list(own)})`
      : sql`AND false`;
  const jobFilter = scope.corp ? sql`` : own.length ? sql`AND owner_id IN (${list(own)})` : sql`AND false`;
  const db = getDb();
  const [tokens, jobs, observers, roster] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT
        COUNT(*) FILTER (WHERE t.status = 'active' AND ${MINING_LEDGER_SCOPE}::text = ANY(t.scopes))::int AS tracked,
        COUNT(*) FILTER (WHERE t.character_id IS NULL OR NOT (${MINING_LEDGER_SCOPE}::text = ANY(t.scopes)))::int AS not_enabled,
        COUNT(*) FILTER (WHERE t.status = 'invalid' AND ${MINING_LEDGER_SCOPE}::text = ANY(t.scopes))::int AS invalid
      FROM characters c LEFT JOIN esi_tokens t ON t.character_id = c.character_id
      WHERE true ${charFilter}`),
    db.execute<Record<string, unknown>>(sql`
      SELECT MAX(last_success_at) AS last FROM sync_jobs
      WHERE job_key = 'mining.character-ledger' AND enabled ${jobFilter}`),
    db.execute<Record<string, unknown>>(sql`
      SELECT MAX(last_success_at) AS last, MAX(last_error) AS error FROM sync_jobs
      WHERE job_key = 'mining.corporation-observers'`),
    scope.corp && homeCorporationId
      ? db.execute<Record<string, unknown>>(sql`
          SELECT COUNT(*)::int AS n FROM corporation_members m
          WHERE m.corporation_id = ${homeCorporationId}
            AND NOT EXISTS (SELECT 1 FROM characters c WHERE c.character_id = m.character_id)`)
      : Promise.resolve(null),
  ]);
  const toDate = (v: unknown) => (v ? new Date(String(v)) : null);
  return {
    trackedCharacters: num(tokens[0]?.tracked),
    notEnabled: num(tokens[0]?.not_enabled),
    invalidTokens: num(tokens[0]?.invalid),
    lastLedgerSync: toDate(jobs[0]?.last),
    lastObserverSync: scope.corp ? toDate(observers[0]?.last) : null,
    observerError: scope.corp ? ((observers[0]?.error as string | null) ?? null) : null,
    unregisteredMembers: roster ? num(roster[0]?.n) : null,
  };
}

export interface MiningAccessStatus {
  characterId: number;
  name: string;
  grantedScopes: string[];
  /** The token shares the mining ledger with Keystar. */
  granted: boolean;
  /** Switched off in Keystar while the active token still holds the scope: can be switched back on without a login. */
  switchedOff: boolean;
  tokenStatus: "active" | "invalid" | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  /** First and last day of the stored personal ledger (null: nothing stored). */
  firstDate: string | null;
  lastDate: string | null;
}

/** The viewer's characters with their mining ledger access, for the access page. */
export async function getMiningAccess(userId: string): Promise<MiningAccessStatus[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, t.scopes, t.disabled_scopes, t.status AS token_status,
           j.last_success_at, j.last_status, j.last_error, l.first_date, l.last_date
    FROM characters c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = 'mining.character-ledger' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    LEFT JOIN LATERAL (
      SELECT MIN(date)::text AS first_date, MAX(date)::text AS last_date
      FROM mining_character_ledger WHERE character_id = c.character_id
    ) l ON TRUE
    WHERE c.user_id = ${userId}::uuid
    ORDER BY c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    const disabled = Array.isArray(r.disabled_scopes) ? (r.disabled_scopes as string[]) : [];
    const granted = scopes.includes(MINING_LEDGER_SCOPE);
    return {
      characterId: num(r.character_id),
      name: String(r.name),
      grantedScopes: scopes,
      granted,
      // A revoked token can't be switched back on in Keystar; it needs the EVE login.
      switchedOff: !granted && r.token_status === "active" && disabled.includes(MINING_LEDGER_SCOPE),
      tokenStatus: r.token_status === "active" || r.token_status === "invalid" ? r.token_status : null,
      lastSuccessAt: r.last_success_at ? new Date(String(r.last_success_at)) : null,
      lastStatus: str(r.last_status),
      lastError: str(r.last_error),
      firstDate: str(r.first_date),
      lastDate: str(r.last_date),
    };
  });
}
