import { NEARBY_JUMPS, NEARBY_MS, REGULAR_MIN_DAYS } from "./constants";
import type { KillRecord, RouteCheck } from "./check";
import { routeGates } from "./check";
import { killTags, KILL_TAGS, type GroupOf, type KillTag } from "./tags";
import { jumpsWithin, type Universe } from "./universe";

/**
 * Camp estimates for the time you pass each gate, from the stored history of
 * kills at the route's gates. Three signals, each explained on the page:
 *
 * - history: on how many of the last days there were kills at these gates
 *   within an hour of the time of day you get there (smoothed, so one quiet
 *   month does not read as "never"),
 * - live: a camp seen there now, fading with the time until you arrive
 *   (half-life 45 minutes),
 * - regulars: pilots who camped these gates on several days, seen killing
 *   within a few jumps in the last two hours, other than at these gates
 *   (fading with the time since).
 *
 * They combine as independent chances: 1 − (1 − history)(1 − live)(1 − regulars).
 * It is an estimate from public killmails, not a forecast: camps that kill
 * nothing leave no trace. Pure.
 */
const DAY = 86_400_000;
const NEAR_ETA_MS = 60 * 60_000;
const REGULAR_HOURS_MS = 2 * 3600_000;
const LIVE_HALF_LIFE_MIN = 45;
const SIGHTING_HALF_LIFE_MIN = 60;
const MAX_REGULARS = 8;

export type RiskLevel = "low" | "moderate" | "high" | "severe";
/** none: under 3 days of history; limited: under 14 days; good: 14 days or more. */
export type Confidence = "none" | "limited" | "good";

export interface Regular {
  characterId: number;
  corporationId: number;
  allianceId: number;
  /** Distinct days with kills at these gates, and the kills. */
  days: number;
  kills: number;
  lastSeen: Date;
  /** Hulls flown there, most used first. */
  shipTypeIds: number[];
  /** UTC hours with the most kills, busiest first. */
  hours: number[];
  /** Has killed there on a previous day within two hours of the time of day you arrive. */
  nearEta: boolean;
}

export interface Sighting {
  characterId: number;
  systemId: number;
  jumps: number;
  time: Date;
  shipTypeId: number;
}

export interface SystemPrediction {
  systemId: number;
  index: number;
  eta: Date;
  historyDays: number;
  confidence: Confidence;
  /** Days with kills at the route gates within an hour of the arrival time of day. */
  activeDays: number;
  /** Days with any kill at the route gates. */
  campDays: number;
  /** Kills at the route gates per UTC hour of day over the history. */
  hourly: number[];
  tagCounts: Partial<Record<KillTag, number>>;
  regulars: Regular[];
  /** Alliances (or corporations without one) behind the most kills there. */
  groups: { id: number; kills: number }[];
  /** Regulars of these gates seen killing within NEARBY_JUMPS jumps recently. */
  sightings: Sighting[];
  factors: { history: number; live: number; regulars: number };
  chance: number;
  level: RiskLevel;
}

export function riskLevel(chance: number): RiskLevel {
  return chance < 0.1 ? "low" : chance < 0.3 ? "moderate" : chance < 0.6 ? "high" : "severe";
}

export function confidenceOf(historyDays: number): Confidence {
  return historyDays < 3 ? "none" : historyDays < 14 ? "limited" : "good";
}

/** Whole days of history to use: from the oldest stored kill, at most `maxDays`. */
export function historyDays(historySince: Date | null, now: Date, maxDays: number): number {
  if (!historySince) return 0;
  return Math.max(0, Math.min(maxDays, Math.floor((now.getTime() - historySince.getTime()) / DAY)));
}

/** Kills that tell of a camp: players on the mail, or CONCORD (a gank). */
const isCampKill = (k: KillRecord) => !k.npc || k.concord;

/** Time-of-day distance in milliseconds (0 to 12 hours). */
function timeOfDayGap(a: number, b: number): number {
  const d = (((a - b) % DAY) + DAY) % DAY;
  return Math.min(d, DAY - d);
}

const topKeys = (counts: Map<number, number>, n: number) =>
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, n)
    .map(([k]) => k);

function regularsAt(kills: readonly KillRecord[], eta: Date): Regular[] {
  const byPilot = new Map<
    number,
    {
      days: Set<number>;
      kills: number;
      last: KillRecord;
      lastIndex: number;
      ships: Map<number, number>;
      hours: Map<number, number>;
      nearEta: boolean;
    }
  >();
  for (const k of kills) {
    const t = k.killmailTime.getTime();
    k.attackerCharacterIds.forEach((characterId, i) => {
      if (!characterId) return;
      const p = byPilot.get(characterId) ?? {
        days: new Set(),
        kills: 0,
        last: k,
        lastIndex: i,
        ships: new Map(),
        hours: new Map(),
        nearEta: false,
      };
      p.days.add(Math.floor(t / DAY));
      p.kills += 1;
      if (t >= p.last.killmailTime.getTime()) {
        p.last = k;
        p.lastIndex = i;
      }
      const ship = k.attackerShipTypeIds[i];
      if (ship) p.ships.set(ship, (p.ships.get(ship) ?? 0) + 1);
      const hour = k.killmailTime.getUTCHours();
      p.hours.set(hour, (p.hours.get(hour) ?? 0) + 1);
      // Previous days only: today's kills are the live signal, not a habit.
      if (eta.getTime() - t >= DAY - REGULAR_HOURS_MS && timeOfDayGap(t, eta.getTime()) <= REGULAR_HOURS_MS) p.nearEta = true;
      byPilot.set(characterId, p);
    });
  }
  return [...byPilot.entries()]
    .filter(([, p]) => p.days.size >= REGULAR_MIN_DAYS)
    .map(([characterId, p]) => ({
      characterId,
      corporationId: p.last.attackerCorporationIds[p.lastIndex] ?? 0,
      allianceId: p.last.attackerAllianceIds[p.lastIndex] ?? 0,
      days: p.days.size,
      kills: p.kills,
      lastSeen: p.last.killmailTime,
      shipTypeIds: topKeys(p.ships, 3),
      hours: topKeys(p.hours, 3),
      nearEta: p.nearEta,
    }))
    .sort((a, b) => Number(b.nearEta) - Number(a.nearEta) || b.days - a.days || b.kills - a.kills || a.characterId - b.characterId)
    .slice(0, MAX_REGULARS);
}

/** History kills at the gates the route uses in its `index`th system. */
function routeGateHistory(
  u: Universe,
  route: readonly number[],
  index: number,
  history: readonly KillRecord[],
  since: number,
  until: number,
) {
  const { entryGateId, exitGateId } = routeGates(u, route, index);
  const gates = new Set([entryGateId, exitGateId].filter((g): g is number => g !== null));
  return history.filter((k) => {
    const t = k.killmailTime.getTime();
    return k.solarSystemId === route[index] && k.gateId !== null && gates.has(k.gateId) && t >= since && t < until && isCampKill(k);
  });
}

/** The regulars of every route system: whose kills elsewhere the page should look up as sightings. */
export function routeRegulars(
  u: Universe,
  route: readonly number[],
  history: readonly KillRecord[],
  opts: { now: Date; days: number; etas: Date[] },
): Set<number> {
  const since = opts.now.getTime() - opts.days * DAY;
  const ids = new Set<number>();
  route.forEach((_, index) => {
    for (const r of regularsAt(routeGateHistory(u, route, index, history, since, opts.now.getTime()), opts.etas[index]))
      ids.add(r.characterId);
  });
  return ids;
}

export function arrivalTimes(route: readonly number[], departure: Date, secondsPerJump: number): Date[] {
  return route.map((_, i) => new Date(departure.getTime() + i * secondsPerJump * 1000));
}

export function predictRoute(
  u: Universe,
  route: readonly number[],
  check: RouteCheck,
  history: readonly KillRecord[],
  recent: readonly KillRecord[],
  opts: { now: Date; days: number; etas: Date[]; groupOf: GroupOf },
): SystemPrediction[] {
  const now = opts.now.getTime();
  const since = now - opts.days * DAY;
  // Kills by regulars in the last two hours, anywhere (the page looked them up by pilot).
  const latestByPilot = new Map<number, { k: KillRecord; i: number }[]>();
  for (const k of recent) {
    if (k.killmailTime.getTime() < now - NEARBY_MS || !isCampKill(k)) continue;
    k.attackerCharacterIds.forEach((id, i) => {
      if (!id) return;
      const list = latestByPilot.get(id) ?? [];
      list.push({ k, i });
      latestByPilot.set(id, list);
    });
  }

  return route.map((systemId, index): SystemPrediction => {
    const eta = opts.etas[index];
    const kills = routeGateHistory(u, route, index, history, since, now);
    // Today's kills are the live signal; history starts with yesterday.
    const activeDays = new Set<number>();
    const campDays = new Set<number>();
    const hourly = Array.from({ length: 24 }, () => 0);
    const tagCounts: Partial<Record<KillTag, number>> = {};
    const groups = new Map<number, number>();
    for (const k of kills) {
      const t = k.killmailTime.getTime();
      campDays.add(Math.floor((now - t) / DAY));
      const back = Math.round((eta.getTime() - t) / DAY);
      if (back >= 1 && back <= opts.days && Math.abs(eta.getTime() - t - back * DAY) <= NEAR_ETA_MS) activeDays.add(back);
      hourly[k.killmailTime.getUTCHours()] += 1;
      for (const tag of killTags(k, opts.groupOf)) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      const owners = new Set(k.attackerCharacterIds.map((_, i) => k.attackerAllianceIds[i] || k.attackerCorporationIds[i]).filter(Boolean));
      for (const g of owners) groups.set(g, (groups.get(g) ?? 0) + 1);
    }
    const confidence = confidenceOf(opts.days);
    const fromHistory = confidence === "none" ? 0 : (activeDays.size + 0.5) / (opts.days + 1);

    const checked = check.systems[index];
    let live = 0;
    if (checked?.lastRouteKill) {
      const minutes = Math.max(0, (eta.getTime() - checked.lastRouteKill.getTime()) / 60_000);
      live = 0.85 * 0.5 ** (minutes / LIVE_HALF_LIFE_MIN);
    }
    const lastOther = checked?.otherKills.find((k) => !k.npc)?.time;
    if (lastOther) {
      const minutes = Math.max(0, (eta.getTime() - lastOther.getTime()) / 60_000);
      live = Math.max(live, 0.2 * 0.5 ** (minutes / LIVE_HALF_LIFE_MIN));
    }

    const regulars = regularsAt(kills, eta);
    const around = jumpsWithin(u, systemId, NEARBY_JUMPS);
    const { entryGateId, exitGateId } = routeGates(u, route, index);
    // Kills at this system's route gates are the live signal already; a sighting is anywhere else nearby.
    const isLive = (k: KillRecord) =>
      k.solarSystemId === systemId && k.gateId !== null && (k.gateId === entryGateId || k.gateId === exitGateId);
    const sightings: Sighting[] = [];
    for (const r of regulars) {
      const seen = (latestByPilot.get(r.characterId) ?? [])
        .filter(({ k }) => around.has(k.solarSystemId) && !isLive(k))
        .sort((a, b) => b.k.killmailTime.getTime() - a.k.killmailTime.getTime())[0];
      if (seen) {
        sightings.push({
          characterId: r.characterId,
          systemId: seen.k.solarSystemId,
          jumps: around.get(seen.k.solarSystemId)!,
          time: seen.k.killmailTime,
          shipTypeId: seen.k.attackerShipTypeIds[seen.i] ?? 0,
        });
      }
    }
    sightings.sort((a, b) => b.time.getTime() - a.time.getTime());
    let quiet = 1;
    for (const s of sightings.slice(0, 5)) {
      const minutes = Math.max(0, (eta.getTime() - s.time.getTime()) / 60_000);
      quiet *= 1 - 0.3 * 0.5 ** (minutes / SIGHTING_HALF_LIFE_MIN) * (1 - s.jumps / (NEARBY_JUMPS + 1));
    }
    const fromRegulars = 1 - quiet;

    const chance = 1 - (1 - fromHistory) * (1 - live) * (1 - fromRegulars);
    return {
      systemId,
      index,
      eta,
      historyDays: opts.days,
      confidence,
      activeDays: activeDays.size,
      campDays: campDays.size,
      hourly,
      tagCounts: Object.fromEntries(KILL_TAGS.filter((t) => tagCounts[t]).map((t) => [t, tagCounts[t]!])),
      regulars,
      groups: topKeys(groups, 3).map((id) => ({ id, kills: groups.get(id)! })),
      sightings,
      factors: { history: fromHistory, live, regulars: fromRegulars },
      chance,
      level: riskLevel(chance),
    };
  });
}
