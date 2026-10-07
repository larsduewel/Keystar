import "server-only";
import { ensureNames, ensureTypes } from "@/core/eve/resolver";
import { env } from "@/core/env";
import { createLogger, errorMessage } from "@/core/logger";
import { lookupDisplayNames, type DisplayNames } from "@/modules/intel/names";
import { checkRoute, feedHealth, routeGates, type FeedHealth, type RouteCheck } from "./check";
import { NEARBY_MS, PREDICTION_DAYS, SECONDS_PER_JUMP, WINDOW_HOURS } from "./constants";
import { resolveQuery, type GatecheckQuery, type ResolvedQuery } from "./params";
import { arrivalTimes, historyDays, predictRoute, routeRegulars, type SystemPrediction } from "./predict";
import { killsAtGates, killsByPilots, killsInSystems, loadFeedStatus, systemRegions, typeGroups } from "./queries";
import { planRoute, securityMix } from "./route";
import { getUniverse } from "./universe-data";

const log = createLogger("gatecheck");
const DAY = 86_400_000;
/** Names looked up on ESI per check at most (the rest show as ids until the next check). */
const MAX_NAME_LOOKUPS = 600;

export interface FeedSummary {
  health: FeedHealth;
  coverageSince: Date | null;
  caughtUpAt: Date | null;
  historySince: Date | null;
  historyDays: number;
}

export interface GatecheckResult {
  resolved: ResolvedQuery;
  route: number[] | null;
  mix: Record<"high" | "low" | "null", number>;
  etas: Date[];
  check: RouteCheck;
  predictions: SystemPrediction[];
  feed: FeedSummary;
  names: DisplayNames;
  regions: Map<number, string>;
  /** Names of the route's systems, their neighbours and where regulars were seen (static data). */
  systemNames: Map<number, string>;
  now: Date;
}

/** Ids a result shows that need names. */
function shownIds(check: RouteCheck, predictions: SystemPrediction[]) {
  const types = new Set<number>();
  const entities = new Set<number>();
  for (const s of check.systems) {
    for (const k of [...s.routeKills, ...s.otherKills.slice(0, 10)]) {
      types.add(k.victimShipTypeId);
      for (const id of [k.victimCharacterId, k.victimCorporationId, k.victimAllianceId]) if (id) entities.add(id);
      for (const a of k.attackers.slice(0, 10)) {
        if (a.shipTypeId) types.add(a.shipTypeId);
        if (a.characterId) entities.add(a.characterId);
        const group = a.allianceId || a.corporationId;
        if (group) entities.add(group);
      }
    }
  }
  for (const p of predictions) {
    for (const r of p.regulars) {
      entities.add(r.characterId);
      if (r.corporationId) entities.add(r.corporationId);
      if (r.allianceId) entities.add(r.allianceId);
      r.shipTypeIds.forEach((t) => types.add(t));
    }
    for (const g of p.groups) entities.add(g.id);
    for (const s of p.sightings) if (s.shipTypeId) types.add(s.shipTypeId);
  }
  return { types: [...types], entities: [...entities] };
}

/**
 * Plans the route and checks it: kills along it in the chosen window (live
 * from the database the live feed keeps current) and camp estimates for the
 * time each gate is reached. Names missing from the cache are looked up on
 * ESI (public, bounded); zKillboard is never asked from here.
 */
export async function runGatecheck(q: GatecheckQuery, now = new Date()): Promise<GatecheckResult | null> {
  const u = getUniverse();
  const resolved = resolveQuery(u, q);
  if (!resolved.from || !resolved.to) return null;
  const route = planRoute(u, resolved.from.id, resolved.to.id, {
    preference: q.preference,
    avoid: new Set(resolved.avoid.map((s) => s.id)),
  });
  const feed = await loadFeedStatus();
  const days = historyDays(feed.historySince, now, PREDICTION_DAYS);
  const feedSummary: FeedSummary = {
    health: feedHealth(feed, now),
    coverageSince: feed.coverageSince,
    caughtUpAt: feed.caughtUpAt,
    historySince: feed.historySince,
    historyDays: days,
  };
  if (!route) {
    return {
      resolved,
      route: null,
      mix: { high: 0, low: 0, null: 0 },
      etas: [],
      check: {
        systems: [],
        windowHours: WINDOW_HOURS,
        feed: feedSummary.health,
      },
      predictions: [],
      feed: feedSummary,
      names: await lookupDisplayNames({}),
      regions: new Map(),
      systemNames: new Map([resolved.from, resolved.to].map((sys) => [sys.id, sys.name])),
      now,
    };
  }

  // Departing now, at about a minute a jump.
  const etas = arrivalTimes(route, now, SECONDS_PER_JUMP);
  const gateIds = route.flatMap((_, i) => {
    const g = routeGates(u, route, i);
    return [g.entryGateId, g.exitGateId].filter((id): id is number => id !== null);
  });
  const [recent, history] = await Promise.all([
    killsInSystems(route, new Date(now.getTime() - WINDOW_HOURS * 3600_000)),
    days > 0 ? killsAtGates(route, gateIds, new Date(now.getTime() - days * DAY)) : Promise.resolve([]),
  ]);
  const regulars = routeRegulars(u, route, history, { now, days, etas });
  const sightings = await killsByPilots([...regulars], new Date(now.getTime() - NEARBY_MS));

  const typeIds = new Set<number>();
  for (const k of [...recent, ...history, ...sightings]) {
    typeIds.add(k.victimShipTypeId);
    k.attackerShipTypeIds.forEach((t) => typeIds.add(t));
    k.attackerWeaponTypeIds.forEach((t) => typeIds.add(t));
  }
  const groups = await typeGroups(typeIds);
  const groupOf = (typeId: number) => groups.get(typeId);

  const check = checkRoute(u, route, recent, {
    now,
    windowHours: WINDOW_HOURS,
    feed,
    groupOf,
  });
  const predictions = predictRoute(u, route, check, history, sightings, {
    now,
    days,
    etas,
    groupOf,
  });

  const ids = shownIds(check, predictions);
  if (!env().KEYSTAR_DEMO_MODE) {
    try {
      await ensureTypes(ids.types, { maxLookups: 50, errorHeadroom: 50 });
      await ensureNames(ids.entities.slice(0, MAX_NAME_LOOKUPS));
    } catch (err) {
      log.warn("Could not name gate check entities", {
        error: errorMessage(err),
      });
    }
  }
  const [names, regions] = await Promise.all([lookupDisplayNames({ typeIds: ids.types, entityIds: ids.entities }), systemRegions(route)]);
  const systemIds = new Set(route.flatMap((id) => [id, ...(u.neighbours.get(id) ?? [])]));
  for (const p of predictions) for (const s of p.sightings) systemIds.add(s.systemId);
  const systemNames = new Map([...systemIds].map((id) => [id, u.systems.get(id)?.name ?? String(id)]));
  return {
    resolved,
    route,
    mix: securityMix(u, route),
    etas,
    check,
    predictions,
    feed: feedSummary,
    names,
    regions,
    systemNames,
    now,
  };
}
