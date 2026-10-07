import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/core/db";
import { likePattern, MEMBER_PAGE_SIZE, type MemberAuditParams, type MemberFilter } from "./member-audit-filters";

export interface MemberAuditStats {
  /** False until a roster token has synced the in-game member list. */
  rosterKnown: boolean;
  roster: number;
  registered: number;
  unregistered: number;
  /**
   * Registered characters whose token is revoked or lacks a required scope. A character without a token only counts
   * while some scope is required of every member (none is: every character scope is opt-in).
   */
  esiTrouble: number;
  /** Rows matching the current search and filter. */
  matched: number;
  /** Main character of the account the view is limited to, if any. */
  accountName: string | null;
}

export interface MemberAuditRow {
  id: string;
  name: string | null;
  inRoster: boolean;
  registered: boolean;
  mainName: string | null;
  status: string | null;
  scopes: string[];
}

function pgTextArray(values: readonly string[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * The in-game roster and the characters registered in the home corporation,
 * side by side: a member may be on the roster without being registered, and a
 * registered character may be missing from a stale or unavailable roster.
 */
function auditCte(home: number, requiredScopes: readonly string[]) {
  return sql`
    WITH roster AS (SELECT character_id FROM corporation_members WHERE corporation_id = ${home}),
    corp_chars AS (SELECT * FROM characters WHERE corporation_id = ${home}),
    known AS (SELECT EXISTS (SELECT 1 FROM roster) AS roster_known),
    audit AS (
      SELECT COALESCE(r.character_id, c.character_id) AS id,
             COALESCE(c.name, e.name) AS name,
             (r.character_id IS NOT NULL) AS in_roster,
             (c.character_id IS NOT NULL) AS registered,
             c.user_id, mc.name AS main_name, t.status, t.scopes,
             (c.character_id IS NOT NULL AND (t.status IS NOT DISTINCT FROM 'invalid'
               OR NOT (COALESCE(t.scopes, '{}') @> ${pgTextArray(requiredScopes)}))) AS esi_trouble
      FROM roster r
      FULL OUTER JOIN corp_chars c ON c.character_id = r.character_id
      LEFT JOIN eve_entities e ON e.id = r.character_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN characters mc ON mc.character_id = u.main_character_id
      LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    )`;
}

// Each filter matches exactly what its stat tile counts. `a` is the audit row, `k` the roster flag.
const FILTERS: Record<MemberFilter, SQL> = {
  all: sql`TRUE`,
  roster: sql`a.in_roster`,
  registered: sql`a.registered AND (a.in_roster OR NOT k.roster_known)`,
  unregistered: sql`a.in_roster AND NOT a.registered`,
  esi: sql`a.esi_trouble`,
};

function matchWhere(params: MemberAuditParams): SQL {
  const account = params.account ? sql` AND a.user_id = ${params.account}::uuid` : sql``;
  if (!params.q) return sql`${FILTERS[params.filter]}${account}`;
  const like = likePattern(params.q);
  const byId = /^\d{1,19}$/.test(params.q) ? sql` OR a.id::text = ${params.q}` : sql``;
  return sql`${FILTERS[params.filter]}${account} AND (a.name ILIKE ${like} OR a.main_name ILIKE ${like}${byId})`;
}

export async function getMemberAuditStats(
  home: number,
  requiredScopes: readonly string[],
  params: MemberAuditParams,
): Promise<MemberAuditStats> {
  const [row] = await getDb().execute<Record<string, unknown>>(sql`
    ${auditCte(home, requiredScopes)}
    SELECT k.roster_known,
           COUNT(a.id) FILTER (WHERE ${FILTERS.roster})::int AS roster,
           COUNT(a.id) FILTER (WHERE ${FILTERS.registered})::int AS registered,
           COUNT(a.id) FILTER (WHERE ${FILTERS.unregistered})::int AS unregistered,
           COUNT(a.id) FILTER (WHERE ${FILTERS.esi})::int AS esi_trouble,
           COUNT(a.id) FILTER (WHERE ${matchWhere(params)})::int AS matched,
           ${
             params.account
               ? sql`(SELECT mc.name FROM users u JOIN characters mc ON mc.character_id = u.main_character_id
                      WHERE u.id = ${params.account}::uuid)`
               : sql`NULL`
           } AS account_name
    FROM known k LEFT JOIN audit a ON TRUE
    GROUP BY k.roster_known`);
  return {
    rosterKnown: Boolean(row?.roster_known),
    roster: Number(row?.roster ?? 0),
    registered: Number(row?.registered ?? 0),
    unregistered: Number(row?.unregistered ?? 0),
    esiTrouble: Number(row?.esi_trouble ?? 0),
    matched: Number(row?.matched ?? 0),
    accountName: row?.account_name == null ? null : String(row.account_name),
  };
}

/** One page of the audit: registered characters first, then by name, ignoring case. */
export async function getMemberAuditPage(
  home: number,
  requiredScopes: readonly string[],
  params: MemberAuditParams,
): Promise<MemberAuditRow[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    ${auditCte(home, requiredScopes)}
    SELECT a.id::text AS id, a.name, a.in_roster, a.registered, a.main_name, a.status, a.scopes
    FROM audit a CROSS JOIN known k
    WHERE ${matchWhere(params)}
    ORDER BY a.registered DESC, lower(a.name) NULLS LAST, a.name, a.id
    LIMIT ${MEMBER_PAGE_SIZE} OFFSET ${(params.page - 1) * MEMBER_PAGE_SIZE}`);
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name == null ? null : String(r.name),
    inRoster: Boolean(r.in_roster),
    registered: Boolean(r.registered),
    mainName: r.main_name == null ? null : String(r.main_name),
    status: r.status == null ? null : String(r.status),
    scopes: Array.isArray(r.scopes) ? r.scopes.map(String) : [],
  }));
}
