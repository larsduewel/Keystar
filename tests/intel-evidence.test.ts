import { describe, expect, it } from "vitest";
import { cynoEvidence, eventTargetHull, latestEvidence, newestEvents, observedGroups } from "@/modules/intel/evidence";
import { buildProfile, type DigestRow, type ProfileInput } from "@/modules/intel/score/profile";
import type { LatestEvent } from "@/modules/intel/types";

const now = new Date("2026-10-03T14:00:00Z");
const input: ProfileInput = {
  stats: null,
  digest: [],
  coveredSince: null,
  typeGroups: new Map(),
  systemSecurity: new Map(),
  corpHistory: null,
  birthday: null,
  securityStatus: null,
  corporationId: null,
  now,
};
const profile = (latest: LatestEvent[] = []) => ({ ...buildProfile(input), recent: { ...buildProfile(input).recent, latest } });
const event = (id: number, minutes = 30, over: Partial<LatestEvent> = {}): LatestEvent => ({
  killmailId: id,
  time: new Date(now.getTime() - minutes * 60_000).toISOString(),
  isLoss: false,
  shipTypeId: 100,
  otherShipTypeId: 200,
  otherCharacterId: null,
  otherCorporationId: null,
  otherAllianceId: null,
  systemId: 300,
  attackerCount: 7,
  solo: false,
  finalBlow: false,
  value: 0,
  ...over,
});
const pilot = (characterId: number, latest: LatestEvent[]) => ({ characterId, profile: profile(latest) });

describe("pilot evidence", () => {
  it("orders mixed events newest first without mutating stored input", () => {
    const events = [event(1, 60), event(2, 5, { isLoss: true }), event(3, 20)];
    expect(newestEvents(events).map(e => e.killmailId)).toEqual([2, 3, 1]);
    expect(events.map(e => e.killmailId)).toEqual([1, 2, 3]);
  });
  it("distinguishes the victim hull from the attacker's hull", () => {
    expect(eventTargetHull(event(1))).toBe(200);
    expect(eventTargetHull(event(1, 30, { isLoss: true }))).toBe(100);
    expect(eventTargetHull(event(1, 30, { isLoss: true, shipTypeId: null }))).toBeNull();
  });
  it("keeps latest kills and losses independently, including old records and unordered input", () => {
    const oldLoss = event(2, 90 * 24 * 60, { isLoss: true });
    expect(latestEvidence(profile([oldLoss, event(3, 60), event(4, 10)]))).toEqual({ kill: event(4, 10), loss: oldLoss });
    expect(latestEvidence(null)).toEqual({ kill: null, loss: null });
  });
  it("keeps five records per side when a busy kill history would hide the newest loss", () => {
    const rows: DigestRow[] = Array.from({ length: 15 }, (_, i) => ({
      killmailId: i + 1,
      killmailTime: new Date(now.getTime() - (i + 1) * 60_000),
      solarSystemId: 300,
      locationId: null,
      isLoss: i >= 12,
      shipTypeId: 100,
      finalBlow: false,
      attackerCount: 2,
      totalValue: 0,
      solo: false,
      npc: false,
      otherCharacterId: null,
      otherCorporationId: null,
      otherAllianceId: null,
      otherShipTypeId: 200,
      allyIds: [],
      fittedTypeIds: [],
    }));
    const p = buildProfile({ ...input, digest: rows });
    expect(p.recent.latest.filter((e) => !e.isLoss)).toHaveLength(5);
    expect(p.recent.latest.filter((e) => e.isLoss)).toHaveLength(3);
    expect(latestEvidence(p).loss?.killmailId).toBe(13);
  });
  it("uses fitting evidence and keeps cyno types separate without inventing a yearly window", () => {
    const p = profile();
    p.fits = { covertCyno: { count: 2, lastAt: event(1).time }, industrialCyno: { count: 1, lastAt: event(2, 600_000).time } };
    expect(cynoEvidence(p).map((f) => f.kind)).toEqual(["covertCyno", "industrialCyno"]);
    expect(cynoEvidence(null)).toEqual([]);
  });
});

describe("partial observed group reconstruction", () => {
  it("deduplicates pilots, combines overlapping encounters and keeps the newest hull", () => {
    const groups = observedGroups(
      [
        pilot(1, [event(1, 10), event(1, 10), event(2, 25, { shipTypeId: 101 })]),
        pilot(2, [event(1, 10), event(2, 25)]),
        pilot(3, [event(2, 25)]),
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].killmailIds).toEqual([1, 2]);
    expect(groups[0].events.map(e => e.killmailId)).toEqual([1, 2]);
    expect(groups[0].events[0]).toMatchObject({ otherShipTypeId: 200, attackerCount: 7 });
    expect(groups[0].members).toHaveLength(3);
    expect(groups[0].members[0]).toMatchObject({ characterId: 1, shipTypeId: 100, changed: true });
  });
  it("never includes victims as co-attackers, and rejects future, invalid or stale records", () => {
    expect(observedGroups([pilot(1, [event(1)]), pilot(2, [event(1, 30, { isLoss: true })])], now)).toEqual([]);
    for (const e of [event(1, 361), event(1, -1), event(1, 30, { time: "invalid" })]) {
      expect(observedGroups([pilot(1, [e]), pilot(2, [e])], now)).toEqual([]);
    }
    expect(observedGroups([pilot(1, [event(1, 360)]), pilot(2, [event(1, 360)])], now)).toHaveLength(1);
  });
  it("does not merge different systems, long engagements, or groups with only one shared pilot", () => {
    const a = event(1, 10),
      b = event(2, 20, { systemId: 400 }),
      c = event(3, 45);
    expect(observedGroups([pilot(1, [a, b, c]), pilot(2, [a, b, c])], now)).toHaveLength(3);
    expect(observedGroups([pilot(1, [a]), pilot(2, [a, event(2, 20)]), pilot(3, [event(2, 20)])], now)).toHaveLength(2);
  });
  it("joins two groups when an older encounter shares two pilots with each", () => {
    const a = event(1, 10),
      b = event(2, 15),
      bridge = event(3, 20);
    const groups = observedGroups([pilot(1, [a, bridge]), pilot(2, [a, bridge]), pilot(3, [b, bridge]), pilot(4, [b, bridge])], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].killmailIds).toEqual([1, 2, 3]);
    expect(groups[0].members.map((m) => m.characterId)).toEqual([1, 2, 3, 4]);
  });
  it("never reconstructs a recent encounter from aggregate associations alone", () => {
    const p = profile();
    p.associates = [{ characterId: 2, sharedKills: 20, source: "stats" }];
    expect(observedGroups([{ characterId: 1, profile: p }, pilot(2, [])], now)).toEqual([]);
  });
});
