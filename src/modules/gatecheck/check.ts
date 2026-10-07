import { ACTIVE_CAMP_MS, FEED_FRESH_MS, FEED_STALE_MS } from "./constants";
import type { GatecheckKillRow } from "./schema";
import { killTags, mergeTags, type GroupOf, type KillTag } from "./tags";
import { gateTo, type Universe } from "./universe";

/**
 * The gate check: what happened along a route in the last hours, gate by gate.
 * For every system it tells kills at the gates the route uses (the one you
 * arrive at and the one you leave by) from kills at its other gates and away
 * from gates, tags what the camp used, and sums it up as a status. Pure.
 */
export type KillRecord = Pick<
  GatecheckKillRow,
  | "killmailId"
  | "killmailTime"
  | "solarSystemId"
  | "gateId"
  | "gateDistanceM"
  | "victimCharacterId"
  | "victimCorporationId"
  | "victimAllianceId"
  | "victimShipTypeId"
  | "totalValue"
  | "attackerCount"
  | "attackerCharacterIds"
  | "attackerCorporationIds"
  | "attackerAllianceIds"
  | "attackerShipTypeIds"
  | "attackerWeaponTypeIds"
  | "npc"
  | "concord"
>;

export type FeedHealth = "fresh" | "delayed" | "offline";

export interface FeedStatus {
  coverageSince: Date | null;
  caughtUpAt: Date | null;
}

export function feedHealth(feed: FeedStatus | null, now: Date): FeedHealth {
  if (!feed?.caughtUpAt) return "offline";
  const age = now.getTime() - feed.caughtUpAt.getTime();
  return age <= FEED_FRESH_MS ? "fresh" : age <= FEED_STALE_MS ? "delayed" : "offline";
}

/** Where a kill was, seen from the route: at the gate you arrive by, the gate you leave by, another gate or off the gates. */
export type KillPlace = "entry" | "exit" | "gate" | "elsewhere";

export interface CheckedKill {
  killmailId: number;
  time: Date;
  place: KillPlace;
  gateId: number | null;
  /** The system the gate leads to. */
  gateDestinationId: number | null;
  distanceKm: number | null;
  victimCharacterId: number | null;
  victimCorporationId: number | null;
  victimAllianceId: number | null;
  victimShipTypeId: number;
  value: number;
  attackerCount: number;
  /** Player attackers, aligned (0 = unknown). */
  attackers: {
    characterId: number;
    corporationId: number;
    allianceId: number;
    shipTypeId: number;
  }[];
  npc: boolean;
  tags: KillTag[];
}

/**
 * camp: a player kill at a route gate in the last 30 minutes, or three within the hour.
 * recent: player kills at a route gate in the window.
 * activity: player kills elsewhere in the system (other gates, off the gates).
 * quiet: nothing in the window, and the feed is up to date.
 * unknown: nothing in the window, but the feed is behind, so that means little.
 */
export type SystemStatus = "camp" | "recent" | "activity" | "quiet" | "unknown";
export const STATUS_ORDER: SystemStatus[] = ["camp", "recent", "activity", "unknown", "quiet"];

export interface SystemCheck {
  systemId: number;
  index: number;
  security: number;
  /** Gate you arrive at (null at the start) and gate you leave by (null at the destination). */
  entryGateId: number | null;
  exitGateId: number | null;
  previousId: number | null;
  nextId: number | null;
  /** Kills at the route's gates, newest first (NPC-only kills included, flagged). */
  routeKills: CheckedKill[];
  /** Player kills elsewhere in the system, newest first. */
  otherKills: CheckedKill[];
  /** Kills with only NPCs on the mail, anywhere in the system. */
  npcKills: number;
  lastRouteKill: Date | null;
  /** What the camp at the route gates used, and what showed up anywhere in the system. */
  routeTags: KillTag[];
  systemTags: KillTag[];
  status: SystemStatus;
}

export interface RouteCheck {
  systems: SystemCheck[];
  windowHours: number;
  feed: FeedHealth;
}

export function toCheckedKill(k: KillRecord, place: KillPlace, u: Universe, groupOf: GroupOf): CheckedKill {
  const gate = k.gateId === null ? null : (u.gates.get(k.solarSystemId)?.find((g) => g.id === k.gateId) ?? null);
  return {
    killmailId: k.killmailId,
    time: k.killmailTime,
    place,
    gateId: k.gateId,
    gateDestinationId: gate?.destinationId ?? null,
    distanceKm: k.gateDistanceM === null ? null : k.gateDistanceM / 1000,
    victimCharacterId: k.victimCharacterId,
    victimCorporationId: k.victimCorporationId,
    victimAllianceId: k.victimAllianceId,
    victimShipTypeId: k.victimShipTypeId,
    value: k.totalValue,
    attackerCount: k.attackerCount,
    attackers: k.attackerCharacterIds.map((characterId, i) => ({
      characterId,
      corporationId: k.attackerCorporationIds[i] ?? 0,
      allianceId: k.attackerAllianceIds[i] ?? 0,
      shipTypeId: k.attackerShipTypeIds[i] ?? 0,
    })),
    npc: k.npc,
    tags: killTags(k, groupOf),
  };
}

/** The gates a route uses in its `index`th system. */
export function routeGates(u: Universe, route: readonly number[], index: number) {
  const id = route[index];
  const previousId = index > 0 ? route[index - 1] : null;
  const nextId = index < route.length - 1 ? route[index + 1] : null;
  return {
    previousId,
    nextId,
    entryGateId: previousId === null ? null : (gateTo(u, id, previousId)?.id ?? null),
    exitGateId: nextId === null ? null : (gateTo(u, id, nextId)?.id ?? null),
  };
}

export function checkRoute(
  u: Universe,
  route: readonly number[],
  kills: readonly KillRecord[],
  opts: {
    now: Date;
    windowHours: number;
    feed: FeedStatus | null;
    groupOf: GroupOf;
  },
): RouteCheck {
  const since = opts.now.getTime() - opts.windowHours * 3600_000;
  const health = feedHealth(opts.feed, opts.now);
  const bySystem = new Map<number, KillRecord[]>();
  for (const k of kills) {
    const t = k.killmailTime.getTime();
    if (t < since || t > opts.now.getTime() + 60_000) continue;
    const list = bySystem.get(k.solarSystemId) ?? [];
    list.push(k);
    bySystem.set(k.solarSystemId, list);
  }
  const systems = route.map((systemId, index): SystemCheck => {
    const gates = routeGates(u, route, index);
    const local = (bySystem.get(systemId) ?? []).sort((a, b) => b.killmailTime.getTime() - a.killmailTime.getTime());
    const routeKills: CheckedKill[] = [];
    const otherKills: CheckedKill[] = [];
    let npcKills = 0;
    for (const k of local) {
      if (k.npc) npcKills += 1;
      const place: KillPlace =
        k.gateId === null ? "elsewhere" : k.gateId === gates.entryGateId ? "entry" : k.gateId === gates.exitGateId ? "exit" : "gate";
      if (place === "entry" || place === "exit") routeKills.push(toCheckedKill(k, place, u, opts.groupOf));
      else if (!k.npc || k.concord) otherKills.push(toCheckedKill(k, place, u, opts.groupOf));
    }
    const playerRouteKills = routeKills.filter((k) => !k.npc);
    const lastRouteKill = playerRouteKills[0]?.time ?? null;
    const hourAgo = opts.now.getTime() - 3600_000;
    const camp =
      lastRouteKill !== null &&
      (opts.now.getTime() - lastRouteKill.getTime() <= ACTIVE_CAMP_MS ||
        playerRouteKills.filter((k) => k.time.getTime() >= hourAgo).length >= 3);
    const status: SystemStatus = camp
      ? "camp"
      : playerRouteKills.length
        ? "recent"
        : otherKills.some((k) => !k.npc)
          ? "activity"
          : health === "fresh"
            ? "quiet"
            : "unknown";
    return {
      systemId,
      index,
      security: u.systems.get(systemId)?.security ?? 0,
      ...gates,
      routeKills,
      otherKills,
      npcKills,
      lastRouteKill,
      routeTags: mergeTags(routeKills.map((k) => k.tags)),
      systemTags: mergeTags([...routeKills, ...otherKills].map((k) => k.tags)),
      status,
    };
  });
  return { systems, windowHours: opts.windowHours, feed: health };
}
