import { describe, expect, it } from "vitest";
import { clusterEngagements, summarizeEngagement, summarizeHistory, type Encounter } from "@/modules/intel/history";
import { isValidPilotName, parsePilotList } from "@/modules/intel/parse";
import { isNpcCorporation, priorPriority } from "@/modules/intel/priority";
import { decayWeight, DAY_MS } from "@/modules/intel/score/decay";
import { classifyStanding, standingOf, type StandingsContext } from "@/modules/intel/standings";

describe("pilot list parser", () => {
  it("reads a local member list, one name per line, de-duplicated", () => {
    const parsed = parsePilotList("Pilot One\r\nPilot Two\n\n  pilot one  \nO'Neil Vex-Dar\n");
    expect(parsed.names).toEqual(["Pilot One", "Pilot Two", "O'Neil Vex-Dar"]);
    expect(parsed.format).toBe("list");
  });

  it("takes the first column of a fleet composition", () => {
    const parsed = parsePilotList("Pilot One\tAmamake\tSabre\tTackle 1\tSquad Member\nPilot Two\tAmamake\tLoki\t\tSquad Commander");
    expect(parsed.names).toEqual(["Pilot One", "Pilot Two"]);
    expect(parsed.format).toBe("fleet");
  });

  it("reads chat log speakers and ignores system messages", () => {
    const parsed = parsePilotList(
      "[ 2026.10.02 19:00:00 ] Pilot One > red in local\n[ 2026.10.02 19:00:05 ] EVE System > Channel changed to Local : Amamake\n[ 2026.10.02 19:01:00 ] Pilot Two > +1",
    );
    expect(parsed.names).toEqual(["Pilot One", "Pilot Two"]);
    expect(parsed.format).toBe("chat");
  });

  it("splits comma separated names and reports what it skipped", () => {
    const parsed = parsePilotList("Pilot One, Pilot Two; Pilot Three\nThis line is far too long to be the name of a pilot\n-bad\nx");
    expect(parsed.names).toEqual(["Pilot One", "Pilot Two", "Pilot Three"]);
    expect(parsed.skippedCount).toBe(3);
    expect(parsed.skipped[0]).toContain("far too long");
  });

  it("counts d-scan lines instead of reading them as names", () => {
    const parsed = parsePilotList("12345\tWreck\tRifter Wreck\t1,200 m\nPilot One");
    expect(parsed.names).toEqual(["Pilot One"]);
    expect(parsed.dscanLines).toBe(1);
  });

  it("follows EVE's naming policy", () => {
    expect(isValidPilotName("Ab")).toBe(false);
    expect(isValidPilotName("Abc")).toBe(true);
    expect(isValidPilotName("A".repeat(37))).toBe(true);
    expect(isValidPilotName("A".repeat(38))).toBe(false);
    expect(isValidPilotName("'Quote")).toBe(false);
    expect(isValidPilotName("Trailing-")).toBe(false);
    expect(isValidPilotName("Two  Spaces")).toBe(false);
  });
});

describe("standings", () => {
  const ctx: StandingsContext = {
    homeCorporationId: 100,
    homeAllianceId: 200,
    corporationContacts: new Map([
      [7, 10], // a character we set blue
      [300, -10], // a red corporation
    ]),
    allianceContacts: new Map([
      [7, -10], // the alliance thinks otherwise; the corporation's list wins
      [400, -5], // a red alliance
      [500, 5],
    ]),
  };
  const pilot = (characterId: number, corporationId: number | null, allianceId: number | null = null) => ({
    characterId,
    corporationId,
    allianceId,
    factionId: null,
  });

  it("treats the home corporation and alliance as own", () => {
    expect(standingOf(pilot(1, 100), ctx).cls).toBe("own");
    expect(standingOf(pilot(1, 101, 200), ctx).cls).toBe("own");
  });

  it("uses the most specific contact, corporation list first", () => {
    expect(standingOf(pilot(7, 300, 400), ctx)).toEqual({ cls: "blue", value: 10, source: "corporation", via: "character" });
    expect(standingOf(pilot(8, 300, 500), ctx)).toMatchObject({ cls: "red", via: "corporation" });
    expect(standingOf(pilot(8, 301, 400), ctx)).toMatchObject({ cls: "red", source: "alliance", via: "alliance" });
    expect(standingOf(pilot(8, 301, null), ctx).cls).toBe("neutral");
  });

  it("classifies standing values", () => {
    expect([10, 5, 2.5, 0, -0.1, -5, -10].map(classifyStanding)).toEqual([
      "blue",
      "blue",
      "lightblue",
      "neutral",
      "orange",
      "red",
      "red",
    ]);
  });
});

describe("recency", () => {
  it("halves a kill's weight every half-life", () => {
    expect(decayWeight(0)).toBe(1);
    expect(decayWeight(14 * DAY_MS)).toBeCloseTo(0.5);
    expect(decayWeight(28 * DAY_MS)).toBeCloseTo(0.25);
    expect(decayWeight(-5)).toBe(1);
  });
});

describe("history with us", () => {
  const now = new Date("2026-10-02T20:00:00Z");
  const e = (over: Partial<Encounter>): Encounter => ({
    characterId: 9,
    killmailId: 1,
    time: new Date("2026-10-01T20:00:00Z"),
    systemId: 30002813,
    value: 100e6,
    shipTypeId: 22456,
    kind: "onUs",
    ...over,
  });

  it("sums kills on us and losses to us per pilot, with the hulls they used", () => {
    const h = summarizeHistory(
      [
        e({ killmailId: 1 }),
        e({ killmailId: 2, shipTypeId: 22456, time: new Date("2026-09-01T00:00:00Z") }),
        e({ killmailId: 3, kind: "byUs", value: 40e6, shipTypeId: 11377 }),
      ],
      now,
    ).get(9)!;
    expect(h).toMatchObject({ killsOnUs: 2, lossesToUs: 1, iskDestroyedOnUs: 200e6, iskLostToUs: 40e6 });
    expect(h.firstAt).toBe("2026-09-01T00:00:00.000Z");
    expect(h.lastAt).toBe("2026-10-01T20:00:00.000Z");
    expect(h.ships[0]).toMatchObject({ shipTypeId: 22456, count: 2 });
    expect(h.weight).toBeGreaterThan(1);
  });

  it("clusters killmails into fights per system, newest first", () => {
    const t = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`);
    const clusters = clusterEngagements([
      { killmailId: 1, time: t("19:00"), systemId: 1 },
      { killmailId: 2, time: t("19:20"), systemId: 1 },
      { killmailId: 3, time: t("19:50"), systemId: 1 }, // 30 min after the previous: same fight
      { killmailId: 4, time: t("20:21"), systemId: 1 }, // 31 min: a new fight
      { killmailId: 5, time: t("19:10"), systemId: 2 },
      { killmailId: 5, time: t("19:10"), systemId: 2 },
    ]);
    expect(clusters.map((c) => c.killmailIds)).toEqual([[4], [1, 2, 3], [5]]);
  });

  it("summarizes who brought what and how the fight went", () => {
    const H = 100;
    const t = new Date("2026-10-01T19:00:00Z");
    const killmails = [
      // Our loss to pasted pilot 9 (Loki) and 10 (Sabre) plus an outsider 11.
      { killmailId: 1, time: t, systemId: 1, victimCharacterId: 1, victimCorporationId: H, victimAllianceId: null, victimShipTypeId: 587, value: 300e6 },
      // We killed pasted pilot 10's Sabre.
      { killmailId: 2, time: t, systemId: 1, victimCharacterId: 10, victimCorporationId: 300, victimAllianceId: 400, victimShipTypeId: 22456, value: 60e6 },
    ];
    const attackers = [
      { killmailId: 1, characterId: 9, corporationId: 300, allianceId: 400, shipTypeId: 29990 },
      { killmailId: 1, characterId: 10, corporationId: 300, allianceId: 400, shipTypeId: 22456 },
      { killmailId: 1, characterId: 11, corporationId: 301, allianceId: 400, shipTypeId: 11987 },
      { killmailId: 2, characterId: 1, corporationId: H, allianceId: null, shipTypeId: 587 },
    ];
    const fight = summarizeEngagement({ systemId: 1, start: t, end: t, killmailIds: [1, 2] }, killmails, attackers, H, new Set([9, 10]))!;
    expect(fight).toMatchObject({ ourKills: 1, ourLosses: 1, iskKilled: 60e6, iskLost: 300e6, topKillmailId: 1 });
    expect(fight.battleAffiliations).toEqual(expect.arrayContaining([{ characterId: 1, corporationId: H, allianceId: null }, { characterId: 10, corporationId: 300, allianceId: 400 }]));
    expect(fight.battleAffiliations?.filter(p => p.characterId === 10)).toHaveLength(1);
    expect(fight.battle?.ours).toEqual([{ shipTypeId: 587, count: 1, lost: 1, pilotIds: [1] }]);
    expect(fight.battle?.theirs).toEqual(expect.arrayContaining([
      { shipTypeId: 22456, count: 1, lost: 1, pilotIds: [10] },
      { shipTypeId: 29990, count: 1, lost: 0, pilotIds: [9] },
      { shipTypeId: 11987, count: 1, lost: 0, pilotIds: [11] },
    ]));
    expect(fight.pilots).toEqual([
      { characterId: 9, role: "attacker", shipTypeIds: [29990] },
      { characterId: 10, role: "both", shipTypeIds: [22456] },
    ]);
    expect(fight.brought).toEqual(
      expect.arrayContaining([
        { shipTypeId: 22456, count: 1 },
        { shipTypeId: 29990, count: 1 },
        { shipTypeId: 11987, count: 1 },
      ]),
    );
    expect(fight.others).toEqual([{ corporationId: 301, allianceId: 400, pilots: 1 }]);
    // A fight without any pasted pilot is not shown.
    expect(summarizeEngagement({ systemId: 1, start: t, end: t, killmailIds: [1] }, killmails.slice(0, 1), attackers, H, new Set([42]))).toBeNull();
  });
});

describe("profiling priority", () => {
  const now = new Date("2026-10-02T20:00:00Z");
  const neutral = { cls: "neutral", value: null, source: null, via: null } as const;
  const red = { cls: "red", value: -10, source: "corporation", via: "alliance" } as const;
  it("puts reds and recent killers of ours first", () => {
    const base = { standing: neutral, history: null, corporationId: 98000001, allianceId: null, now };
    const killer = {
      ...base,
      history: { killsOnUs: 2, lossesToUs: 0, iskDestroyedOnUs: 1, iskLostToUs: 0, firstAt: null, lastAt: "2026-09-30T00:00:00Z", ships: [], weight: 1 },
    };
    expect(priorPriority({ ...base, standing: red })).toBeGreaterThan(priorPriority(killer));
    expect(priorPriority(killer)).toBeGreaterThan(priorPriority(base));
    expect(priorPriority({ ...base, corporationId: 1000167 })).toBeLessThan(priorPriority(base));
    expect(isNpcCorporation(1000167)).toBe(true);
    expect(isNpcCorporation(98000001)).toBe(false);
  });
});
