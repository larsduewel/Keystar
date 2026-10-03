import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/core/db";
import { isOreClass, type OreClass } from "@/core/eve/ore";
import { addDays, utcDayBounds } from "@/lib/dates";
import { WALLET_SCOPE } from "@/modules/wallet/module";
import type { ChartClass } from "../class-colors";
import { ledgerCte, ORE_CLASS_SQL } from "../queries";
import { isExpenseCategory, purchaseCategorySqlCase, type ExpenseCategory, type ExpenseStatus } from "./categories";
import { pnlLedgerFilters, type StatusFilter } from "./filters";
import type { PnlScope } from "./scope";

/**
 * Data access for the personal mining P&L. Every query is limited to the
 * signed-in account (`user_id`) and its own characters; wallet rows are
 * additionally matched on the account that imported them.
 */

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const toDate = (v: unknown): Date | null =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v));

function list(values: (number | string)[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

const PURCHASE_CATEGORY_SQL = sql.raw(purchaseCategorySqlCase("w.type_id", "t.group_id"));
const ACTIVITY_SQL = (oreClass: string) =>
  sql.raw(
    `CASE WHEN ${oreClass} LIKE 'moon_%' THEN 'moon' WHEN ${oreClass} IN ('ore', 'ice', 'gas') THEN ${oreClass} ELSE 'other' END`,
  );

/**
 * The mining ledger of the selected characters with the P&L valuation: a
 * matching price rule (latest `valid_from` wins), else the dashboard value
 * times the income rate.
 */
function pricedCte(s: PnlScope): SQL {
  return sql`${ledgerCte(pnlLedgerFilters(s, s.characterIds), s.ledgerScope, s.valuation)},
  priced AS (
    SELECT l.*, COALESCE(r.unit_price, l.unit_price * ${s.ratePct}::float8 / 100)::float8 AS pnl_unit_price
    FROM ledger l
    LEFT JOIN LATERAL (
      SELECT pr.unit_price FROM mining_pnl_price_rules pr
      WHERE pr.user_id = ${s.userId}::uuid AND pr.type_id = l.type_id
        AND (pr.valid_from IS NULL OR pr.valid_from <= l.date)
        AND (pr.valid_to IS NULL OR pr.valid_to >= l.date)
      ORDER BY pr.valid_from DESC NULLS LAST, pr.id DESC
      LIMIT 1
    ) r ON true
  )`;
}

export interface IncomeRow {
  date: string;
  characterId: number;
  oreClass: OreClass;
  /** P&L value (rate and price rules applied). */
  value: number;
  /** Dashboard value of the same ore. */
  baseValue: number;
  volume: number;
  quantity: number;
  unpricedRows: number;
}

export async function getIncomeRows(s: PnlScope): Promise<IncomeRow[]> {
  if (!s.characterIds.length) return [];
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${pricedCte(s)}
    SELECT to_char(p.date, 'YYYY-MM-DD') AS date, p.character_id, p.ore_class,
           SUM(p.quantity * p.pnl_unit_price)::float8 AS value,
           SUM(p.quantity * p.unit_price)::float8 AS base_value,
           SUM(p.quantity * p.unit_volume)::float8 AS volume,
           SUM(p.quantity)::float8 AS quantity,
           COUNT(*) FILTER (WHERE p.pnl_unit_price = 0)::int AS unpriced
    FROM priced p
    GROUP BY 1, 2, 3
    ORDER BY 1`);
  return rows.map((r) => ({
    date: String(r.date),
    characterId: num(r.character_id),
    oreClass: isOreClass(String(r.ore_class)) ? (r.ore_class as OreClass) : "other",
    value: num(r.value),
    baseValue: num(r.base_value),
    volume: num(r.volume),
    quantity: num(r.quantity),
    unpricedRows: num(r.unpriced),
  }));
}

export interface ActivityFigure {
  hours: number;
  /** P&L value of the ore mined inside the measured windows. */
  value: number;
}

export interface ActivityStats {
  /** Wall-clock: overlapping windows of several characters count once. */
  total: ActivityFigure;
  byCharacter: Map<number, ActivityFigure>;
  byActivity: Map<ChartClass, ActivityFigure>;
  /** Earliest start of activity tracking among the selected characters. */
  trackedSince: Date | null;
}

/** Active hours from ledger growth (see activity.ts), as unions of time ranges. */
export async function getActivityStats(s: PnlScope): Promise<ActivityStats> {
  const empty: ActivityStats = { total: { hours: 0, value: 0 }, byCharacter: new Map(), byActivity: new Map(), trackedSince: null };
  if (!s.characterIds.length) return empty;
  const db = getDb();
  const [rows, coverage] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      WITH ${pricedCte(s)},
      day_price AS (SELECT date, type_id, MAX(pnl_unit_price) AS unit_price FROM priced GROUP BY 1, 2),
      raw AS (
        SELECT a.character_id, a.date, a.type_id, a.quantity, a.window_start, a.window_end, ${ORE_CLASS_SQL} AS ore_class
        FROM mining_activity a
        LEFT JOIN eve_types t ON t.type_id = a.type_id
        LEFT JOIN eve_groups g ON g.group_id = t.group_id
        WHERE a.character_id IN (${list(s.characterIds)}) AND a.date BETWEEN ${s.from}::date AND ${s.to}::date
      ),
      act AS (
        SELECT r.character_id, ${ACTIVITY_SQL("r.ore_class")} AS activity,
               tstzrange(r.window_start, r.window_end, '[)') AS span,
               r.quantity * COALESCE(dp.unit_price, 0) AS value
        FROM raw r
        LEFT JOIN day_price dp ON dp.date = r.date AND dp.type_id = r.type_id
      ),
      sets AS (
        SELECT 'total'::text AS dim, ''::text AS key, range_agg(span) AS spans, COALESCE(SUM(value), 0) AS value FROM act
        UNION ALL
        SELECT 'character', character_id::text, range_agg(span), SUM(value) FROM act GROUP BY character_id
        UNION ALL
        SELECT 'activity', activity, range_agg(span), SUM(value) FROM act GROUP BY activity
      )
      SELECT dim, key, value::float8 AS value,
             COALESCE((SELECT SUM(EXTRACT(EPOCH FROM upper(x) - lower(x))) FROM unnest(spans) AS x), 0)::float8 / 3600 AS hours
      FROM sets`),
    db.execute<Record<string, unknown>>(sql`
      SELECT MIN(since) AS since FROM mining_activity_coverage WHERE character_id IN (${list(s.characterIds)})`),
  ]);
  const out = { ...empty, byCharacter: new Map(), byActivity: new Map() } as ActivityStats;
  for (const r of rows) {
    const figure = { hours: num(r.hours), value: num(r.value) };
    if (r.dim === "total") out.total = figure;
    else if (r.dim === "character") out.byCharacter.set(Number(r.key), figure);
    else out.byActivity.set(String(r.key) as ChartClass, figure);
  }
  out.trackedSince = toDate(coverage[0]?.since);
  return out;
}

/**
 * Market trades between the account's own characters (an alt selling to the main) move items around without
 * costing or earning anything: the cost was the original purchase.
 */
function internalTrade(s: PnlScope): SQL {
  const own = s.ledgerScope.ownCharacterIds;
  return own.length ? sql`AND w.client_id NOT IN (${list(own)})` : sql``;
}

/** Wallet purchases with their effective category, inclusion and status (mirrors expenseStatus()). */
function purchasesCte(s: PnlScope): SQL {
  const { start, end } = utcDayBounds(s.from, s.to);
  return sql`purchases AS (
    SELECT w.character_id, w.transaction_id, w.date, w.type_id, w.quantity, w.unit_price,
           (w.quantity * w.unit_price)::float8 AS amount, t.name AS type_name, t.group_id,
           ${PURCHASE_CATEGORY_SQL} AS auto_category,
           o.category AS o_category, o.included AS o_included,
           COALESCE(pc.auto_include_expenses, false) AS auto_include
    FROM wallet_transactions w
    LEFT JOIN eve_types t ON t.type_id = w.type_id
    LEFT JOIN mining_pnl_tx_overrides o
      ON o.user_id = w.user_id AND o.character_id = w.character_id AND o.transaction_id = w.transaction_id
    LEFT JOIN mining_pnl_characters pc ON pc.user_id = w.user_id AND pc.character_id = w.character_id
    WHERE w.user_id = ${s.userId}::uuid AND w.character_id IN (${list(s.characterIds)}) AND w.is_buy
      AND w.date >= ${start}::timestamptz AND w.date < ${end}::timestamptz
      ${internalTrade(s)}
  ),
  effective AS (
    SELECT p.*, COALESCE(p.o_category, p.auto_category) AS category,
           COALESCE(p.o_included, p.auto_category IS NOT NULL AND p.auto_include) AS included
    FROM purchases p
  ),
  classified AS (
    SELECT e.*, CASE WHEN e.included THEN 'counted' WHEN e.o_included = false THEN 'excluded'
                     WHEN e.category IS NULL THEN 'untagged' ELSE 'suggested' END AS status
    FROM effective e
  )`;
}

export interface ExpenseRow {
  date: string;
  characterId: number;
  category: ExpenseCategory | null;
  status: ExpenseStatus;
  amount: number;
  count: number;
}

/** Wallet purchases per day, character, category and status. */
export async function getExpenseRows(s: PnlScope): Promise<ExpenseRow[]> {
  if (!s.characterIds.length) return [];
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ${purchasesCte(s)}
    SELECT to_char((c.date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS date, c.character_id, c.category, c.status,
           SUM(c.amount)::float8 AS amount, COUNT(*)::int AS count
    FROM classified c
    GROUP BY 1, 2, 3, 4
    ORDER BY 1`);
  return rows.map((r) => ({
    date: String(r.date),
    characterId: num(r.character_id),
    category: isExpenseCategory(r.category) ? r.category : null,
    status: String(r.status) as ExpenseStatus,
    amount: num(r.amount),
    count: num(r.count),
  }));
}

export interface PurchaseRow {
  characterId: number;
  characterName: string | null;
  transactionId: number;
  date: string;
  typeId: number;
  typeName: string | null;
  groupName: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  autoCategory: ExpenseCategory | null;
  category: ExpenseCategory | null;
  status: ExpenseStatus;
  /** Your include/exclude decision (null = automatic). */
  overrideIncluded: boolean | null;
}

/** One page of wallet purchases for review, newest first. */
export async function getPurchases(
  s: PnlScope,
  opts: { status: StatusFilter; limit: number; offset: number },
): Promise<{ rows: PurchaseRow[]; total: number }> {
  if (!s.characterIds.length) return { rows: [], total: 0 };
  const where = opts.status === "mining" ? sql`c.status <> 'untagged'` : sql`c.status = ${opts.status}`;
  const db = getDb();
  const [rows, count] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      WITH ${purchasesCte(s)}
      SELECT c.*, ch.name AS character_name, g.name AS group_name,
             to_char(c.date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date_iso
      FROM classified c
      LEFT JOIN characters ch ON ch.character_id = c.character_id
      LEFT JOIN eve_groups g ON g.group_id = c.group_id
      WHERE ${where}
      ORDER BY c.date DESC, c.transaction_id DESC
      LIMIT ${opts.limit} OFFSET ${opts.offset}`),
    db.execute<Record<string, unknown>>(sql`
      WITH ${purchasesCte(s)}
      SELECT COUNT(*)::int AS n FROM classified c WHERE ${where}`),
  ]);
  return {
    total: num(count[0]?.n),
    rows: rows.map((r) => ({
      characterId: num(r.character_id),
      characterName: str(r.character_name),
      transactionId: num(r.transaction_id),
      date: String(r.date_iso),
      typeId: num(r.type_id),
      typeName: str(r.type_name),
      groupName: str(r.group_name),
      quantity: num(r.quantity),
      unitPrice: num(r.unit_price),
      amount: num(r.amount),
      autoCategory: isExpenseCategory(r.auto_category) ? r.auto_category : null,
      category: isExpenseCategory(r.category) ? r.category : null,
      status: String(r.status) as ExpenseStatus,
      overrideIncluded: r.o_included === null || r.o_included === undefined ? null : Boolean(r.o_included),
    })),
  };
}

export interface ManualDailyRow {
  date: string;
  characterId: number | null;
  category: ExpenseCategory;
  amount: number;
}

/**
 * Manual entries per day, with spread entries divided evenly over their days.
 * Account-wide entries only count while no character filter is applied.
 */
export async function getManualDaily(s: PnlScope, allCharacterIds: number[]): Promise<ManualDailyRow[]> {
  const chars = s.narrowed ? s.characterIds : allCharacterIds;
  const charCond = chars.length
    ? s.narrowed
      ? sql`AND e.character_id IN (${list(chars)})`
      : sql`AND (e.character_id IS NULL OR e.character_id IN (${list(chars)}))`
    : sql`AND e.character_id IS NULL`;
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT to_char(d::date, 'YYYY-MM-DD') AS date, e.character_id, e.category,
           SUM(e.amount / e.spread_days)::float8 AS amount
    FROM mining_pnl_entries e
    CROSS JOIN LATERAL generate_series(e.date::timestamp, (e.date + (e.spread_days - 1))::timestamp, interval '1 day') AS d
    WHERE e.user_id = ${s.userId}::uuid AND d::date BETWEEN ${s.from}::date AND ${s.to}::date ${charCond}
    GROUP BY 1, 2, 3
    ORDER BY 1`);
  return rows.map((r) => ({
    date: String(r.date),
    characterId: r.character_id === null ? null : num(r.character_id),
    category: isExpenseCategory(r.category) ? r.category : "other",
    amount: num(r.amount),
  }));
}

export interface ManualEntry {
  id: number;
  characterId: number | null;
  characterName: string | null;
  date: string;
  spreadDays: number;
  category: ExpenseCategory;
  description: string;
  amount: number;
}

/** Manual entries of the account overlapping the range, newest first. */
export async function getManualEntries(userId: string, from: string, to: string): Promise<ManualEntry[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT e.id, e.character_id, ch.name AS character_name, to_char(e.date, 'YYYY-MM-DD') AS date, e.spread_days,
           e.category, e.description, e.amount
    FROM mining_pnl_entries e
    LEFT JOIN characters ch ON ch.character_id = e.character_id
    WHERE e.user_id = ${userId}::uuid AND e.date <= ${to}::date AND e.date + (e.spread_days - 1) >= ${from}::date
    ORDER BY e.date DESC, e.id DESC
    LIMIT 500`);
  return rows.map((r) => ({
    id: num(r.id),
    characterId: r.character_id === null ? null : num(r.character_id),
    characterName: str(r.character_name),
    date: String(r.date),
    spreadDays: num(r.spread_days),
    category: isExpenseCategory(r.category) ? r.category : "other",
    description: String(r.description ?? ""),
    amount: num(r.amount),
  }));
}

export interface PriceRule {
  id: number;
  typeId: number;
  typeName: string | null;
  unitPrice: number;
  validFrom: string | null;
  validTo: string | null;
}

export async function getPriceRules(userId: string): Promise<PriceRule[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT r.id, r.type_id, t.name AS type_name, r.unit_price,
           to_char(r.valid_from, 'YYYY-MM-DD') AS valid_from, to_char(r.valid_to, 'YYYY-MM-DD') AS valid_to
    FROM mining_pnl_price_rules r
    LEFT JOIN eve_types t ON t.type_id = r.type_id
    WHERE r.user_id = ${userId}::uuid
    ORDER BY t.name, r.valid_from NULLS FIRST, r.id`);
  return rows.map((r) => ({
    id: num(r.id),
    typeId: num(r.type_id),
    typeName: str(r.type_name),
    unitPrice: num(r.unit_price),
    validFrom: str(r.valid_from),
    validTo: str(r.valid_to),
  }));
}

export interface SaleHint {
  typeId: number;
  typeName: string;
  /** Realised ISK per raw unit from your wallet sells of the ore and its compressed variant. */
  rawUnitPrice: number;
  rawUnits: number;
  isk: number;
  sales: number;
  /** Current dashboard value per raw unit, for comparison. */
  baseUnitPrice: number | null;
}

/**
 * What you actually got for the ores you mined: wallet sell transactions of
 * the raw ore or its compressed variant, converted to raw units with the same
 * compression ratio as the valuation (src/core/eve/prices.ts).
 */
export async function getSaleHints(s: PnlScope, range: { from: string; to: string }): Promise<SaleHint[]> {
  if (!s.characterIds.length) return [];
  const { start, end } = utcDayBounds(range.from, range.to);
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    WITH ore AS (
      SELECT DISTINCT l.type_id FROM mining_character_ledger l
      WHERE l.character_id IN (${list(s.characterIds)}) AND l.date BETWEEN ${range.from}::date AND ${range.to}::date
    ),
    variants AS (
      SELECT r.type_id AS raw_id, r.type_id AS sold_id, 1.0::float8 AS ratio
      FROM eve_types r JOIN ore ON ore.type_id = r.type_id
      UNION ALL
      SELECT r.type_id, r.compressed_type_id, r.portion_size::float8 / NULLIF(c.portion_size, 0)
      FROM eve_types r JOIN ore ON ore.type_id = r.type_id JOIN eve_types c ON c.type_id = r.compressed_type_id
      WHERE r.portion_size IS NOT NULL
    )
    SELECT v.raw_id AS type_id, t.name AS type_name,
           (SUM(w.quantity * w.unit_price) / NULLIF(SUM(w.quantity * v.ratio), 0))::float8 AS raw_unit_price,
           SUM(w.quantity * v.ratio)::float8 AS raw_units,
           SUM(w.quantity * w.unit_price)::float8 AS isk,
           COUNT(*)::int AS sales,
           MAX(tv.unit_price)::float8 AS base_unit_price
    FROM wallet_transactions w
    JOIN variants v ON v.sold_id = w.type_id AND v.ratio IS NOT NULL
    JOIN eve_types t ON t.type_id = v.raw_id
    LEFT JOIN type_values tv ON tv.type_id = v.raw_id AND tv.source = ${s.valuation.source}
    WHERE w.user_id = ${s.userId}::uuid AND w.character_id IN (${list(s.characterIds)}) AND NOT w.is_buy
      AND w.date >= ${start}::timestamptz AND w.date < ${end}::timestamptz ${internalTrade(s)}
    GROUP BY 1, 2
    ORDER BY isk DESC`);
  return rows
    .filter((r) => num(r.raw_units) > 0)
    .map((r) => ({
      typeId: num(r.type_id),
      typeName: String(r.type_name),
      rawUnitPrice: num(r.raw_unit_price),
      rawUnits: num(r.raw_units),
      isk: num(r.isk),
      sales: num(r.sales),
      baseUnitPrice: r.base_unit_price === null ? null : num(r.base_unit_price),
    }));
}

/** Ore types the account mined recently (for the price rule picker). */
export async function getMinedTypes(characterIds: number[], since: string): Promise<{ id: number; name: string }[]> {
  if (!characterIds.length) return [];
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT DISTINCT l.type_id, t.name
    FROM mining_character_ledger l JOIN eve_types t ON t.type_id = l.type_id
    WHERE l.character_id IN (${list(characterIds)}) AND l.date >= ${since}::date
    ORDER BY t.name`);
  return rows.map((r) => ({ id: num(r.type_id), name: String(r.name) }));
}

export async function getPnlSettings(userId: string): Promise<{ ratePct: number }> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT income_rate_pct FROM mining_pnl_settings WHERE user_id = ${userId}::uuid`);
  return { ratePct: rows[0] ? num(rows[0].income_rate_pct) : 100 };
}

export interface WalletCharacterStatus {
  characterId: number;
  name: string;
  /** The character's token currently carries the wallet scope. */
  granted: boolean;
  /** Switched off in Keystar while the token still holds the scope: can be switched back on without an EVE login. */
  switchedOff: boolean;
  grantedScopes: string[];
  tokenStatus: "active" | "invalid" | null;
  autoInclude: boolean;
  jobEnabled: boolean;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  transactions: number;
  firstTransactionAt: Date | null;
  lastTransactionAt: Date | null;
  activitySince: Date | null;
  activityLastObservedAt: Date | null;
}


/** Wallet import and activity tracking state of each of the account's characters. */
export async function getWalletStatus(userId: string): Promise<WalletCharacterStatus[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, t.scopes, t.disabled_scopes, t.status AS token_status,
           COALESCE(pc.auto_include_expenses, false) AS auto_include,
           j.enabled AS job_enabled, j.last_success_at, j.last_status, j.last_error,
           w.n AS transactions, w.first_at, w.last_at,
           cov.since AS activity_since, cov.last_observed_at
    FROM characters c
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN mining_pnl_characters pc ON pc.user_id = c.user_id AND pc.character_id = c.character_id
    LEFT JOIN sync_jobs j
      ON j.job_key = 'wallet.character-transactions' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n, MIN(date) AS first_at, MAX(date) AS last_at
      FROM wallet_transactions wt WHERE wt.character_id = c.character_id AND wt.user_id = c.user_id
    ) w ON true
    LEFT JOIN mining_activity_coverage cov ON cov.character_id = c.character_id
    JOIN users u ON u.id = c.user_id
    WHERE c.user_id = ${userId}::uuid
    ORDER BY c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);
  return rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    return {
      characterId: num(r.character_id),
      name: String(r.name),
      granted: scopes.includes(WALLET_SCOPE),
      // A revoked token can't be switched back on in Keystar; it needs the EVE login.
      switchedOff:
        r.token_status === "active" && Array.isArray(r.disabled_scopes) && (r.disabled_scopes as string[]).includes(WALLET_SCOPE),
      grantedScopes: scopes,
      tokenStatus: r.token_status === "active" || r.token_status === "invalid" ? r.token_status : null,
      autoInclude: Boolean(r.auto_include),
      jobEnabled: Boolean(r.job_enabled),
      lastSuccessAt: toDate(r.last_success_at),
      lastStatus: str(r.last_status),
      lastError: str(r.last_error),
      transactions: num(r.transactions),
      firstTransactionAt: toDate(r.first_at),
      lastTransactionAt: toDate(r.last_at),
      activitySince: toDate(r.activity_since),
      activityLastObservedAt: toDate(r.last_observed_at),
    };
  });
}

/** Default window for wallet sale hints on the settings page. */
export const HINT_DAYS = 90;
export function hintRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -(HINT_DAYS - 1)), to: today };
}

