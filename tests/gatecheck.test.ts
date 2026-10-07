import { describe, expect, it } from "vitest";
import { checkRoute, feedHealth, type KillRecord } from "@/modules/gatecheck/check";
import { locateKill, toGateKill } from "@/modules/gatecheck/classify";
import { gatecheckHref, parseQuery, resolveQuery } from "@/modules/gatecheck/params";
import { arrivalTimes, confidenceOf, historyDays, predictRoute, riskLevel, routeRegulars } from "@/modules/gatecheck/predict";
import { NO_TRANSIT, planRoute, securityMix, systemCost } from "@/modules/gatecheck/route";
import { killTags, mergeTags } from "@/modules/gatecheck/tags";
import { buildUniverse, findSystem, gateTo, jumpsWithin } from "@/modules/gatecheck/universe";
import { getUniverse } from "@/modules/gatecheck/universe-data";
import type { ZkillKillmail } from "@/modules/killboard/zkill";
import type { MapGate } from "@/modules/map/travel";

/**
 * A small network:  A(0.9) — B(0.3) — C(-0.2) — E(0.6)
 *                         \_ D(0.5) ______/
 * Gate ids are system*10 + destination; each gate sits at x = destination * 1e6.
 */
const SYSTEMS: [number, string, number, number, number, number][] = [
  [1, "Alpha", 0.9, 0, 0, 0],
  [2, "Bravo", 0.3, 0, 0, 0],
  [3, "Charlie", -0.2, 0, 0, 0],
  [4, "Delta", 0.5, 0, 0, 0],
  [5, "Echo", 0.6, 0, 0, 0],
];
const LINKS = [
  [1, 2],
  [2, 3],
  [2, 4],
  [3, 5],
  [4, 5],
];
const GATES: MapGate[] = LINKS.flatMap(([a, b]) => [
  [a * 10 + b, a, b, b * 10 + a, b * 1e6, 0, 0],
  [b * 10 + a, b, a, a * 10 + b, a * 1e6, 0, 0],
]);
const u = buildUniverse(SYSTEMS, GATES);
const NOW = new Date("2026-10-07T20:00:00Z");
const groups = new Map([
  [22456, 541], // Sabre
  [11995, 894], // Onyx
  [3955, 72], // smartbomb
  [670, 29], // capsule
  [22436, 898], // Widow
  [587, 25], // Rifter
]);
const groupOf = (id: number) => groups.get(id);

function record(over: Partial<KillRecord>): KillRecord {
  return {
    killmailId: 1,
    killmailTime: new Date(NOW.getTime() - 10 * 60_000),
    solarSystemId: 2,
    gateId: null,
    gateDistanceM: null,
    victimCharacterId: null,
    victimCorporationId: 9,
    victimAllianceId: null,
    victimShipTypeId: 587,
    totalValue: 1e6,
    attackerCount: 1,
    attackerCharacterIds: [100],
    attackerCorporationIds: [200],
    attackerAllianceIds: [0],
    attackerShipTypeIds: [587],
    attackerWeaponTypeIds: [587],
    npc: false,
    concord: false,
    ...over,
  };
}

describe("gate check routes", () => {
  it("weights systems like EVE's autopilot", () => {
    expect(systemCost("shortest", -1)).toBe(1);
    expect(systemCost("safer", 0.5)).toBe(0.9);
    expect(systemCost("safer", 0.3)).toBeCloseTo(Math.exp(7.5));
    expect(systemCost("safer", -0.2)).toBeCloseTo(2 * Math.exp(7.5));
    expect(systemCost("insecure", 0.3)).toBe(0.9);
    expect(systemCost("insecure", 0.9)).toBeCloseTo(Math.exp(7.5));
  });

  it("finds the shortest route and the one through the most secure space", () => {
    // Both A→E routes are 3 jumps; "safer" takes high-sec Delta. Null-sec costs double in both
    // modes, so "less secure" also prefers Delta (high) over Charlie (null), as in EVE.
    expect(planRoute(u, 1, 5, { preference: "safer" })).toEqual([1, 2, 4, 5]);
    expect(planRoute(u, 1, 5, { preference: "insecure" })).toEqual([1, 2, 4, 5]);
    // A low-sec detour beats high-sec on "less secure": make Charlie low-sec.
    const lowC = buildUniverse(
      SYSTEMS.map((s) => (s[0] === 3 ? [3, "Charlie", 0.2, 0, 0, 0] : s)),
      GATES,
    );
    expect(planRoute(lowC, 1, 5, { preference: "insecure" })).toEqual([1, 2, 3, 5]);
    expect(planRoute(u, 1, 5, { preference: "shortest" })).toHaveLength(4);
    expect(planRoute(u, 1, 1, { preference: "shortest" })).toEqual([1]);
    expect(planRoute(u, 1, 99, { preference: "shortest" })).toBeNull();
    expect(securityMix(u, [1, 2, 4, 5])).toEqual({ high: 2, low: 1, null: 0 });
  });

  it("routes around avoided systems, but never refuses the start or destination", () => {
    expect(planRoute(u, 1, 5, { preference: "safer", avoid: new Set([4]) })).toEqual([1, 2, 3, 5]);
    expect(planRoute(u, 1, 5, { preference: "safer", avoid: new Set([2]) })).toBeNull();
    expect(planRoute(u, 1, 2, { preference: "safer", avoid: new Set([1, 2]) })).toEqual([1, 2]);
  });

  it("plans real routes and never passes through Zarzakh", () => {
    const real = getUniverse();
    const jita = findSystem(real, "jita")!;
    const amamake = findSystem(real, "Amamake")!;
    const shortest = planRoute(real, jita.id, amamake.id, {
      preference: "shortest",
    })!;
    const safer = planRoute(real, jita.id, amamake.id, {
      preference: "safer",
    })!;
    expect(shortest[0]).toBe(jita.id);
    expect(shortest.at(-1)).toBe(amamake.id);
    expect(safer.length).toBeGreaterThanOrEqual(shortest.length);
    expect(securityMix(real, safer).low + securityMix(real, safer).null).toBeLessThanOrEqual(
      securityMix(real, shortest).low + securityMix(real, shortest).null,
    );
    // Zarzakh links Turnur with null-sec: no route may use it as a shortcut.
    const zarzakh = [...NO_TRANSIT][0];
    const turnur = findSystem(real, "Turnur")!;
    const hpa = findSystem(real, "H-PA29")!;
    const around = planRoute(real, turnur.id, hpa.id, {
      preference: "shortest",
    })!;
    expect(around.slice(1, -1)).not.toContain(zarzakh);
    expect(around.length).toBeGreaterThan(3);
    // Wormholes have no gates.
    expect(findSystem(real, "Thera")).toBeNull();
  });

  it("knows its neighbourhood", () => {
    expect(gateTo(u, 2, 4)?.id).toBe(24);
    expect([...jumpsWithin(u, 1, 2).entries()].sort()).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 2],
    ]);
  });
});

describe("gate check classification", () => {
  const km = (over: Partial<ZkillKillmail> = {}): ZkillKillmail => ({
    killmail_id: 7,
    killmail_time: "2026-10-07T19:50:00Z",
    solar_system_id: 2,
    victim: {
      ship_type_id: 587,
      damage_taken: 1,
      corporation_id: 9,
      position: { x: 4e6 + 10_000, y: 0, z: 0 },
    },
    attackers: [
      {
        character_id: 101,
        corporation_id: 201,
        ship_type_id: 587,
        weapon_type_id: 587,
        damage_done: 10,
        final_blow: true,
      },
      {
        character_id: 102,
        corporation_id: 202,
        alliance_id: 302,
        ship_type_id: 22456,
        weapon_type_id: 3955,
        damage_done: 500,
        final_blow: false,
      },
      {
        faction_id: 500_006,
        ship_type_id: 0,
        damage_done: 1,
        final_blow: false,
      },
    ],
    zkb: { hash: "h", totalValue: 5e6, locationID: 21 },
    ...over,
  });

  it("puts a kill at the nearest gate within 150 km, else away from the gates", () => {
    const gates = u.gates.get(2)!;
    expect(locateKill(km(), gates)).toEqual({ gateId: 24, distance: 10_000 });
    const far = km({
      victim: {
        ship_type_id: 587,
        damage_taken: 1,
        position: { x: 4e6 + 150_001, y: 0, z: 0 },
      },
    });
    expect(locateKill(far, gates)).toEqual({ gateId: null, distance: null });
    // Without a position, zKillboard's location is trusted when it is one of the system's gates.
    const blind = km({ victim: { ship_type_id: 587, damage_taken: 1 } });
    expect(locateKill(blind, gates)).toEqual({ gateId: 21, distance: null });
    expect(locateKill({ ...blind, zkb: { hash: "h", locationID: 40_000_001 } }, gates)).toEqual({ gateId: null, distance: null });
  });

  it("stores player attackers by damage as aligned arrays and flags CONCORD", () => {
    const row = toGateKill(km(), u.gates.get(2))!;
    expect(row).toMatchObject({
      gateId: 24,
      attackerCount: 3,
      attackerCharacterIds: [102, 101],
      attackerCorporationIds: [202, 201],
      attackerAllianceIds: [302, 0],
      attackerShipTypeIds: [22456, 587],
      attackerWeaponTypeIds: [3955, 587],
      concord: true,
      npc: false,
      totalValue: 5e6,
    });
    expect(toGateKill(km({ solar_system_id: 31_000_005 }), undefined)).toBeNull();
  });

  it("tags smartbombs, dictors, HICs, gankers, hot drops and pods", () => {
    const base = {
      victimShipTypeId: 587,
      attackerShipTypeIds: [587],
      attackerWeaponTypeIds: [587],
      concord: false,
    };
    expect(killTags(base, groupOf)).toEqual([]);
    expect(killTags({ ...base, attackerWeaponTypeIds: [3955] }, groupOf)).toEqual(["smartbomb"]);
    expect(
      killTags(
        {
          ...base,
          attackerShipTypeIds: [22456, 11995, 22436],
          victimShipTypeId: 670,
          concord: true,
        },
        groupOf,
      ),
    ).toEqual(["interdictor", "hic", "gank", "hotdrop", "pod"]);
    expect(mergeTags([["pod"], ["smartbomb", "pod"]])).toEqual(["smartbomb", "pod"]);
  });
});

describe("gate check assessment", () => {
  const route = [1, 2, 4, 5];
  const fresh = {
    coverageSince: new Date("2026-09-01T00:00:00Z"),
    caughtUpAt: new Date(NOW.getTime() - 30_000),
  };
  const opts = { now: NOW, windowHours: 2, feed: fresh, groupOf };

  it("tells the route's gates from the system's other gates", () => {
    const kills = [
      record({
        killmailId: 1,
        gateId: 21,
        killmailTime: new Date(NOW.getTime() - 5 * 60_000),
      }), // arrival gate in Bravo
      record({
        killmailId: 2,
        gateId: 23,
        killmailTime: new Date(NOW.getTime() - 50 * 60_000),
      }), // Bravo's gate to Charlie: not on route
      record({
        killmailId: 3,
        solarSystemId: 4,
        gateId: 45,
        killmailTime: new Date(NOW.getTime() - 90 * 60_000),
      }), // Delta's exit gate
      record({
        killmailId: 4,
        solarSystemId: 5,
        gateId: null,
        killmailTime: new Date(NOW.getTime() - 30 * 60_000),
      }), // Echo, off the gates
      record({ killmailId: 5, solarSystemId: 1, gateId: 12, npc: true }), // NPC kill at Alpha's exit gate
      record({
        killmailId: 6,
        solarSystemId: 1,
        gateId: 12,
        killmailTime: new Date(NOW.getTime() - 3 * 3600_000),
      }), // outside the window
    ];
    const out = checkRoute(u, route, kills, opts);
    expect(out.systems.map((s) => s.status)).toEqual(["quiet", "camp", "recent", "activity"]);
    expect(out.systems[1].routeKills.map((k) => [k.killmailId, k.place, k.gateDestinationId])).toEqual([[1, "entry", 1]]);
    expect(out.systems[1].otherKills.map((k) => [k.killmailId, k.place, k.gateDestinationId])).toEqual([[2, "gate", 3]]);
    expect(out.systems[2].routeKills[0].place).toBe("exit");
    expect(out.systems[0].npcKills).toBe(1);
    expect(out.systems[0].entryGateId).toBeNull();
    expect(out.systems[3].exitGateId).toBeNull();
  });

  it("counts three kills within the hour as a camp, and says unknown when the feed is behind", () => {
    const three = [40, 45, 55].map((m, i) =>
      record({
        killmailId: i + 1,
        gateId: 24,
        killmailTime: new Date(NOW.getTime() - m * 60_000),
      }),
    );
    expect(checkRoute(u, route, three, opts).systems[1].status).toBe("camp");
    expect(checkRoute(u, route, three.slice(0, 2), opts).systems[1].status).toBe("recent");
    const stale = {
      ...fresh,
      caughtUpAt: new Date(NOW.getTime() - 20 * 60_000),
    };
    expect(checkRoute(u, route, [], { ...opts, feed: stale }).systems.map((s) => s.status)).toEqual([
      "unknown",
      "unknown",
      "unknown",
      "unknown",
    ]);
    expect(feedHealth(null, NOW)).toBe("offline");
    expect(feedHealth({ ...fresh, caughtUpAt: new Date(NOW.getTime() - 5 * 60_000) }, NOW)).toBe("delayed");
  });

  it("collects the route gates' tags, gankers included", () => {
    const kills = [
      record({ killmailId: 1, gateId: 21, attackerWeaponTypeIds: [3955] }),
      record({
        killmailId: 2,
        gateId: 24,
        npc: true,
        concord: true,
        attackerCharacterIds: [],
      }),
      record({ killmailId: 3, gateId: 23, attackerShipTypeIds: [22456] }),
    ];
    const bravo = checkRoute(u, route, kills, opts).systems[1];
    expect(bravo.routeTags).toEqual(["smartbomb", "gank"]);
    expect(bravo.systemTags).toEqual(["smartbomb", "interdictor", "gank"]);
  });
});

describe("gate check predictions", () => {
  const route = [1, 2, 4, 5];
  const DAY = 86_400_000;
  const fresh = {
    coverageSince: new Date("2026-09-01T00:00:00Z"),
    caughtUpAt: NOW,
  };

  /** Kills at Bravo's arrival gate at 19:30 on the given days back, by pilots 100 and 101. */
  const history = (days: number[], extra: Partial<KillRecord> = {}) =>
    days.map((d, i) =>
      record({
        killmailId: 1000 + i,
        killmailTime: new Date(Date.parse("2026-10-07T19:30:00Z") - d * DAY),
        gateId: 21,
        attackerCharacterIds: [100, 101],
        attackerCorporationIds: [200, 200],
        attackerAllianceIds: [300, 300],
        attackerShipTypeIds: [22456, 587],
        attackerWeaponTypeIds: [22456, 587],
        ...extra,
      }),
    );

  it("rates history around the arrival time, live kills and regulars nearby", () => {
    const hist = history([1, 2, 3, 5, 8, 13]);
    const etas = arrivalTimes(route, NOW, 60);
    const check = checkRoute(u, route, [], {
      now: NOW,
      windowHours: 2,
      feed: fresh,
      groupOf,
    });
    const regulars = routeRegulars(u, route, hist, {
      now: NOW,
      days: 30,
      etas,
    });
    expect([...regulars].sort()).toEqual([100, 101]);
    // Pilot 100 killed in Charlie (two jumps from Delta, one from Bravo) 20 minutes ago.
    const sighting = record({
      killmailId: 5,
      solarSystemId: 3,
      killmailTime: new Date(NOW.getTime() - 20 * 60_000),
      attackerCharacterIds: [100],
    });
    const [alpha, bravo] = predictRoute(u, route, check, hist, [sighting], {
      now: NOW,
      days: 30,
      etas,
      groupOf,
    });
    expect(bravo.activeDays).toBe(6);
    expect(bravo.campDays).toBe(6);
    expect(bravo.hourly[19]).toBe(6);
    expect(bravo.regulars.map((r) => [r.characterId, r.days, r.nearEta, r.shipTypeIds[0]])).toEqual([
      [100, 6, true, 22456],
      [101, 6, true, 587],
    ]);
    expect(bravo.sightings).toEqual([
      {
        characterId: 100,
        systemId: 3,
        jumps: 1,
        time: sighting.killmailTime,
        shipTypeId: 587,
      },
    ]);
    expect(bravo.groups).toEqual([{ id: 300, kills: 6 }]);
    expect(bravo.tagCounts).toEqual({ interdictor: 6 });
    expect(bravo.factors.history).toBeCloseTo(6.5 / 31);
    expect(bravo.factors.regulars).toBeGreaterThan(0);
    // 1 − (1 − 0.21)(1 − ~0.2): history and a regular next door.
    expect(bravo.chance).toBeGreaterThan(0.3);
    expect(bravo.level).toBe("high");
    expect(alpha.chance).toBeLessThan(0.05);
    expect(alpha.level).toBe("low");

    // A regular's kill at these very gates is the live camp, not a sighting nearby.
    const atGate = record({
      killmailId: 6,
      gateId: 21,
      killmailTime: new Date(NOW.getTime() - 10 * 60_000),
      attackerCharacterIds: [101],
    });
    const again = predictRoute(u, route, check, hist, [atGate], {
      now: NOW,
      days: 30,
      etas,
      groupOf,
    })[1];
    expect(again.sightings).toEqual([]);

    // Today's kills don't make anyone a regular "around your arrival time".
    const morning = new Date("2026-10-07T09:00:00Z");
    const evenings = history([1, 2]);
    const live = record({
      killmailId: 9,
      gateId: 21,
      killmailTime: new Date(morning.getTime() - 20 * 60_000),
      attackerCharacterIds: [100],
    });
    const am = predictRoute(u, route, check, [...evenings, live], [], {
      now: morning,
      days: 30,
      etas: arrivalTimes(route, morning, 60),
      groupOf,
    })[1];
    expect(am.regulars.find((r) => r.characterId === 100)?.nearEta).toBe(false);
  });

  it("ignores kills at other times of day and pilots seen only once", () => {
    const morning = history([1, 2, 3], {
      killmailTime: new Date(Date.parse("2026-10-07T08:00:00Z") - DAY),
    });
    const once = history([4]).map((k) => ({
      ...k,
      attackerCharacterIds: [555],
      attackerShipTypeIds: [587],
    }));
    const etas = arrivalTimes(route, NOW, 60);
    const check = checkRoute(u, route, [], {
      now: NOW,
      windowHours: 2,
      feed: fresh,
      groupOf,
    });
    const bravo = predictRoute(u, route, check, [...morning, ...once], [], {
      now: NOW,
      days: 30,
      etas,
      groupOf,
    })[1];
    expect(bravo.activeDays).toBe(1);
    expect(bravo.regulars.map((r) => r.characterId)).not.toContain(555);
  });

  it("weighs a live camp by the time until you arrive", () => {
    const live = [
      record({
        killmailId: 1,
        gateId: 21,
        killmailTime: new Date(NOW.getTime() - 5 * 60_000),
      }),
    ];
    const check = checkRoute(u, route, live, {
      now: NOW,
      windowHours: 2,
      feed: fresh,
      groupOf,
    });
    const now = predictRoute(u, route, check, [], [], {
      now: NOW,
      days: 0,
      etas: arrivalTimes(route, NOW, 60),
      groupOf,
    })[1];
    const later = predictRoute(u, route, check, [], [], {
      now: NOW,
      days: 0,
      etas: arrivalTimes(route, new Date(NOW.getTime() + 3 * 3600_000), 60),
      groupOf,
    })[1];
    expect(now.factors.live).toBeGreaterThan(0.6);
    expect(later.factors.live).toBeLessThan(0.05);
    expect(now.confidence).toBe("none");
    expect(now.factors.history).toBe(0);
  });

  it("names levels and confidence", () => {
    expect([0.05, 0.2, 0.5, 0.8].map(riskLevel)).toEqual(["low", "moderate", "high", "severe"]);
    expect([0, 2, 3, 13, 14].map(confidenceOf)).toEqual(["none", "none", "limited", "limited", "good"]);
    expect(historyDays(new Date(NOW.getTime() - 45 * DAY), NOW, 30)).toBe(30);
    expect(historyDays(new Date(NOW.getTime() - 2.5 * DAY), NOW, 30)).toBe(2);
    expect(historyDays(null, NOW, 30)).toBe(0);
  });
});

describe("gate check parameters", () => {
  it("parses the form with safe defaults, ignoring the old window, pace and departure fields", () => {
    expect(parseQuery({ from: " Jita ", to: "Amamake", pref: "safer", window: "6", pace: "slow", depart: "2026-10-07T21:00" })).toEqual({
      from: "Jita",
      to: "Amamake",
      preference: "safer",
      avoid: "",
    });
    expect(parseQuery({ pref: "fastest", from: ["Jita", "Perimeter"] })).toEqual({
      from: "Jita",
      to: "",
      preference: "shortest",
      avoid: "",
    });
    expect(gatecheckHref(parseQuery({ from: "Jita", to: "Amamake", window: "24", pace: "slow" }))).toBe("/gatecheck?from=Jita&to=Amamake");
  });

  it("resolves names and keeps the URL short", () => {
    const q = parseQuery({
      from: "alpha",
      to: "Echo",
      avoid: "Delta, Nowhere, delta",
    });
    const r = resolveQuery(u, q);
    expect(r.from?.id).toBe(1);
    expect(r.avoid.map((s) => s.id)).toEqual([4]);
    expect(r.unknownAvoid).toEqual(["Nowhere"]);
    expect(gatecheckHref(parseQuery({ from: "Jita", to: "Amamake" }))).toBe("/gatecheck?from=Jita&to=Amamake");
    expect(gatecheckHref(q, { preference: "safer" })).toBe("/gatecheck?from=alpha&to=Echo&pref=safer&avoid=Delta%2C+Nowhere%2C+delta");
  });
});
