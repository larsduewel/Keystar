import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/i18n/messages";
import { parseSkillsFilters, skillsQueryString } from "@/modules/skills/filters";
import { queueRows } from "@/modules/skills/jobs";
import {
  durationParts,
  entryProgress,
  parseSkillDogma,
  queueTimeline,
  remainingSp,
  romanLevel,
  summarizeQueue,
  type QueueEntry,
} from "@/modules/skills/queue";

const now = new Date("2026-10-03T12:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3600_000);

function entry(position: number, extra: Partial<QueueEntry> = {}): QueueEntry {
  return {
    queuePosition: position,
    skillId: 3300 + position,
    finishedLevel: 4,
    startDate: null,
    finishDate: null,
    trainingStartSp: null,
    levelStartSp: 45255,
    levelEndSp: 256000,
    ...extra,
  };
}

describe("skill queue summary", () => {
  it("reports an empty queue", () => {
    expect(summarizeQueue([], now)).toMatchObject({ status: "empty", active: null, endsAt: null, remainingMs: null });
  });

  it("follows the training skill and the end of the queue", () => {
    const queue = [
      entry(1, { startDate: hours(48), finishDate: hours(96) }),
      entry(0, { startDate: hours(-10), finishDate: hours(48), trainingStartSp: 100_000 }),
    ];
    const s = summarizeQueue(queue, now);
    expect(s.status).toBe("training");
    expect(s.active?.queuePosition).toBe(0);
    expect(s.entries.map((e) => e.queuePosition)).toEqual([0, 1]);
    expect(s.endsAt).toEqual(hours(96));
    expect(s.remainingMs).toBe(96 * 3600_000);
  });

  it("flags a queue that ends within a day", () => {
    expect(summarizeQueue([entry(0, { startDate: hours(-1), finishDate: hours(5) })], now).status).toBe("ending-soon");
  });

  it("drops skills that finished since the last login", () => {
    const s = summarizeQueue(
      [entry(0, { startDate: hours(-30), finishDate: hours(-2) }), entry(1, { startDate: hours(-2), finishDate: hours(40) })],
      now,
    );
    expect(s.entries.map((e) => e.queuePosition)).toEqual([1]);
    expect(s.active?.queuePosition).toBe(1);
    expect(summarizeQueue([entry(0, { startDate: hours(-30), finishDate: hours(-2) })], now).status).toBe("empty");
  });

  it("treats a queue without dates as paused", () => {
    const s = summarizeQueue([entry(0, { trainingStartSp: 150_000 }), entry(1)], now);
    expect(s.status).toBe("paused");
    expect(s.endsAt).toBeNull();
    expect(s.activeProgress.sp).toBe(150_000);
  });
});

describe("skill progress", () => {
  it("interpolates SP between start and finish", () => {
    const e = entry(0, { startDate: hours(-1), finishDate: hours(1), trainingStartSp: 100_000, levelStartSp: 50_000, levelEndSp: 300_000 });
    expect(entryProgress(e, now)).toEqual({ sp: 200_000, fraction: 0.6 });
    expect(remainingSp(e, now)).toBe(100_000);
    expect(entryProgress(e, hours(5)).fraction).toBe(1);
    expect(entryProgress(e, hours(-5)).sp).toBe(100_000);
  });

  it("has no progress without SP data", () => {
    expect(entryProgress(entry(0, { levelStartSp: null, levelEndSp: null }), now)).toEqual({ sp: null, fraction: null });
    expect(remainingSp(entry(0, { levelStartSp: null, levelEndSp: null }), now)).toBeNull();
  });
});

describe("skill helpers", () => {
  it("formats levels and durations like the game", () => {
    expect([1, 2, 3, 4, 5].map(romanLevel)).toEqual(["I", "II", "III", "IV", "V"]);
    expect(durationParts((3 * 1440 + 4 * 60 + 11) * 60_000 + 1)).toEqual({ days: 3, hours: 4, minutes: 12 });
    expect(durationParts(-5)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(MESSAGES.en.skills.duration({ days: 3, hours: 4, minutes: 12 })).toBe("3d 4h 12m");
    expect(MESSAGES.en.skills.duration({ days: 0, hours: 0, minutes: 7 })).toBe("7m");
    expect(MESSAGES.de.skills.duration({ days: 0, hours: 2, minutes: 5 })).toBe("2 Std. 5 Min.");
  });

  it("reads primary/secondary attribute and rank from dogma", () => {
    expect(
      parseSkillDogma([
        { attribute_id: 180, value: 165 },
        { attribute_id: 181, value: 168 },
        { attribute_id: 275, value: 3 },
        { attribute_id: 182, value: 3300 },
      ]),
    ).toEqual({ primaryAttribute: 165, secondaryAttribute: 168, rank: 3 });
    expect(parseSkillDogma([{ attribute_id: 180, value: 165 }])).toBeNull();
    expect(parseSkillDogma(undefined)).toBeNull();
  });

  it("maps ESI queue entries, paused ones without dates", () => {
    const [training, paused] = queueRows(
      7,
      [
        { queue_position: 0, skill_id: 3436, finished_level: 5, start_date: "2026-10-01T00:00:00Z", finish_date: "2026-10-05T00:00:00Z", training_start_sp: 1, level_start_sp: 0, level_end_sp: 2 },
        { queue_position: 1, skill_id: 3437, finished_level: 1 },
      ],
      now,
    );
    expect(training).toMatchObject({ characterId: 7, skillId: 3436, startDate: new Date("2026-10-01T00:00:00Z"), levelEndSp: 2 });
    expect(paused).toMatchObject({ skillId: 3437, startDate: null, finishDate: null, trainingStartSp: null });
  });

  it("keeps filters in the URL", () => {
    const f = parseSkillsFilters({ view: "corp", chars: "3,1,x,3" });
    expect(f).toEqual({ view: "corp", characters: [3, 1] });
    expect(skillsQueryString(f)).toBe("view=corp&chars=3%2C1");
    expect(parseSkillsFilters({ view: "bogus" }).view).toBe("own");
    expect(skillsQueryString(parseSkillsFilters({}))).toBe("");
  });
});

describe("skill queue timeline", () => {
  it("is empty for a paused or empty queue", () => {
    expect(queueTimeline([], now)).toBeNull();
    expect(queueTimeline([entry(0)], now)).toBeNull();
    // A later entry without dates pauses the whole queue, so there is no strip for the dated one either.
    expect(queueTimeline([entry(0, { startDate: hours(-1), finishDate: hours(5) }), entry(1)], now)).toBeNull();
  });

  it("slices the strip by the time each skill still needs", () => {
    const tl = queueTimeline(
      [entry(0, { startDate: hours(-10), finishDate: hours(10) }), entry(1, { startDate: hours(10), finishDate: hours(40) })],
      now,
    )!;
    expect(tl.totalMs).toBe(40 * 3600_000);
    expect(tl.segments.map((s) => [s.offset, s.width])).toEqual([
      [0, 0.25],
      [0.25, 0.75],
    ]);
    expect(tl.segments[0].remainingMs).toBe(10 * 3600_000);
    expect(tl.ticks).toEqual([{ offset: 0.6, unit: "day", count: 1 }]);
  });

  it("picks a tick spacing that keeps the scale readable", () => {
    const days = (d: number) => hours(d * 24);
    const tl = queueTimeline([entry(0, { startDate: now, finishDate: days(380) })], now)!;
    expect(tl.ticks.map((t) => `${t.count}${t.unit}`)).toEqual(["3month", "6month", "9month", "12month"]);
    expect(queueTimeline([entry(0, { startDate: now, finishDate: days(10) })], now)!.ticks.map((t) => `${t.count}${t.unit}`)).toEqual([
      "2day",
      "4day",
      "6day",
      "8day",
    ]);
    // Past a year's steps the spacing grows in whole years, so even an eight-year queue stays within the limit.
    const long = queueTimeline([entry(0, { startDate: now, finishDate: days(8 * 365) })], now)!;
    expect(long.ticks.map((t) => `${t.count}${t.unit}`)).toEqual(["24month", "48month", "72month", "96month"]);
  });
});
