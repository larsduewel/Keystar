import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/core/db";
import { scopesToSwitchOff } from "@/core/modules/registry";
import { STRUCTURES_SCOPE } from "@/modules/industry/module";
import type { MarketFilters } from "./filters";
import { MARKET_MANAGE_HREF, MARKET_ORDERS_SCOPE, MARKET_SCOPES } from "./module";
import { EXPIRING_SOON_MS, statesOf, type OrderRange, type OrderState } from "./orders";

/** "The token holds both market scopes", for `esi_tokens` aliased as `t`. */
const HOLDS_SCOPES = sql`t.scopes @> ARRAY[${MARKET_ORDERS_SCOPE}, ${STRUCTURES_SCOPE}]::text[]`;

/**
 * Queries for the market orders page. Everything is scoped to the viewer's own characters: there is no
 * corporation-wide view of market orders.
 */

export interface MarketScope {
  /**
   * The viewer's characters that currently share their market orders (active token holding both scopes). A character
   * that switched access off keeps its stored orders until they are deleted on the access page, but the page no
   * longer shows them.
   */
  ownCharacterIds: number[];
}

/** Of the viewer's characters, those with market access on: the only ones the orders page reads. */
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

/** The `WHERE` clause shared by the page and its count: scope and the filters. The summary leaves the view out. */
function orderConds(f: MarketFilters, scope: MarketScope, opts: { view?: boolean } = {}): SQL {
  const chars = f.characters.length ? f.characters.filter((c) => scope.ownCharacterIds.includes(c)) : scope.ownCharacterIds;
  if (!chars.length) return sql`false`;
  const conds: SQL[] = [sql`o.character_id IN (${list(chars)})`];
  if (opts.view !== false) conds.push(sql`o.state IN (${list([...statesOf(f.view)])})`);
  if (f.side !== "all") conds.push(sql`o.is_buy_order = ${f.side === "buy"}`);
  if (f.locations.length) conds.push(sql`o.location_id IN (${list(f.locations)})`);
  return sql.join(conds, sql` AND `);
}

const FROM = sql`FROM market_orders o LEFT JOIN industry_locations loc ON loc.location_id = o.location_id`;
const EXPIRES = sql`(o.issued + o.duration * interval '1 day')`;

export interface MarketOrder {
  orderId: number;
  characterId: number;
  characterName: string;
  typeId: number;
  typeName: string | null;
  isBuyOrder: boolean;
  isCorporation: boolean;
  price: number;
  volumeTotal: number;
  volumeRemain: number;
  minVolume: number | null;
  escrow: number | null;
  range: OrderRange;
  issued: Date;
  expiresAt: Date;
  state: OrderState;
  closedAt: Date | null;
  locationId: number;
  locationName: string | null;
  solarSystemId: number | null;
  systemName: string | null;
  security: number | null;
  regionName: string | null;
}

/** One page of orders: open ones soonest-expiring first, then closed ones most recently closed first. */
export async function getMarketOrders(
  f: MarketFilters,
  scope: MarketScope,
  page: { limit: number; offset: number },
): Promise<{ orders: MarketOrder[]; total: number }> {
  const db = getDb();
  const where = orderConds(f, scope);
  const [countRow] = await db.execute<{ total: unknown }>(sql`SELECT count(*) AS total ${FROM} WHERE ${where}`);
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT o.order_id, o.character_id, c.name AS character_name, o.type_id, it.name AS type_name, o.is_buy_order,
           o.is_corporation, o.price, o.volume_total, o.volume_remain, o.min_volume, o.escrow, o.range, o.issued,
           ${EXPIRES} AS expires_at, o.state, o.closed_at, o.location_id, loc.name AS location_name, loc.solar_system_id,
           s.name AS system_name, s.security_status, r.name AS region_name
    ${FROM}
    LEFT JOIN characters c ON c.character_id = o.character_id
    LEFT JOIN eve_types it ON it.type_id = o.type_id
    LEFT JOIN eve_systems s ON s.system_id = loc.solar_system_id
    LEFT JOIN eve_entities r ON r.id = o.region_id
    WHERE ${where}
    ORDER BY (o.state = 'open') DESC,
             CASE WHEN o.state = 'open' THEN ${EXPIRES} END ASC,
             COALESCE(o.closed_at, o.issued) DESC, o.order_id DESC
    LIMIT ${page.limit} OFFSET ${page.offset}`);
  return {
    total: num(countRow?.total),
    orders: rows.map((r) => ({
      orderId: num(r.order_id),
      characterId: num(r.character_id),
      characterName: str(r.character_name) ?? String(r.character_id),
      typeId: num(r.type_id),
      typeName: str(r.type_name),
      isBuyOrder: Boolean(r.is_buy_order),
      isCorporation: Boolean(r.is_corporation),
      price: num(r.price),
      volumeTotal: num(r.volume_total),
      volumeRemain: num(r.volume_remain),
      minVolume: numOrNull(r.min_volume),
      escrow: numOrNull(r.escrow),
      range: r.range as OrderRange,
      issued: toDate(r.issued)!,
      expiresAt: toDate(r.expires_at)!,
      state: r.state as OrderState,
      closedAt: toDate(r.closed_at),
      locationId: num(r.location_id),
      locationName: str(r.location_name),
      solarSystemId: numOrNull(r.solar_system_id),
      systemName: str(r.system_name),
      security: numOrNull(r.security_status),
      regionName: str(r.region_name),
    })),
  };
}

export interface MarketLocationTotal {
  locationId: number;
  name: string | null;
  systemName: string | null;
  regionName: string | null;
  orders: number;
  /** ISK of what is left to sell or buy. */
  value: number;
}

export interface MarketSummary {
  sellOrders: number;
  /** ISK of the items still for sale (price × remaining quantity). */
  sellValue: number;
  buyOrders: number;
  /** ISK of the items still wanted (price × remaining quantity). */
  buyValue: number;
  /** ISK held in escrow for the buy orders. */
  escrow: number;
  /** Open orders that expire within `EXPIRING_SOON_MS`. */
  expiringSoon: number;
  /** When the next open order expires; null when none is open. */
  nextExpiry: Date | null;
  /** Where the open orders are, most ISK first. */
  byLocation: MarketLocationTotal[];
}

/**
 * Totals over the open orders the character, side and location filters match (whatever the view: the tiles always
 * describe what is on the market now), aggregated in SQL.
 */
export async function getMarketSummary(f: MarketFilters, scope: MarketScope, now: Date): Promise<MarketSummary> {
  const db = getDb();
  const where = sql`${orderConds(f, scope, { view: false })} AND o.state = 'open'`;
  // Dates go in as ISO strings: db.execute() does not serialise Date parameters.
  const soon = sql`${new Date(now.getTime() + EXPIRING_SOON_MS).toISOString()}::timestamptz`;
  const value = sql`o.price * o.volume_remain`;
  const [totals] = await db.execute<Record<string, unknown>>(sql`
    SELECT count(*) FILTER (WHERE NOT o.is_buy_order) AS sell_orders,
           coalesce(sum(${value}) FILTER (WHERE NOT o.is_buy_order), 0) AS sell_value,
           count(*) FILTER (WHERE o.is_buy_order) AS buy_orders,
           coalesce(sum(${value}) FILTER (WHERE o.is_buy_order), 0) AS buy_value,
           coalesce(sum(o.escrow) FILTER (WHERE o.is_buy_order), 0) AS escrow,
           count(*) FILTER (WHERE ${EXPIRES} < ${soon}) AS expiring_soon,
           min(${EXPIRES}) AS next_expiry
    ${FROM} WHERE ${where}`);
  const byLocation = await db.execute<Record<string, unknown>>(sql`
    SELECT o.location_id, loc.name, s.name AS system_name, min(r.name) AS region_name, count(*) AS orders,
           coalesce(sum(${value}), 0) AS value
    ${FROM}
    LEFT JOIN eve_systems s ON s.system_id = loc.solar_system_id
    LEFT JOIN eve_entities r ON r.id = o.region_id
    WHERE ${where}
    GROUP BY o.location_id, loc.name, s.name
    ORDER BY value DESC, o.location_id
    LIMIT 8`);
  return {
    sellOrders: num(totals?.sell_orders),
    sellValue: num(totals?.sell_value),
    buyOrders: num(totals?.buy_orders),
    buyValue: num(totals?.buy_value),
    escrow: num(totals?.escrow),
    expiringSoon: num(totals?.expiring_soon),
    nextExpiry: toDate(totals?.next_expiry),
    byLocation: byLocation.map((r) => ({
      locationId: num(r.location_id),
      name: str(r.name),
      systemName: str(r.system_name),
      regionName: str(r.region_name),
      orders: num(r.orders),
      value: num(r.value),
    })),
  };
}

export interface MarketFilterOptions {
  characters: { id: number; name: string }[];
  locations: { id: number; name: string; hint: string | null }[];
  /** Any order is stored for the characters in scope. */
  hasOrders: boolean;
}

/** What the pickers offer: the characters in scope and the stations and structures their orders are in. */
export async function getMarketFilterOptions(scope: MarketScope, t: { unknownLocation: (id: number) => string }): Promise<MarketFilterOptions> {
  if (!scope.ownCharacterIds.length) return { characters: [], locations: [], hasOrders: false };
  const db = getDb();
  const own = sql`o.character_id IN (${list(scope.ownCharacterIds)})`;
  const [characters, locations] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT c.character_id, c.name FROM characters c
      WHERE c.character_id IN (${list(scope.ownCharacterIds)}) ORDER BY c.name`),
    db.execute<Record<string, unknown>>(sql`
      SELECT o.location_id, loc.name, s.name AS system_name, min(r.name) AS region_name
      ${FROM}
      LEFT JOIN eve_systems s ON s.system_id = loc.solar_system_id
      LEFT JOIN eve_entities r ON r.id = o.region_id
      WHERE ${own}
      GROUP BY o.location_id, loc.name, s.name
      ORDER BY loc.name NULLS LAST, o.location_id`),
  ]);
  return {
    characters: characters.map((r) => ({ id: num(r.character_id), name: String(r.name) })),
    locations: locations.map((r) => ({
      id: num(r.location_id),
      name: str(r.name) ?? t.unknownLocation(num(r.location_id)),
      hint: str(r.system_name) ?? str(r.region_name),
    })),
    hasOrders: locations.length > 0,
  };
}

export interface MarketCoverage {
  /** Own characters whose token holds both market scopes and works. */
  tracked: number;
  /** Own characters without a token, or with a working token without (full) market access: the access page turns it on. */
  notEnabled: number;
  invalidTokens: number;
  lastSync: Date | null;
}

/** Over all of the viewer's characters, not only those in scope. */
export async function getMarketCoverage(characterIds: number[]): Promise<MarketCoverage> {
  if (!characterIds.length) return { tracked: 0, notEnabled: 0, invalidTokens: 0, lastSync: null };
  const [row] = await getDb().execute<Record<string, unknown>>(sql`
    SELECT count(*) FILTER (WHERE t.status = 'active' AND ${HOLDS_SCOPES}) AS tracked,
           count(*) FILTER (WHERE t.character_id IS NULL OR (t.status = 'active' AND NOT (${HOLDS_SCOPES}))) AS not_enabled,
           count(*) FILTER (WHERE t.status = 'invalid') AS invalid_tokens,
           max(j.last_success_at) AS last_sync
    FROM characters c
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = 'market.character-orders' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    WHERE c.character_id IN (${list(characterIds)})`);
  return {
    tracked: num(row?.tracked),
    notEnabled: num(row?.not_enabled),
    invalidTokens: num(row?.invalid_tokens),
    lastSync: toDate(row?.last_sync),
  };
}

export interface MarketAccessStatus {
  characterId: number;
  name: string;
  grantedScopes: string[];
  /** Both market scopes are granted. */
  granted: boolean;
  /**
   * Only one of them is granted, so switching off has something to clear. A structure scope that industry access
   * still uses doesn't count.
   */
  partial: boolean;
  /** Switched off in Keystar while the active token still holds both scopes: can be switched back on without a login. */
  switchedOff: boolean;
  tokenStatus: "active" | "invalid" | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  /** Orders are stored for this character. */
  hasData: boolean;
}

/** The viewer's characters with their market access, for the access page. */
export async function getMarketAccess(userId: string): Promise<MarketAccessStatus[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, t.scopes, t.disabled_scopes, t.status AS token_status,
           j.last_success_at, j.last_status, j.last_error,
           EXISTS (SELECT 1 FROM market_orders mo WHERE mo.character_id = c.character_id) AS has_data
    FROM characters c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = 'market.character-orders' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    WHERE c.user_id = ${userId}::uuid
    ORDER BY c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);
  return rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    const disabled = Array.isArray(r.disabled_scopes) ? (r.disabled_scopes as string[]) : [];
    const granted = MARKET_SCOPES.every((s) => scopes.includes(s));
    return {
      characterId: num(r.character_id),
      name: String(r.name),
      grantedScopes: scopes,
      granted,
      partial: !granted && scopesToSwitchOff(MARKET_MANAGE_HREF, scopes).some((s) => scopes.includes(s)),
      // A revoked token can't be switched back on in Keystar; it needs the EVE login.
      switchedOff:
        !granted &&
        r.token_status === "active" &&
        MARKET_SCOPES.every((s) => scopes.includes(s) || disabled.includes(s)) &&
        MARKET_SCOPES.some((s) => disabled.includes(s)),
      tokenStatus: r.token_status === "active" || r.token_status === "invalid" ? r.token_status : null,
      lastSuccessAt: toDate(r.last_success_at),
      lastStatus: str(r.last_status),
      lastError: str(r.last_error),
      hasData: Boolean(r.has_data),
    };
  });
}
