import { describe, expect, it } from "vitest";
import { bucketEnd, bucketStart, startOfIsoWeek } from "@/lib/dates";
import {
  classifyPurchase,
  classifySale,
  EXPENSE_CATEGORIES,
  expenseStatus,
  purchaseCategorySqlCase,
  saleCategorySqlCase,
  type ExpenseCategory,
} from "@/modules/mining/pnl/categories";
import { parsePnlFilters, pnlQueryString } from "@/modules/mining/pnl/filters";
import type { ActivityStats, ExpenseRow, IncomeRow, OreFlowRow, SaleRow } from "@/modules/mining/pnl/queries";
import { summarizeOreFlows } from "@/modules/mining/pnl/ore-flows";
import { allocateByShare, buildPnlReport } from "@/modules/mining/pnl/report";
import { pnlScope } from "@/modules/mining/pnl/scope";

describe("purchase auto-tagging", () => {
  it("tags mining consumables and hulls by group, generic-group hulls by type", () => {
    expect(classifyPurchase(18066, 482)).toBe("crystals");
    expect(classifyPurchase(11111, 663)).toBe("crystals");
    expect(classifyPurchase(16272, 423)).toBe("fuel");
    expect(classifyPurchase(16273, 423)).toBeNull(); // other ice products stay out
    expect(classifyPurchase(42830, 1771)).toBe("bursts"); // Mining Laser Optimization Charge
    expect(classifyPurchase(10246, 101)).toBe("drones");
    expect(classifyPurchase(62622, 4174)).toBe("ships"); // Medium Asteroid Ore Compressor I
    expect(classifyPurchase(22544, 543)).toBe("ships");
    expect(classifyPurchase(32880, 25)).toBe("ships"); // Venture, in the generic Frigate group
    expect(classifyPurchase(89240, 420)).toBe("ships"); // Pioneer, a Destroyer
    expect(classifyPurchase(587, 25)).toBeNull(); // Rifter
    expect(classifyPurchase(2488, 100)).toBeNull(); // combat drones
    // Mining items in groups shared with combat gear go by type.
    expect(classifyPurchase(58950, 515)).toBe("ships"); // Large Industrial Core II
    expect(classifyPurchase(28583, 515)).toBe("ships"); // Capital Industrial Core I
    expect(classifyPurchase(20280, 515)).toBeNull(); // Siege Module I
    expect(classifyPurchase(43551, 1770)).toBe("ships"); // Mining Foreman Burst II
    expect(classifyPurchase(42529, 1770)).toBeNull(); // Shield Command Burst I
    expect(classifyPurchase(32047, 778)).toBe("ships"); // Medium Drone Mining Augmentor II
    expect(classifyPurchase(44992, 1875)).toBeNull(); // PLEX: tag it yourself
    expect(classifyPurchase(34, null)).toBeNull();
  });

  it("has an SQL twin covering every rule", () => {
    const sqlCase = purchaseCategorySqlCase("w.type_id", "t.group_id");
    for (const [typeId, groupId] of [
      [18066, 482],
      [16272, 423],
      [42830, 1771],
      [10246, 101],
      [62590, 515],
      [22544, 543],
      [32880, 25],
      [89647, 420],
    ] as const) {
      const category = classifyPurchase(typeId, groupId)!;
      const byType = sqlCase.includes(`WHEN w.type_id = ${typeId} THEN '${category}'`);
      const byGroup = sqlCase.includes(`WHEN t.group_id = ${groupId} THEN '${category}'`);
      expect(byType || byGroup).toBe(true);
    }
    // Type rules come first, as in classifyPurchase.
    expect(sqlCase.indexOf("w.type_id = 16272")).toBeLessThan(sqlCase.indexOf("t.group_id"));
    expect(sqlCase.endsWith("ELSE NULL END")).toBe(true);
  });

  it("decides the status: suggested by default, counted when switched on, your choice wins", () => {
    const s = (
      autoCategory: ExpenseCategory | null,
      overrideCategory: ExpenseCategory | null,
      overrideIncluded: boolean | null,
      autoInclude: boolean,
    ) => expenseStatus({ autoCategory, overrideCategory, overrideIncluded, autoInclude });
    expect(s("crystals", null, null, false)).toEqual({ category: "crystals", included: false, status: "suggested" });
    expect(s("crystals", null, null, true)).toEqual({ category: "crystals", included: true, status: "counted" });
    expect(s("crystals", null, false, true).status).toBe("excluded");
    expect(s("crystals", null, true, false).status).toBe("counted");
    expect(s(null, null, null, true)).toEqual({ category: null, included: false, status: "untagged" });
    expect(s(null, "other", true, false)).toEqual({ category: "other", included: true, status: "counted" });
    expect(s("crystals", "ships", null, false)).toEqual({ category: "ships", included: false, status: "suggested" });
    expect(EXPENSE_CATEGORIES).toContain("subscription");
  });
});

describe("sale auto-tagging", () => {
  it("tags ore, its compressed variants and refined products by group", () => {
    expect(classifySale(462, 25)).toBe("ore"); // (Compressed) Veldspar
    expect(classifySale(18, 4)).toBe("ore"); // Mineral
    expect(classifySale(1884, 25)).toBe("moon"); // (Compressed) Ubiquitous moon ore
    expect(classifySale(427, 4)).toBe("moon"); // Moon Materials
    expect(classifySale(465, 25)).toBe("ice"); // (Compressed) Ice: asteroid category, but ice
    expect(classifySale(903, 25)).toBe("ice");
    expect(classifySale(423, 4)).toBe("ice"); // Ice Product
    expect(classifySale(711, 2)).toBe("gas");
    expect(classifySale(4168, 2)).toBe("gas"); // Compressed Gas
    expect(classifySale(543, 6)).toBeNull(); // an Exhumer
    expect(classifySale(null, null)).toBeNull();
  });

  it("has an SQL twin checking groups before the Asteroid category", () => {
    const sqlCase = saleCategorySqlCase("t.group_id", "g.category_id");
    for (const [groupId, categoryId] of [
      [18, 4],
      [1923, 25],
      [427, 4],
      [465, 25],
      [423, 4],
      [4168, 2],
    ] as const) {
      expect(sqlCase).toContain(`WHEN t.group_id = ${groupId} THEN '${classifySale(groupId, categoryId)}'`);
    }
    expect(sqlCase.indexOf("t.group_id = 465")).toBeLessThan(sqlCase.indexOf("g.category_id = 25"));
    expect(sqlCase.endsWith("WHEN g.category_id = 25 THEN 'ore' ELSE NULL END")).toBe(true);
  });
});

describe("date buckets", () => {
  it("starts ISO weeks on Monday", () => {
    expect(startOfIsoWeek("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(startOfIsoWeek("2026-09-28")).toBe("2026-09-28"); // Monday
    expect(startOfIsoWeek("2026-01-01")).toBe("2025-12-29"); // across the year
  });

  it("buckets by day, week and month", () => {
    expect(bucketStart("2026-10-02", "day")).toBe("2026-10-02");
    expect(bucketStart("2026-10-02", "month")).toBe("2026-10-01");
    expect(bucketEnd("2026-09-28", "week")).toBe("2026-10-04");
    expect(bucketEnd("2026-02-01", "month")).toBe("2026-02-28");
    expect(bucketEnd("2024-02-01", "month")).toBe("2024-02-29");
    expect(bucketEnd("2026-12-01", "month")).toBe("2026-12-31");
  });
});

describe("P&L filters and scope", () => {
  it("keeps the fee page while paging purchases, and resets it when a shared filter changes", () => {
    const f = parsePnlFilters({ from: "2026-09-01", to: "2026-09-30", fpage: "3", page: "2" }, "2026-10-04");
    expect(f).toMatchObject({ page: 2, feePage: 3 });
    expect(pnlQueryString(f, { page: 3 })).toContain("fpage=3");
    expect(pnlQueryString(f, { from: "2026-08-01", page: 1 })).not.toContain("fpage");
    expect(pnlQueryString(f, { status: "suggested", page: 1 })).not.toContain("fpage");
    expect(parsePnlFilters({ fpage: "-2" }, "2026-10-04").feePage).toBe(1);
  });

  it("defaults to 30 days by day and round-trips", () => {
    const f = parsePnlFilters({}, "2026-10-02");
    expect(f).toMatchObject({ from: "2026-09-03", to: "2026-10-02", bucket: "day", status: "mining", page: 1 });
    const g = parsePnlFilters({ chars: "2,3", bucket: "week", status: "suggested", page: "2" }, "2026-10-02");
    expect(parsePnlFilters(Object.fromEntries(new URLSearchParams(pnlQueryString(g))), "2026-10-02")).toEqual(g);
    expect(parsePnlFilters({ bucket: "year", status: "bogus" }, "2026-10-02")).toMatchObject({ bucket: "day", status: "mining" });
  });

  it("never reaches beyond the account's own characters", () => {
    const val = { source: "jita_buy" as const, mode: "current" as const };
    const user = { id: "u", characterIds: [2, 3] };
    expect(pnlScope(user, { from: "a", to: "b", characters: [] }, val, 100)).toMatchObject({
      characterIds: [2, 3],
      narrowed: false,
      ledgerScope: { corp: false, ownCharacterIds: [2, 3] },
    });
    expect(pnlScope(user, { from: "a", to: "b", characters: [3, 9] }, val, 100)).toMatchObject({ characterIds: [3], narrowed: true });
    expect(pnlScope(user, { from: "a", to: "b", characters: [9] }, val, 100)).toMatchObject({ characterIds: [2, 3], narrowed: false });
  });
});

describe("P&L report", () => {
  const income = (date: string, characterId: number, oreClass: IncomeRow["oreClass"], value: number, volume: number): IncomeRow => ({
    date,
    characterId,
    oreClass,
    value,
    baseValue: value,
    volume,
    quantity: volume,
    unpricedRows: 0,
  });
  const expense = (date: string, characterId: number, amount: number, status: ExpenseRow["status"] = "counted"): ExpenseRow => ({
    date,
    characterId,
    category: "crystals",
    status,
    amount,
    count: 1,
  });
  const noActivity: ActivityStats = { total: { hours: 0, value: 0 }, byCharacter: new Map(), byActivity: new Map(), trackedSince: null };
  const base = {
    from: "2026-09-27",
    to: "2026-10-06",
    bucket: "week" as const,
    manual: [],
    characters: [
      { characterId: 1, name: "Main" },
      { characterId: 2, name: "Alt" },
    ],
  };

  it("buckets income and expenses and flags partial weeks", () => {
    const r = buildPnlReport({
      ...base,
      income: [income("2026-09-27", 1, "ore", 100, 10), income("2026-10-01", 2, "moon_r4", 300, 20)],
      expenses: [expense("2026-09-29", 1, 50), expense("2026-09-29", 2, 999, "suggested")],
      activity: noActivity,
    });
    expect(r.buckets.map((b) => [b.start, b.partial])).toEqual([
      ["2026-09-21", true],
      ["2026-09-28", false],
      ["2026-10-05", true],
    ]);
    expect(r.buckets[0].income).toBe(100);
    expect(r.buckets[1]).toMatchObject({ income: 300, expenses: 50, net: 250 });
    expect(r.buckets[1].incomeByClass.moon).toBe(300);
    expect(r.totals).toMatchObject({ income: 400, expenses: 50, net: 350, volume: 30 });
    expect(r.purchases.suggested).toEqual({ amount: 999, count: 1 });
    expect(r.costPerM3).toBeCloseTo(50 / 30);
    expect(r.characters.map((c) => [c.name, c.net])).toEqual([
      ["Alt", 300],
      ["Main", 50],
    ]);
    // No activity measured: ISK/h unknown, expenses split by m³.
    expect(r.iskPerHour).toEqual({ gross: null, net: null });
    expect(r.allocation).toBe("volume");
    expect(r.activities.find((a) => a.activity === "moon")?.expenses).toBeCloseTo(50 * (20 / 30));
  });

  it("uses measured hours for ISK/h and the activity split when they cover the income", () => {
    const r = buildPnlReport({
      ...base,
      income: [income("2026-10-01", 1, "ore", 1000, 10), income("2026-10-01", 2, "ice", 1000, 30)],
      expenses: [expense("2026-10-01", 1, 400)],
      manual: [{ date: "2026-10-02", characterId: null, category: "subscription", amount: 100 }],
      activity: {
        total: { hours: 2, value: 2000 },
        byCharacter: new Map([
          [1, { hours: 1, value: 1000 }],
          [2, { hours: 2, value: 1000 }],
        ]),
        byActivity: new Map([
          ["ore", { hours: 1, value: 1000 }],
          ["ice", { hours: 3, value: 1000 }],
        ]),
        trackedSince: new Date("2026-09-01T00:00:00Z"),
      },
    });
    expect(r.allocation).toBe("hours");
    expect(r.activities.map((a) => [a.activity, a.expenses])).toEqual([
      ["ore", 125],
      ["ice", 375],
    ]);
    expect(r.iskPerHour.gross).toBe(1000);
    expect(r.iskPerHour.net).toBe((2000 - 500) / 2);
    expect(r.activity).toMatchObject({ wallClockHours: 2, characterHours: 3, measuredShare: 1 });
    expect(r.characters.at(-1)).toMatchObject({ characterId: null, expenses: 100, net: -100 });
    expect(r.characters.find((c) => c.characterId === 2)?.iskPerHour).toBe(500);
    expect(r.byCategory).toEqual([
      { category: "crystals", amount: 400 },
      { category: "subscription", amount: 100 },
    ]);
  });

  it("counts wallet sales as income when the income comes from sales", () => {
    const sale = (date: string, characterId: number, category: SaleRow["category"], amount: number, status: SaleRow["status"] = "counted"): SaleRow => ({
      date,
      characterId,
      category,
      status,
      amount,
      gross: amount,
      tax: 0,
      count: 1,
    });
    const input = {
      ...base,
      income: [income("2026-09-28", 1, "ore", 1000, 10), income("2026-09-28", 2, "ice", 1000, 30)],
      sales: [sale("2026-10-02", 1, "ore", 900), sale("2026-10-02", 2, "moon", 300, "suggested"), sale("2026-10-05", 2, null, 50)],
      expenses: [expense("2026-09-29", 1, 100)],
      activity: {
        total: { hours: 2, value: 1000 },
        byCharacter: new Map([[1, { hours: 2, value: 1000 }]]),
        byActivity: new Map([["ore" as const, { hours: 2, value: 1000 }]]),
        trackedSince: null,
      },
    };

    const mined = buildPnlReport(input);
    expect(mined.incomeSource).toBe("mined");
    expect(mined.totals).toMatchObject({ income: 2000, minedIncome: 2000, salesIncome: 950 });

    const r = buildPnlReport({ ...input, incomeSource: "sales" });
    expect(r.totals).toMatchObject({ income: 950, minedIncome: 2000, salesIncome: 950, expenses: 100, net: 850, volume: 40 });
    expect(r.sales.suggested).toEqual({ amount: 300, count: 1 });
    // Sales land on the day of the sale, by income category (untagged-but-counted as "other").
    expect(r.buckets.map((b) => b.income)).toEqual([0, 900, 50]);
    expect(r.buckets[1].incomeByClass.ore).toBe(900);
    expect(r.buckets[2].incomeByClass.other).toBe(50);
    expect(r.characters.map((c) => [c.characterId, c.income, c.volume])).toEqual([
      [1, 900, 10],
      [2, 50, 30],
    ]);
    expect(r.activities.map((a) => [a.activity, a.income])).toEqual([
      ["ore", 900],
      ["ice", 0],
      ["other", 50],
    ]);
    // Activity still values the mined ore: half of the mined income was measured.
    expect(r.activity.measuredShare).toBe(0.5);
    expect(r.iskPerHour.gross).toBe(500);
  });

  it("counts broker fees as wallet expenses under their own category", () => {
    const fee = (date: string, characterId: number, amount: number, status: ExpenseRow["status"]): ExpenseRow => ({
      date,
      characterId,
      category: "fees",
      status,
      amount,
      count: 1,
    });
    const input = {
      ...base,
      income: [income("2026-09-28", 2, "ore", 1000, 10)],
      expenses: [expense("2026-09-29", 1, 100)],
      fees: [fee("2026-09-30", 1, 36, "counted"), fee("2026-09-30", 1, 15, "suggested"), fee("2026-10-01", 1, 99, "untagged")],
      activity: noActivity,
    };
    // On the mined value, the income rate covers selling costs: fees don't count.
    expect(buildPnlReport(input).totals).toMatchObject({ wallet: 100, fees: 0, expenses: 100 });

    const r = buildPnlReport({ ...input, incomeSource: "sales" });
    expect(r.totals).toMatchObject({ wallet: 136, fees: 36, expenses: 136, net: -136 });
    expect(r.fees.suggested).toEqual({ amount: 15, count: 1 });
    expect(r.purchases.suggested).toEqual({ amount: 0, count: 0 });
    expect(r.byCategory).toEqual([
      { category: "crystals", amount: 100 },
      { category: "fees", amount: 36 },
    ]);
    // The seller pays the tax: it lands on the selling character.
    expect(r.characters.find((c) => c.characterId === 1)).toMatchObject({ income: 0, expenses: 136 });
  });

  it("counts sales net of their sales tax", () => {
    const r = buildPnlReport({
      ...base,
      incomeSource: "sales",
      income: [],
      sales: [
        { date: "2026-09-30", characterId: 1, category: "ore", status: "counted", gross: 1000, tax: 34, amount: 966, count: 2 },
        { date: "2026-09-30", characterId: 1, category: "ore", status: "suggested", gross: 500, tax: 17, amount: 483, count: 1 },
      ],
      expenses: [],
      activity: noActivity,
    });
    expect(r.totals).toMatchObject({ income: 966, salesIncome: 966, salesTax: 34, expenses: 0 });
    expect(r.sales.suggested).toEqual({ amount: 483, count: 1 });
  });

  it("returns nulls rather than dividing by zero", () => {
    const r = buildPnlReport({ ...base, income: [], expenses: [], activity: noActivity });
    expect(r.costPerM3).toBeNull();
    expect(r.allocation).toBeNull();
    expect(r.activities).toEqual([]);
    expect(allocateByShare(100, new Map([["a", 0]]))).toEqual(new Map([["a", 0]]));
  });
});

describe("mined vs sold", () => {
  const row = (extra: Partial<OreFlowRow>): OreFlowRow => ({
    typeId: 1230,
    typeName: "Veldspar",
    oreClass: "ore",
    mined: 0,
    unitVolume: 0.1,
    minedValue: 0,
    sold: 0,
    soldCompressed: 0,
    soldIsk: 0,
    sales: 0,
    valuationUnitPrice: 10,
    ...extra,
  });

  it("works out what is left, the realised price and the value of unsold ore", () => {
    const { rows, totals } = summarizeOreFlows([
      row({ mined: 1000, minedValue: 10_000, sold: 600, soldCompressed: 450, soldIsk: 6600, sales: 2 }),
      // Sold more than was mined in the period: nothing left to value.
      row({ typeId: 45490, typeName: "Zeolites", oreClass: "moon_r4", unitVolume: 10, mined: 10, sold: 50, soldIsk: 400, valuationUnitPrice: null }),
    ]);
    expect(rows[0]).toMatchObject({ left: 400, soldUnitPrice: 11, vsValuation: 1.1, compressedShare: 0.75, leftValue: 4000 });
    expect(rows[1]).toMatchObject({ left: -40, soldUnitPrice: 8, vsValuation: null, leftValue: 0 });
    expect(totals).toEqual({ minedValue: 10_000, soldIsk: 7000, soldAtValuation: 6000, leftValue: 4000, leftVolume: 40 });
  });

  it("leaves prices empty when nothing was sold", () => {
    const { rows } = summarizeOreFlows([row({ mined: 100 })]);
    expect(rows[0]).toMatchObject({ soldUnitPrice: null, vsValuation: null, compressedShare: 0, leftValue: 1000 });
  });
});
