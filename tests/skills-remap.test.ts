import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/i18n/messages";
import { ATTRIBUTE_IDS, type QueueEntry, type SkillTrainingAttributes } from "@/modules/skills/queue";
import {
  allRemaps,
  isShortQueue,
  isValidBase,
  optimizeRemap,
  parseImplantDogma,
  queueTrainingMinutes,
  remapAvailability,
  REMAP_MIN_QUEUE_DAYS,
  spPerMinute,
  type AttributeSet,
} from "@/modules/skills/remap";

const now = new Date("2026-10-03T12:00:00Z");
const days = (d: number) => new Date(now.getTime() + d * 86400_000);

const { charisma: CHA, intelligence: INT, memory: MEM, perception: PER, willpower: WIL } = ATTRIBUTE_IDS;
const SKILL_INT_MEM = 3413;
const SKILL_PER_WIL = 3327;
const SKILL_UNKNOWN = 99999;
const skillAttributes = new Map<number, SkillTrainingAttributes>([
  [SKILL_INT_MEM, { primaryAttribute: INT, secondaryAttribute: MEM, rank: 1 }],
  [SKILL_PER_WIL, { primaryAttribute: PER, secondaryAttribute: WIL, rank: 1 }],
]);

const DEFAULT: AttributeSet = { charisma: 19, intelligence: 20, memory: 20, perception: 20, willpower: 20 };
const plus = (a: AttributeSet, n: number): AttributeSet =>
  Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v + n])) as AttributeSet;

/** A level V of a rank-1 skill, not started (210,745 SP to go), paused unless dates are given. */
function entry(position: number, skillId: number, extra: Partial<QueueEntry> = {}): QueueEntry {
  return {
    queuePosition: position,
    skillId,
    finishedLevel: 5,
    startDate: null,
    finishDate: null,
    trainingStartSp: 45255,
    levelStartSp: 45255,
    levelEndSp: 256000,
    ...extra,
  };
}

describe("remap search space", () => {
  it("lists every legal remap once", () => {
    const remaps = allRemaps();
    // 14 points over five attributes, at most 10 each: C(18,4) − 5·C(7,4).
    expect(remaps).toHaveLength(2885);
    expect(remaps.every(isValidBase)).toBe(true);
    expect(new Set(remaps.map((r) => JSON.stringify(r))).size).toBe(remaps.length);
  });

  it("validates bounds and total", () => {
    expect(isValidBase(DEFAULT)).toBe(true);
    expect(isValidBase({ ...DEFAULT, charisma: 16, intelligence: 23 })).toBe(false);
    expect(isValidBase({ ...DEFAULT, intelligence: 28, memory: 12 })).toBe(false);
    expect(isValidBase({ ...DEFAULT, intelligence: 21 })).toBe(false);
  });
});

describe("training speed", () => {
  it("is primary + secondary / 2 per minute", () => {
    expect(spPerMinute({ ...DEFAULT, intelligence: 27, memory: 21 }, INT, MEM)).toBe(37.5);
    expect(
      queueTrainingMinutes([{ primaryAttribute: INT, secondaryAttribute: MEM, sp: 210745 }], { ...DEFAULT, intelligence: 27, memory: 21 }),
    ).toBeCloseTo(210745 / 37.5);
  });
});

describe("remap optimiser", () => {
  it("puts everything into the primary, the rest into the secondary", () => {
    const result = optimizeRemap({ entries: [entry(0, SKILL_INT_MEM)], skillAttributes, effective: DEFAULT, implants: null, now });
    expect(result.recommendedBase).toEqual({ charisma: 17, intelligence: 27, memory: 21, perception: 17, willpower: 17 });
    expect(result.currentMinutes).toBeCloseTo(210745 / 30);
    expect(result.recommendedMinutes).toBeCloseTo(210745 / 37.5);
    expect(result.savedMinutes).toBeCloseTo(210745 / 30 - 210745 / 37.5);
    expect(result.optimal).toBe(false);
    expect(result.implantsUncertain).toBe(true);
  });

  it("weighs a mixed queue by its skill points", () => {
    const entries = [entry(0, SKILL_PER_WIL, { levelStartSp: 0, trainingStartSp: 0, levelEndSp: 2_000_000 }), entry(1, SKILL_INT_MEM)];
    const result = optimizeRemap({ entries, skillAttributes, effective: DEFAULT, implants: null, now });
    const recommended = result.recommendedBase!;
    expect(recommended.perception).toBe(27);
    expect(recommended.willpower).toBeGreaterThan(recommended.intelligence);
    expect(isValidBase(recommended)).toBe(true);
    // No other remap is faster.
    const groups = [
      { primaryAttribute: PER, secondaryAttribute: WIL, sp: 2_000_000 },
      { primaryAttribute: INT, secondaryAttribute: MEM, sp: 210745 },
    ];
    const best = Math.min(...allRemaps().map((r) => queueTrainingMinutes(groups, r)));
    expect(result.recommendedMinutes).toBeCloseTo(best);
  });

  it("subtracts implants to get the base attributes", () => {
    const base: AttributeSet = { charisma: 17, intelligence: 21, memory: 27, perception: 17, willpower: 17 };
    const implants = plus({ charisma: 0, intelligence: 0, memory: 0, perception: 0, willpower: 0 }, 4);
    const result = optimizeRemap({ entries: [entry(0, SKILL_INT_MEM)], skillAttributes, effective: plus(base, 4), implants, now });
    expect(result.currentBase).toEqual(base);
    expect(result.implantsUncertain).toBe(false);
    expect(result.recommendedBase).toEqual({ ...base, intelligence: 27, memory: 21 });
    // Implants stay on top of the remap.
    expect(result.recommendedMinutes).toBeCloseTo(210745 / (31 + 25 / 2));
    expect(result.currentMinutes).toBeCloseTo(210745 / (25 + 31 / 2));
  });

  it("falls back to no implants when they don't match the attributes", () => {
    const implants: AttributeSet = { charisma: 0, intelligence: 10, memory: 0, perception: 0, willpower: 0 };
    const result = optimizeRemap({ entries: [entry(0, SKILL_INT_MEM)], skillAttributes, effective: DEFAULT, implants, now });
    expect(result.implantsUncertain).toBe(true);
    expect(result.implants).toEqual({ charisma: 0, intelligence: 0, memory: 0, perception: 0, willpower: 0 });
    expect(result.currentBase).toEqual(DEFAULT);
  });

  it("recommends nothing when the base attributes are unknown", () => {
    // 110 points: 11 from implants Keystar doesn't know about.
    const effective: AttributeSet = { charisma: 19, intelligence: 24, memory: 27, perception: 20, willpower: 20 };
    const result = optimizeRemap({ entries: [entry(0, SKILL_INT_MEM)], skillAttributes, effective, implants: null, now });
    expect(result.comparable).toBe(false);
    expect(result.optimal).toBe(false);
    expect(result.recommendedMinutes).toBeNull();
    expect(result.savedMinutes).toBeNull();
    expect(result.currentMinutes).toBeCloseTo(210745 / (24 + 27 / 2));
    expect(result.recommendedBase).toBeNull();
  });

  it("lets implants decide the best remap of a mixed queue", () => {
    // Equal SP on Int/Mem and Per/Wil: with +4 Int/Mem implants, Int 21/Per 27 is already the best remap.
    const sp = { levelStartSp: 0, trainingStartSp: 0, levelEndSp: 1_000_000 };
    const entries = [entry(0, SKILL_INT_MEM, sp), entry(1, SKILL_PER_WIL, sp)];
    const base: AttributeSet = { charisma: 17, intelligence: 21, memory: 17, perception: 27, willpower: 17 };
    const implants: AttributeSet = { charisma: 0, intelligence: 4, memory: 4, perception: 0, willpower: 0 };
    const effective: AttributeSet = { ...base, intelligence: 25, memory: 21 };
    const known = optimizeRemap({ entries, skillAttributes, effective, implants, now });
    expect(known.optimal).toBe(true);
    expect(known.recommendedBase).toEqual(base);
    // Without the implants the base can't be told, and an implant-free guess (Int 24/Per 24) would be slower.
    const unknown = optimizeRemap({ entries, skillAttributes, effective, implants: null, now });
    expect(unknown.comparable).toBe(false);
    expect(unknown.recommendedBase).toBeNull();
  });

  it("keeps the current attributes when they are already the best", () => {
    const best: AttributeSet = { charisma: 17, intelligence: 27, memory: 21, perception: 17, willpower: 17 };
    const result = optimizeRemap({ entries: [entry(0, SKILL_INT_MEM)], skillAttributes, effective: best, implants: null, now });
    expect(result.optimal).toBe(true);
    expect(result.recommendedBase).toEqual(best);
    expect(result.savedMinutes).toBe(0);
  });

  it("prefers the closest remap when several are equally fast", () => {
    // Only charisma-free skills: charisma can't help, so the advice moves it no more than needed.
    const entries = [entry(0, SKILL_INT_MEM)];
    const current: AttributeSet = { charisma: 17, intelligence: 27, memory: 21, perception: 17, willpower: 17 };
    const result = optimizeRemap({ entries, skillAttributes, effective: current, implants: null, now });
    expect(result.recommendedBase?.charisma).toBe(17);
  });

  it("uses the SP still to train and skips entries it can't time", () => {
    const entries = [
      // Halfway through, training: 2 days in, 2 days to go.
      entry(0, SKILL_INT_MEM, { startDate: days(-2), finishDate: days(2), trainingStartSp: 45255 }),
      // Finished already: dropped.
      entry(1, SKILL_PER_WIL, { startDate: days(-10), finishDate: days(-3) }),
      entry(2, SKILL_UNKNOWN),
      entry(3, SKILL_PER_WIL, { levelEndSp: null }),
    ];
    const result = optimizeRemap({ entries, skillAttributes, effective: DEFAULT, implants: null, now });
    expect(result.unknownEntries).toBe(2);
    expect(result.countedEntries).toBe(1);
    // SP are rounded to whole points, like ESI reports them.
    expect(result.currentMinutes).toBeCloseTo(210745 / 2 / 30, 1);
  });
});

describe("remap warnings", () => {
  it("flags queues shorter than 180 days", () => {
    expect(REMAP_MIN_QUEUE_DAYS).toBe(180);
    expect(isShortQueue(180 * 1440 - 1)).toBe(true);
    expect(isShortQueue(180 * 1440)).toBe(false);
  });

  it("knows which remaps are available", () => {
    expect(remapAvailability({ accruedRemapCooldownDate: null, bonusRemaps: 0 }, now)).toMatchObject({
      available: true,
      yearlyAvailable: true,
    });
    expect(remapAvailability({ accruedRemapCooldownDate: days(-1), bonusRemaps: null }, now)).toMatchObject({
      available: true,
      yearlyAt: null,
    });
    expect(remapAvailability({ accruedRemapCooldownDate: days(30), bonusRemaps: 1 }, now)).toMatchObject({
      available: true,
      yearlyAvailable: false,
      yearlyAt: days(30),
      bonusRemaps: 1,
    });
    expect(remapAvailability({ accruedRemapCooldownDate: days(30), bonusRemaps: 0 }, now)).toMatchObject({ available: false });
  });

  it("explains the warning in both languages", () => {
    expect(MESSAGES.en.skills.remap.shortQueue.body("12d 3h 0m")).toContain("12d 3h 0m");
    expect(MESSAGES.de.skills.remap.shortQueue.body("12d 3h 0m")).toContain("365 Tagen");
  });
});

describe("implant dogma", () => {
  it("reads attribute bonuses", () => {
    const dogma = [175, 176, 177, 178, 179].map((id) => ({ attribute_id: id, value: id === 178 ? 3 : 0 }));
    expect(parseImplantDogma([...dogma, { attribute_id: 331, value: 1 }])).toEqual({
      charisma: 0,
      intelligence: 0,
      memory: 0,
      perception: 3,
      willpower: 0,
    });
  });

  it("ignores implants without attribute bonuses", () => {
    expect(parseImplantDogma([{ attribute_id: 331, value: 7 }])).toBeNull();
    expect(parseImplantDogma(undefined)).toBeNull();
  });

  it("maps every attribute", () => {
    expect([CHA, INT, MEM, PER, WIL]).toEqual([164, 165, 166, 167, 168]);
  });
});
