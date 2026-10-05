import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/i18n/messages";
import {
  activityOf,
  durationParts,
  ENDING_SOON_MS,
  isStructureId,
  jobProgress,
  jobRows,
  statusesOf,
  type EsiIndustryJob,
} from "@/modules/industry/activities";
import { industryQueryString, parseIndustryFilters } from "@/modules/industry/filters";

const now = new Date("2026-10-04T12:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3600_000);

function esiJob(extra: Partial<EsiIndustryJob> = {}): EsiIndustryJob {
  return {
    job_id: 500_001,
    installer_id: 2_112_000_001,
    facility_id: 60003760,
    station_id: 60003760,
    activity_id: 1,
    blueprint_id: 1_000_000_123,
    blueprint_type_id: 787,
    blueprint_location_id: 60003760,
    output_location_id: 60003760,
    runs: 10,
    cost: 12_345.67,
    licensed_runs: 100,
    status: "active",
    duration: 7200,
    start_date: hours(-1).toISOString(),
    end_date: hours(1).toISOString(),
    ...extra,
  };
}

describe("industry activities", () => {
  it("maps ESI activity ids, with both reaction ids", () => {
    expect(activityOf(1)).toBe("manufacturing");
    expect(activityOf(3)).toBe("te_research");
    expect(activityOf(4)).toBe("me_research");
    expect(activityOf(5)).toBe("copying");
    expect(activityOf(8)).toBe("invention");
    expect(activityOf(9)).toBe("reaction");
    expect(activityOf(11)).toBe("reaction");
    expect(activityOf(7)).toBe("other");
  });

  it("tells player structures from NPC stations by id range", () => {
    expect(isStructureId(60003760)).toBe(false);
    expect(isStructureId(1_035_466_617_946)).toBe(true);
  });

  it("groups statuses by state", () => {
    expect(statusesOf("running")).toEqual(["active", "paused", "ready"]);
    expect(statusesOf("finished")).toEqual(["delivered", "cancelled", "reverted"]);
    expect(statusesOf("all")).toHaveLength(6);
  });
});

describe("job progress", () => {
  const timing = (status: EsiIndustryJob["status"] & string, start: Date, end: Date, pause: Date | null = null) =>
    jobProgress({ status: status as "active", startDate: start, endDate: end, pauseDate: pause }, now);

  it("interpolates a running job", () => {
    const p = timing("active", hours(-24), hours(72));
    expect(p.phase).toBe("running");
    expect(p.fraction).toBeCloseTo(0.25);
    expect(p.remainingMs).toBe(72 * 3600_000);
  });

  it("flags a job that ends within a day", () => {
    expect(timing("active", hours(-10), hours(5)).phase).toBe("ending-soon");
    expect(timing("active", hours(-10), new Date(now.getTime() + ENDING_SOON_MS + 1)).phase).toBe("running");
  });

  it("treats an active job past its end as ready, like a ready one", () => {
    for (const status of ["active", "ready"] as const) {
      const p = timing(status, hours(-5), hours(-1));
      expect(p.phase).toBe("ready");
      expect(p.fraction).toBe(1);
      expect(p.remainingMs).toBeNull();
    }
  });

  it("freezes a paused job where it was paused", () => {
    const p = timing("paused", hours(-4), hours(4), hours(-2));
    expect(p.phase).toBe("paused");
    expect(p.fraction).toBeCloseTo(0.25);
    expect(p.remainingMs).toBeNull();
  });

  it("marks delivered, cancelled and reverted jobs finished", () => {
    for (const status of ["delivered", "cancelled", "reverted"] as const) {
      expect(timing(status, hours(-9), hours(-1))).toEqual({ fraction: 1, remainingMs: null, phase: "finished" });
    }
  });

  it("never yields a negative duration", () => {
    expect(durationParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(durationParts((2 * 1440 + 3 * 60 + 7) * 60_000 + 59_000)).toEqual({ days: 2, hours: 3, minutes: 7 });
  });
});

describe("job rows", () => {
  it("maps an ESI job, filling optional fields with null", () => {
    const [row] = jobRows(2_112_000_001, [esiJob()], now);
    expect(row).toMatchObject({
      jobId: 500_001,
      characterId: 2_112_000_001,
      locationId: 60003760,
      stationId: 60003760,
      activity: "manufacturing",
      status: "active",
      productTypeId: null,
      probability: null,
      successfulRuns: null,
      pauseDate: null,
      completedDate: null,
      completedCharacterId: null,
      cost: 12_345.67,
      licensedRuns: 100,
      updatedAt: now,
    });
    expect(row.startDate).toEqual(hours(-1));
    expect(row.endDate).toEqual(hours(1));
  });

  it("keeps invention and delivery details", () => {
    const [row] = jobRows(
      1,
      [
        esiJob({
          activity_id: 8,
          status: "delivered",
          product_type_id: 12003,
          probability: 0.34,
          successful_runs: 3,
          completed_date: hours(-2).toISOString(),
          completed_character_id: 7,
        }),
      ],
      now,
    );
    expect(row).toMatchObject({ activity: "invention", productTypeId: 12003, probability: 0.34, successfulRuns: 3, completedCharacterId: 7 });
    expect(row.completedDate).toEqual(hours(-2));
  });

  it("locates structure jobs by facility_id even when station_id is missing or 0", () => {
    const structure = 1_035_466_617_946;
    const [a, b] = jobRows(1, [esiJob({ facility_id: structure, station_id: undefined }), esiJob({ job_id: 2, facility_id: structure, station_id: 0 })], now);
    expect(a).toMatchObject({ locationId: structure, facilityId: structure, stationId: null });
    expect(b).toMatchObject({ locationId: structure, stationId: 0 });
    // A legacy row with only a station id still has a location; one with neither is dropped.
    expect(jobRows(1, [esiJob({ facility_id: 0 })], now)[0].locationId).toBe(60003760);
    expect(jobRows(1, [esiJob({ facility_id: 0, station_id: 0 })], now)).toEqual([]);
  });

  it("skips a job with a status it doesn't know", () => {
    expect(jobRows(1, [esiJob({ status: "mystery" }), esiJob({ job_id: 2 })], now).map((r) => r.jobId)).toEqual([2]);
  });
});

describe("industry filters", () => {
  it("defaults to running jobs with nothing selected", () => {
    expect(parseIndustryFilters({})).toEqual({ state: "running", characters: [], activities: [], systems: [], locations: [], page: 1 });
  });

  it("reads lists, drops unknown values and round-trips through the query string", () => {
    const f = parseIndustryFilters({
      state: "finished",
      chars: "5,5,x,0,7",
      activities: "copying,bogus,invention",
      systems: ["30000142", "30002187"],
      locations: "60003760",
      page: "3",
    });
    expect(f).toEqual({
      state: "finished",
      characters: [5, 7],
      activities: ["copying", "invention"],
      systems: [30000142, 30002187],
      locations: [60003760],
      page: 3,
    });
    const qs = industryQueryString(f);
    expect(parseIndustryFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual(f);
    expect(industryQueryString(parseIndustryFilters({}))).toBe("");
    expect(industryQueryString(f, { page: 1, state: "running" })).toBe("chars=5%2C7&activities=copying%2Cinvention&systems=30000142%2C30002187&locations=60003760");
  });

  it("falls back for an unknown state or page", () => {
    expect(parseIndustryFilters({ state: "later", page: "-4" })).toMatchObject({ state: "running", page: 1 });
  });
});

describe("industry dictionary", () => {
  it("has a label for every activity, status and phase in every language", () => {
    for (const messages of Object.values(MESSAGES)) {
      const m = messages.industry;
      for (const a of ["manufacturing", "te_research", "me_research", "copying", "invention", "reaction", "other"] as const) {
        expect(m.activities[a]).toBeTruthy();
        expect(m.activityShort[a]).toBeTruthy();
      }
      expect(m.duration({ days: 1, hours: 2, minutes: 3 })).toMatch(/1.*2h 3m/);
      expect(m.duration({ days: 0, hours: 0, minutes: 9 })).toBe("9m");
    }
  });
});
