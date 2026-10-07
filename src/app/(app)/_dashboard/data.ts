import { inArray, sql } from "drizzle-orm";
import type { CurrentUser } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { esiTokens, getDb, workerHeartbeats } from "@/core/db";
import { esiHealth, type EsiHealth } from "@/core/modules/registry";
import type { Settings } from "@/core/settings";
import { addDays } from "@/lib/dates";
import { isRecent } from "@/lib/format";
import { killboardQueryString, killboardWindows } from "@/modules/killboard/filters";
import { KILLBOARD_PERMISSIONS } from "@/modules/killboard/module";
import {
  getDailyActivity,
  getPilots,
  getRecentActivity,
  getTotals,
  type ActivityRow,
  type DailyActivity,
  type PilotRow,
  type Totals,
} from "@/modules/killboard/queries";
import { DATE_PRESETS, parseMiningFilters } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { getDailySeries, getMiningSummary, miningScope, type DailyPoint } from "@/modules/mining/queries";

/** Everything the dashboard shows, loaded once per request. */

export type MiningSummary = Awaited<ReturnType<typeof getMiningSummary>>;

export interface CombatData {
  /** The last 30 days against the 30 days before. */
  now: Totals;
  before: Totals;
  activity: DailyActivity[];
  /** Everyone who flew for the corporation, most kills first. */
  pilots: PilotRow[];
  recent: ActivityRow[];
  /** The killboard on the same 30 days rather than its 90-day default. */
  killboardHref: string;
}

export interface MiningData {
  /** Corporation mining, for viewers who may see it. */
  corp: MiningSummary | null;
  /** The viewer's own mining; only loaded when the dashboard doesn't lead with combat. */
  own: MiningSummary | null;
  daily: DailyPoint[];
}

export interface AccountData {
  homeCorp: Awaited<ReturnType<typeof getCorporation>>;
  /** Characters in the home corporation registered in Keystar, and the corporation's roster size (0 if unknown). */
  registered: number;
  members: number;
  /** ESI state of each of the viewer's characters. */
  health: Map<number, EsiHealth>;
  /** Characters whose ESI access is fine: a token in order, or none at all (every scope is opt-in). */
  healthy: number;
  workerOnline: boolean;
  /** Enabled sync jobs and how many are failing; null without `sync.view`. */
  sync: { total: number; failing: number } | null;
  /** Accounts waiting for approval; null without `users.manage`. */
  pendingGuests: number | null;
}

export interface DashboardData {
  /** The dashboard leads with combat when a home corporation is set and the viewer may see the killboard. */
  combat: CombatData | null;
  canMining: boolean;
  mining: MiningData;
  account: AccountData;
}

const RANGE_PRESET = "30d";

export async function loadDashboard(user: CurrentUser, settings: Settings, today: string): Promise<DashboardData> {
  const range = DATE_PRESETS.find((p) => p.id === RANGE_PRESET)!.range(today);
  const homeCorpId = settings["corp.homeCorporationId"];
  const combat = homeCorpId !== null && user.can(KILLBOARD_PERMISSIONS.view);
  const canMining = user.canAny(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const [combatData, mining, account] = await Promise.all([
    combat ? loadCombat(homeCorpId, range, today) : null,
    loadMining(user, settings, homeCorpId, range, today, { skipOwn: combat }),
    loadAccount(user, homeCorpId),
  ]);
  return { combat: combatData, canMining, mining, account };
}

async function loadCombat(corpId: number, range: { from: string; to: string }, today: string): Promise<CombatData> {
  const prior = { from: addDays(range.from, -30), to: addDays(range.from, -1) };
  const [now, before, activity, pilots, recent] = await Promise.all([
    getTotals(corpId, range),
    getTotals(corpId, prior),
    getDailyActivity(corpId, range),
    getPilots(corpId, killboardWindows(range, today)),
    getRecentActivity(corpId, range, 6),
  ]);
  return { now, before, activity, pilots, recent, killboardHref: `/killboard?${killboardQueryString(range)}` };
}

async function loadMining(
  user: CurrentUser,
  settings: Settings,
  homeCorpId: number | null,
  range: { from: string; to: string },
  today: string,
  opts: { skipOwn: boolean },
): Promise<MiningData> {
  const canMining = user.canAny(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const own = canMining && !opts.skipOwn;
  const filters = parseMiningFilters(range, today);
  const valuation = { source: settings["mining.valuationSource"], mode: settings["mining.valuationMode"] };
  const scope = miningScope(user, homeCorpId);
  const [corpSummary, ownSummary, daily] = await Promise.all([
    scope.corp ? getMiningSummary(filters, scope, valuation) : null,
    own ? getMiningSummary(filters, { ...scope, corp: false }, valuation) : null,
    own ? getDailySeries(filters, scope, valuation) : [],
  ]);
  return { corp: corpSummary, own: ownSummary, daily };
}

async function loadAccount(user: CurrentUser, homeCorpId: number | null): Promise<AccountData> {
  const db = getDb();
  const [tokens, syncRows, guestRows, homeCorp, corpRows, workers] = await Promise.all([
    user.characterIds.length ? db.select().from(esiTokens).where(inArray(esiTokens.characterId, user.characterIds)) : [],
    user.can("sync.view")
      ? db.execute<{ total: number; failing: number }>(
          sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE last_status = 'error')::int AS failing
              FROM sync_jobs WHERE enabled`,
        )
      : null,
    user.can("users.manage") ? db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'guest' AND NOT is_disabled`) : null,
    getCorporation(homeCorpId),
    db.execute<{ registered: number; roster: number }>(sql`
      SELECT (SELECT COUNT(*)::int FROM characters WHERE corporation_id = ${homeCorpId ?? 0}) AS registered,
             (SELECT COUNT(*)::int FROM corporation_members WHERE corporation_id = ${homeCorpId ?? 0}) AS roster`),
    db.select().from(workerHeartbeats),
  ]);
  const stats = corpRows[0] ?? { registered: 0, roster: 0 };
  // A character without ESI access is fine (every scope is opt-in); a revoked token or a missing required scope isn't.
  const health = new Map(user.characters.map((c) => [c.characterId, esiHealth(tokens.find((x) => x.characterId === c.characterId))]));
  return {
    homeCorp,
    registered: stats.registered,
    members: stats.roster || homeCorp?.memberCount || 0,
    health,
    healthy: [...health.values()].filter((h) => h === "ok" || h === "none").length,
    workerOnline: workers.some((w) => isRecent(w.lastBeatAt, 2 * 60_000)),
    sync: syncRows ? { total: syncRows[0]?.total ?? 0, failing: syncRows[0]?.failing ?? 0 } : null,
    pendingGuests: guestRows ? (guestRows[0]?.n ?? 0) : null,
  };
}
