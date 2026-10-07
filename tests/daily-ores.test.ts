import { describe, expect, it } from "vitest";
import { ORE_SERIES_COLORS } from "@/modules/mining/class-colors";
import { dailyOreDrill, oreTotals } from "@/modules/mining/daily-ores";
import type { DailyTypeRow } from "@/modules/mining/queries";

const row = (
  date: string,
  typeId: number,
  name: string,
  amount: number,
  oreClass: DailyTypeRow["oreClass"] = "ore",
): DailyTypeRow => ({
  date,
  typeId,
  name,
  oreClass,
  amount,
});
const days = ["2026-10-01", "2026-10-02", "2026-10-03"];

describe("dailyOreDrill", () => {
  it("stacks each class by ore family, grades combined, ranked by the period total", () => {
    const drill = dailyOreDrill(
      [
        row("2026-10-01", 1228, "Scordite", 100),
        row("2026-10-02", 46687, "Scordite II-Grade", 300),
        row("2026-10-02", 1230, "Veldspar", 250),
        row("2026-10-01", 16264, "Blue Ice", 40, "ice"),
      ],
      days,
    );
    expect(drill.ore!.series).toEqual([
      { key: "s0", name: "Scordite" },
      { key: "s1", name: "Veldspar" },
    ]);
    expect(drill.ore!.otherCount).toBe(0);
    expect(drill.ore!.rows).toEqual([
      { date: "2026-10-01", total: 100, values: { s0: 100, s1: 0 } },
      { date: "2026-10-02", total: 550, values: { s0: 300, s1: 250 } },
      { date: "2026-10-03", total: 0, values: { s0: 0, s1: 0 } },
    ]);
    expect(drill.ice!.series.map((s) => s.name)).toEqual(["Blue Ice"]);
    expect(drill.moon).toBeUndefined();
  });

  it("folds the families past the limit into other", () => {
    const rows = ["A", "B", "C", "D", "E"].map((n, i) => row("2026-10-01", i + 1, `${n}ite`, 50 - i * 10));
    const drill = dailyOreDrill(rows, days, 3).ore!;
    expect(drill.series.map((s) => s.name)).toEqual(["Aite", "Bite", "Cite"]);
    expect(drill.otherCount).toBe(2);
    expect(drill.rows[0].values).toEqual({ s0: 50, s1: 40, s2: 30, other: 30 });
    expect(oreTotals(drill)).toEqual({ s0: 50, s1: 40, s2: 30, other: 30 });
  });

  it("never folds a single family into other, nor shows more series than the limit", () => {
    const rows = ["Kite", "Bite", "Cite", "Dite"].map((n, i) => row("2026-10-01", i + 1, n, 10));
    const drill = dailyOreDrill(rows, days, 3).ore!;
    // Ties break by name; one family past the limit makes the last slot an "other" of two.
    expect(drill.series.map((s) => s.name)).toEqual(["Bite", "Cite"]);
    expect(drill.otherCount).toBe(2);
    expect(dailyOreDrill(rows.slice(0, 3), days, 3).ore!.series).toHaveLength(3);
  });

  it("caps the default limit at the colour slots", () => {
    const rows = Array.from({ length: 7 }, (_, i) => row("2026-10-01", i + 1, `Ore${i}`, 70 - i));
    const drill = dailyOreDrill(rows, days).ore!;
    expect(drill.series.length + (drill.otherCount ? 1 : 0)).toBeLessThanOrEqual(ORE_SERIES_COLORS.length + 1);
    expect(drill.series).toHaveLength(ORE_SERIES_COLORS.length - 1);
    expect(drill.otherCount).toBe(2);
  });

  it("ignores empty amounts and days outside the range", () => {
    const drill = dailyOreDrill(
      [row("2026-10-01", 1, "Veldspar", 0), row("2026-09-01", 2, "Scordite", 10), row("2026-10-02", 3, "Omber", 5)],
      days,
    );
    expect(drill.ore!.series.map((s) => s.name)).toEqual(["Omber"]);
    expect(drill.ore!.rows.map((r) => r.total)).toEqual([0, 5, 0]);
    expect(dailyOreDrill([], days)).toEqual({});
  });
});
