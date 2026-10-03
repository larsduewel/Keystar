import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/i18n/messages";
import { reasonText, tagText } from "@/modules/intel/text";
import { CYNO_TYPES, fitKeyOf, hullClass, isFittedSlot, locationKind, MODULE_GROUPS, SHIP_GROUPS } from "@/modules/intel/hulls";
import { scorePilot, tierOf, type ScoreContext } from "@/modules/intel/score/composite";
import { DAY_MS } from "@/modules/intel/score/decay";
import { buildProfile, type DigestRow, type ProfileInput } from "@/modules/intel/score/profile";
import { gangBuckets, normalizeStats } from "@/modules/intel/stats";
import type { NormalizedStats } from "@/modules/intel/types";
import activeRaw from "./fixtures/zkill-stats-active.json";
import sparseRaw from "./fixtures/zkill-stats-sparse.json";

const now = new Date("2026-10-02T20:00:00Z");
const neutral = { cls: "neutral", value: null, source: null, via: null } as const;
const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  now,
  standing: neutral,
  history: null,
  historyAvailable: true,
  system: null,
  systemsInfo: new Map(),
  ...over,
});
const input = (over: Partial<ProfileInput> = {}): ProfileInput => ({
  stats: null,
  digest: [],
  coveredSince: null,
  typeGroups: new Map(),
  systemSecurity: new Map(),
  corpHistory: null,
  birthday: new Date("2015-01-01T00:00:00Z"),
  securityStatus: 0,
  corporationId: 98000001,
  now,
  ...over,
});
const emptyStats = (over: Partial<NormalizedStats> = {}): NormalizedStats => ({
  ...normalizeStats({}),
  ...over,
});

let nextId = 1;
const row = (daysAgo: number, over: Partial<DigestRow> = {}): DigestRow => ({
  killmailId: nextId++,
  killmailTime: new Date(now.getTime() - daysAgo * DAY_MS),
  solarSystemId: 30002813,
  locationId: 40000001,
  isLoss: false,
  shipTypeId: 11184, // Crusader (interceptor)
  finalBlow: false,
  attackerCount: 4,
  totalValue: 150e6,
  solo: false,
  npc: false,
  otherCharacterId: 1,
  otherCorporationId: 2,
  otherAllianceId: null,
  otherShipTypeId: 587,
  allyIds: [],
  fittedTypeIds: [],
  ...over,
});

describe("zKillboard statistics", () => {
  it("normalises an active pilot's statistics", () => {
    const s = normalizeStats(activeRaw);
    expect(s.kills).toBe(activeRaw.shipsDestroyed);
    expect(s.dangerRatio).toBe(activeRaw.dangerRatio);
    expect(s.activePvp?.kills).toBe(activeRaw.activepvp.kills.count);
    expect(s.months.length).toBeGreaterThan(5);
    expect(s.months.at(-1)).toMatchObject({ year: 2026, month: 10 });
    expect(s.recentShips[0]).toMatchObject({ shipTypeId: 11184, groupId: 831 });
    expect(s.associates[0].sharedKills).toBeGreaterThan(0);
    expect(s.activity).toHaveLength(7);
    expect(s.activity![3]).toHaveLength(24);
    expect(s.labels.weekly["pvp"].kills).toBeGreaterThan(0);
    expect(s.topSystems.length).toBeGreaterThan(0);
    expect(s.info.name).toBe("Sample Hunter");
  });

  it("tolerates a sparse pilot", () => {
    const s = normalizeStats(sparseRaw);
    expect(s).toMatchObject({ kills: 0, losses: 2, dangerRatio: null, activePvp: null, activity: null, fc: null });
    expect(s.recentShips).toEqual([]);
    expect(normalizeStats({ months: "nope", groups: [1, 2], activity: { 0: { 99: 5 } } })).toMatchObject({ months: [], groups: [], activity: null });
  });

  it("reads zKillboard's exclusive gang-size labels", () => {
    const s = normalizeStats(activeRaw);
    const b = gangBuckets(s.labels.lifetime);
    expect(b.solo).toBe(activeRaw.labels["#:1"].shipsDestroyed);
    expect(b.small).toBe(activeRaw.labels["#:2+"].shipsDestroyed + activeRaw.labels["#:5+"].shipsDestroyed);
  });
});

describe("hull and module classification", () => {
  it("pins the group ids checked against ESI", () => {
    expect(SHIP_GROUPS).toMatchObject({ interceptor: 831, interdictor: 541, heavyInterdictor: 894, blackOps: 898, forceAuxiliary: 1538 });
    expect(MODULE_GROUPS).toMatchObject({ cynosuralField: 658, cloakingDevice: 330, warpScrambler: 52 });
    expect(CYNO_TYPES).toEqual({ normal: 21096, covert: 28646, industrial: 52694 });
    expect(hullClass(831)).toBe("tackle");
    expect(hullClass(30)).toBe("supercapital");
    expect(hullClass(null)).toBe("other");
  });

  it("reads fits and locations", () => {
    expect(fitKeyOf(28646, 658)).toBe("covertCyno");
    expect(fitKeyOf(11578, 330)).toBe("covertCloak");
    expect(fitKeyOf(1, 52)).toBe("scram");
    expect(fitKeyOf(1, 999)).toBeNull();
    expect([11, 27, 34, 92, 125, 5, 87].map(isFittedSlot)).toEqual([true, true, true, true, true, false, false]);
    expect(locationKind(50001234)).toBe("gate");
    expect(locationKind(60003760)).toBe("station");
    expect(locationKind(null)).toBe("other");
  });
});

describe("threat score", () => {
  it("does not label an empty completed killmail sample as low danger", () => {
    const profile = buildProfile(input({ stats: emptyStats({ kills: 814 }), coveredSince: new Date(0) }));
    const score = scorePilot(profile, ctx());
    expect(score.assessment?.sample).toBe(0);
    expect(score.tier).toBe("unknown");
  });

  it("marks a statistics-only pilot without sampled killmails unknown", () => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      year: 2023,
      month: i + 1,
      kills: 80,
      losses: 5,
      iskDestroyed: 40e9,
      iskLost: 1e9,
    }));
    const stats = emptyStats({
      kills: 960,
      losses: 60,
      iskDestroyed: 480e9,
      dangerRatio: 95,
      months,
      recentShips: [{ shipTypeId: 22456, groupId: 541, kills: 300, losses: 10, appearances: 310 }],
      labels: { lifetime: { "#:1": { kills: 600, losses: 20 } }, recent: {}, weekly: {} },
    });
    const score = scorePilot(buildProfile(input({ stats })), ctx());
    expect(score.composite).toBeLessThan(25);
    expect(score.tier).toBe("unknown");
    expect(reasonText(MESSAGES.en, score.dimensions.find((d) => d.key === "activity")!.why)).toContain("last active 2023-12");
  });

  it("rates a pilot active last week highly, from their newest killmails", () => {
    const groups = new Map([
      [11184, 831],
      [587, 25],
    ]);
    const digest = [
      ...[0.2, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 6.5].map((d, i) => row(d, { finalBlow: i % 2 === 0, attackerCount: i % 3 === 0 ? 1 : 3, solo: i % 3 === 0 })),
      row(2, { isLoss: true, totalValue: 30e6 }),
      row(40, { isLoss: true, totalValue: 40e6 }),
    ];
    const profile = buildProfile(input({ digest, typeGroups: groups, coveredSince: new Date(now.getTime() - 45 * DAY_MS) }));
    expect(profile.depth).toBe("deep");
    expect(profile.recent.kills7d).toBe(10);
    expect(profile.recent.latest[0].killmailId).toBe(digest[0].killmailId);
    expect(profile.recent.lastSeen?.shipTypeId).toBe(11184);
    const score = scorePilot(profile, ctx());
    expect(score.composite).toBeGreaterThanOrEqual(50);
    expect(score.quick).toBe(false);
    expect(score.tags.map((t) => t.key)).toContain("tackle");
  });

  it("scores from statistics alone before the killmails arrive", () => {
    const stats = normalizeStats(activeRaw);
    const profile = buildProfile(input({ stats }));
    expect(profile.depth).toBe("stats");
    expect(profile.recent.kills7d).toBe(activeRaw.activepvp.kills.count);
    const score = scorePilot(profile, ctx());
    expect(score.quick).toBe(true);
    expect(score.composite).toBeGreaterThan(25);
    expect(score.tags.map((t) => t.key)).toContain("tackle");
  });

  it("counts the current system only when one is given, and renormalises otherwise", () => {
    const digest = [row(1), row(2), row(3, { solarSystemId: 30002814 })];
    const profile = buildProfile(input({ digest, coveredSince: new Date(now.getTime() - 30 * DAY_MS) }));
    const without = scorePilot(profile, ctx());
    expect(without.dimensions.find((d) => d.key === "relevance")!.available).toBe(false);
    const here = scorePilot(profile, ctx({ system: { systemId: 30002813, constellationId: 1, regionId: 2 } }));
    const elsewhere = scorePilot(profile, ctx({ system: { systemId: 30000142, constellationId: 9, regionId: 9 } }));
    expect(here.assessment!.relevance).toBeGreaterThan(0);
    expect(here.composite).toBeGreaterThan(elsewhere.composite);
  });

  it("tags cyno pilots from their lost fits", () => {
    const digest = [row(1), row(3, { isLoss: true, shipTypeId: 11182, fittedTypeIds: [CYNO_TYPES.covert, 11578] })];
    const profile = buildProfile(input({ digest, coveredSince: new Date(now.getTime() - 30 * DAY_MS) }));
    expect(profile.fits.covertCyno?.count).toBe(1);
    const tags = scorePilot(profile, ctx()).tags;
    const cyno = tags.find((t) => t.key === "cyno")!;
    expect(cyno).toMatchObject({ label: "covertCyno", evidence: "recent", why: { key: "cynoFits", count: 1 } });
    expect(tagText(MESSAGES.en, cyno)).toBe("Covert cyno");
    expect(tagText(MESSAGES.de, cyno)).toBe("Covert-Cyno");
    expect(reasonText(MESSAGES.en, cyno.why, now)).toBe("Cyno fitted on 1 lost ship, last 3 days ago");
    expect(reasonText(MESSAGES.de, cyno.why, now)).toBe("Cyno auf 1 verlorenem Schiff, zuletzt vor 3 Tagen");
  });

  it("marks friendlies and pilots without data", () => {
    const own = { cls: "own", value: null, source: null, via: null } as const;
    expect(scorePilot(null, ctx({ standing: own }))).toMatchObject({ tier: "unknown", excluded: "own" });
    expect([0, 49, 50, 79, 80, 100].map(tierOf)).toEqual(["low", "low", "moderate", "moderate", "high", "high"]);
  });

  it("adds history with us when they fought us", () => {
    const profile = buildProfile(input({ digest: [row(1)], coveredSince: new Date(now.getTime() - 30 * DAY_MS) }));
    const history = { killsOnUs: 3, lossesToUs: 1, iskDestroyedOnUs: 1e9, iskLostToUs: 1e8, firstAt: null, lastAt: "2026-10-01T00:00:00Z", ships: [], weight: 2.5 };
    const withHistory = scorePilot(profile, ctx({ history }));
    const dim = withHistory.dimensions.find((d) => d.key === "history")!;
    expect(dim.available).toBe(true);
    expect(reasonText(MESSAGES.en, dim.why, now)).toContain("On 3 of our losses");
    expect(scorePilot(profile, ctx()).dimensions.find((d) => d.key === "history")!.available).toBe(false);
  });
});

describe("evidence threat model", () => {
  it("discounts mass-fleet participation compared with small fights", () => {
    const small = buildProfile(input({ digest: Array.from({length: 15}, () => row(1, {attackerCount: 3})), coveredSince: new Date(now.getTime() - 30 * DAY_MS) }));
    const fleet = buildProfile(input({ digest: Array.from({length: 15}, () => row(1, {attackerCount: 474})), coveredSince: new Date(now.getTime() - 30 * DAY_MS) }));
    expect(scorePilot(small, ctx()).assessment!.confidence).toBe("high");
    expect(scorePilot(small, ctx()).assessment!.capability).toBeGreaterThan(scorePilot(fleet, ctx()).assessment!.capability);
  });
  it("does not penalize young characters, NPC corporations or corporation changes", () => {
    const profile = buildProfile(input({digest: [row(1), row(2)]}));
    const original = scorePilot(profile, ctx()).composite;
    profile.character = {...profile.character, ageDays: 1, npcCorp: true, corpHops365: 20, securityStatus: -10};
    expect(scorePilot(profile, ctx()).composite).toBe(original);
  });
  it("keeps missing local context unknown and confidence separate from score", () => {
    const profile = buildProfile(input({stats: normalizeStats(activeRaw)}));
    const score = scorePilot(profile, ctx());
    expect(score.assessment).toMatchObject({relevance: null, confidence: "low", sample: 0});
    expect(score.composite).toBe(score.assessment!.capability);
  });
  it("ages local evidence faster and keeps escalation independent", () => {
    const profile = buildProfile(input({digest: [row(0), row(1), row(2)], coveredSince: new Date(now.getTime() - 30 * DAY_MS)}));
    const context = ctx({system: {systemId: 30002813, constellationId: 1, regionId: 2}});
    const initial = scorePilot(profile, context);
    const later = scorePilot(profile, {...context, now: new Date(now.getTime() + 14 * DAY_MS)});
    expect(later.assessment!.relevance).toBeLessThan(initial.assessment!.relevance!);
    profile.fits.covertCyno = {count: 1, lastAt: now.toISOString()};
    const cyno = scorePilot(profile, context);
    expect(cyno.composite).toBe(initial.composite);
    expect(cyno.assessment!.escalation).toContain("covertCyno");
  });
});