import { describe, expect, it } from "vitest";
import { oreGrade, parseLocaleNumber, parseSurveyScan, summariseSurvey } from "@/modules/mining/estimator/parse";

// Excerpt of a real German-client survey scanner export.
const GERMAN = `Scordite III-Grade	8.904	1.335 m3	168.000,00 ISK	25 km
Scordite III-Grade	41.648	6.247 m3	787.000,00 ISK	21 km
Scordite II-Grade	42.784	6.417 m3	770.000,00 ISK	33 km
Scordite	38.780	5.817 m3	661.000,00 ISK	14 km
Veldspar III-Grade	101.972	10.197 m3	1.090.000,00 ISK	19 km
Veldspar	25.645	2.564 m3	255.000,00 ISK	13 km
Pyroxeres II-Grade	15.964	4.789 m3	363.000,00 ISK	17 km`;

describe("parseLocaleNumber", () => {
  it.each([
    ["8.904", 8904],
    ["1.090.000,00", 1_090_000],
    ["168.000,00", 168_000],
    ["8,904", 8904],
    ["168,000.00", 168_000],
    ["1 335", 1335],
    ["1 335,5", 1335.5],
    ["0,5", 0.5],
    ["2.5", 2.5],
    ["25", 25],
  ])("%s → %d", (raw, expected) => {
    expect(parseLocaleNumber(raw)).toBe(expected);
  });

  it("rejects non-numbers", () => {
    expect(parseLocaleNumber("abc")).toBeNull();
    expect(parseLocaleNumber("")).toBeNull();
  });
});

describe("parseSurveyScan", () => {
  it("parses the German client format", () => {
    const { rocks, skipped } = parseSurveyScan(GERMAN);
    expect(skipped).toEqual([]);
    expect(rocks).toHaveLength(7);
    expect(rocks[0]).toEqual({ name: "Scordite III-Grade", quantity: 8904, volume: 1335, value: 168_000, distanceKm: 25 });
    expect(rocks[4].value).toBe(1_090_000);
  });

  it("parses the English client format and metre distances", () => {
    const { rocks } = parseSurveyScan("Veldspar\t25,645\t2,564 m3\t255,000.00 ISK\t13 km\nOmber\t1,000\t600 m3\t50,000.00 ISK\t2,500 m");
    expect(rocks[0]).toEqual({ name: "Veldspar", quantity: 25_645, volume: 2564, value: 255_000, distanceKm: 13 });
    expect(rocks[1].distanceKm).toBe(2.5);
  });

  it("tolerates missing columns, blank lines and junk", () => {
    const { rocks, skipped } = parseSurveyScan("\nKernite\t1.200\n\nnot a rock line\n12345\t5\n");
    expect(rocks).toEqual([{ name: "Kernite", quantity: 1200, volume: null, value: null, distanceKm: null }]);
    expect(skipped.map((s) => s.line)).toEqual([4, 5]);
  });

  it("falls back to multiple spaces when tabs were lost", () => {
    const { rocks } = parseSurveyScan("Scordite II-Grade   42.784   6.417 m3   770.000,00 ISK   33 km");
    expect(rocks[0].quantity).toBe(42_784);
    expect(rocks[0].distanceKm).toBe(33);
  });
});

describe("grades", () => {
  it("splits ore families and grades", () => {
    expect(oreGrade("Scordite III-Grade")).toEqual({ base: "Scordite", grade: "III-Grade", rank: 3 });
    expect(oreGrade("Scordite")).toEqual({ base: "Scordite", grade: "Base", rank: 1 });
    expect(oreGrade("Blue Ice IV-Grade")).toMatchObject({ base: "Blue Ice", grade: "IV-Grade" });
    expect(oreGrade("Glistening Zeolites")).toMatchObject({ base: "Zeolites", grade: "Glistening", rank: 3 });
    expect(oreGrade("Thick Blue Ice")).toMatchObject({ base: "Blue Ice", grade: "Thick", rank: 2 });
    expect(oreGrade("Thick Blue Ice IV-Grade")).toEqual({ base: "Blue Ice", grade: "Thick IV-Grade", rank: 5 });
    expect(oreGrade("Hadal Talassonite")).toMatchObject({ base: "Talassonite", rank: 3 });
    expect(oreGrade("Azure Ice")).toMatchObject({ base: "Azure Ice", grade: "Base" });
    expect(oreGrade("Golden Mykoserocin")).toMatchObject({ base: "Golden Mykoserocin" });
  });

  it("summarises by family with grades in order", () => {
    const summary = summariseSurvey(parseSurveyScan(GERMAN).rocks);
    const scordite = summary.find((s) => s.base === "Scordite")!;
    expect(scordite.rocks).toBe(4);
    expect(scordite.grades.map((g) => g.grade)).toEqual(["Base", "II-Grade", "III-Grade"]);
    expect(scordite.grades[2]).toMatchObject({ rocks: 2, quantity: 50_552, volume: 7582, scannerValue: 955_000 });
    expect(scordite.scannerValue).toBe(168_000 + 787_000 + 770_000 + 661_000);
    // Families sorted by value, most valuable first.
    expect(summary[0].base).toBe("Scordite");
  });
});
