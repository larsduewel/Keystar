import { describe, expect, it } from "vitest";
import { assignTypes, candidateNames, countItemLines, MAX_LINES, MAX_QUANTITY, parseAppraisalInput, parseQuantity } from "@/modules/trade/appraisal/parse";
import { appraisalId } from "@/modules/trade/appraisal/appraise";
import { splitPrice, totalsOf } from "@/modules/trade/appraisal/types";

const first = (text: string) => parseAppraisalInput(text).map((l) => l.candidates[0]);

describe("appraisal quantities", () => {
  it("reads English and German thousands, plain and odd separators", () => {
    expect(parseQuantity("1,000")).toBe(1000);
    expect(parseQuantity("1.000")).toBe(1000);
    expect(parseQuantity("8.904")).toBe(8904);
    expect(parseQuantity("1.234.567")).toBe(1234567);
    expect(parseQuantity("1'000")).toBe(1000);
    expect(parseQuantity("1 000")).toBe(1000);
    expect(parseQuantity("12")).toBe(12);
    expect(parseQuantity("10.0")).toBe(10);
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("")).toBeNull();
  });

  it("refuses quantities above MAX_QUANTITY instead of returning Infinity", () => {
    expect(parseQuantity(String(MAX_QUANTITY))).toBe(MAX_QUANTITY);
    expect(parseQuantity(String(MAX_QUANTITY + 1))).toBeNull();
    expect(parseQuantity("9".repeat(400))).toBeNull();
    expect(parseQuantity(`1${",000".repeat(120)}`)).toBeNull();
    expect(parseQuantity(`${"9".repeat(400)}.5`)).toBeNull();
    // The line can still be read as a name, never as Infinity × Tritanium.
    expect(first(`Tritanium x ${"9".repeat(400)}`)[0].quantity).toBe(1);
  });
});

describe("appraisal paste formats", () => {
  it("parses inventory, contract and survey scanner copies (tab separated)", () => {
    expect(
      first("Tritanium\t12,000\tMineral\t\t\t120 m3\t60,000.00 ISK\nRifter\t\tFrigate\tShip\nScordite III-Grade\t8.904\t1.335 m3\t168.000,00 ISK\t25 km"),
    ).toEqual([
      { name: "Tritanium", quantity: 12000 },
      { name: "Rifter", quantity: 1 },
      { name: "Scordite III-Grade", quantity: 8904 },
    ]);
  });

  it("parses an EFT fitting", () => {
    const lines = parseAppraisalInput(`[Rifter, Roam fit]
Damage Control II
[Empty Low slot]

200mm AutoCannon II, EMP S
Warrior II x5
Nanite Repair Paste x100`);
    expect(lines.map((l) => l.candidates[0])).toEqual([
      { name: "Rifter", quantity: 1 },
      { name: "Damage Control II", quantity: 1 },
      { name: "200mm AutoCannon II, EMP S", quantity: 1 },
      { name: "Warrior II", quantity: 5 },
      { name: "Nanite Repair Paste", quantity: 100 },
    ]);
    // The module behind "Module, Charge" is a later candidate.
    expect(lines[2].candidates).toContainEqual({ name: "200mm AutoCannon II", quantity: 1 });
  });

  it("parses d-scan lines by their type column", () => {
    expect(first("587\tSomeone's Rifter\tRifter\t1.2 AU\n670\tCapsule\tCapsule\t-")).toEqual([
      { name: "Rifter", quantity: 1 },
      { name: "Capsule", quantity: 1 },
    ]);
  });

  it("parses free text quantities on either side", () => {
    const parsed = parseAppraisalInput("Tritanium x 1000\n50x Mexallon\n10 x Pyerite\n250 Isogen\nNocxium 75\nZydrine\t30");
    const pick = (i: number, name: string) => parsed[i].candidates.find((c) => c.name === name);
    expect(pick(0, "Tritanium")?.quantity).toBe(1000);
    expect(pick(1, "Mexallon")?.quantity).toBe(50);
    expect(pick(2, "Pyerite")?.quantity).toBe(10);
    expect(pick(3, "Isogen")?.quantity).toBe(250);
    expect(pick(4, "Nocxium")?.quantity).toBe(75);
    expect(parsed[5].candidates[0]).toEqual({ name: "Zydrine", quantity: 30 });
  });

  it("parses killmail item lines", () => {
    const parsed = parseAppraisalInput("Tritanium, Qty: 1,000 (Cargo)\n200mm AutoCannon II (Fitted)");
    expect(parsed[0].candidates[0]).toEqual({ name: "Tritanium", quantity: 1000 });
    expect(parsed[1].candidates).toContainEqual({ name: "200mm AutoCannon II", quantity: 1 });
  });

  it("prefers the whole line when it is an item name ending in a number", () => {
    const lines = parseAppraisalInput("Cap Booster 800\n10 Cap Booster 800");
    const known = new Map([
      ["cap booster 800", 263],
      ["cap booster", 999],
    ]);
    const { items, unparsed } = assignTypes(lines, (n) => known.get(n));
    expect(unparsed).toEqual([]);
    expect(items).toEqual([{ typeId: 263, quantity: 11 }]);
  });

  it("sums repeated items and reports unknown lines", () => {
    const lines = parseAppraisalInput("Tritanium 100\ntritanium x 50\nTotal: 150\n\n   \nNot an item at all");
    const { items, unparsed } = assignTypes(lines, (n) => (n === "tritanium" ? 34 : undefined));
    expect(items).toEqual([{ typeId: 34, quantity: 150 }]);
    expect(unparsed.map((u) => u.line)).toEqual([3, 6]);
    expect(candidateNames(lines)).toContain("Tritanium");
  });

  it("never drops lines silently; the line limit is checked up front", () => {
    const big = Array.from({ length: MAX_LINES + 5 }, (_, i) => `Item ${i}`).join("\n");
    expect(parseAppraisalInput(big)).toHaveLength(MAX_LINES + 5);
    expect(countItemLines(`${big}\n\n   \r\n`)).toBe(MAX_LINES + 5);
  });

  it("strips the market's owned marker and blueprint copy suffix", () => {
    expect(first("Rifter*\nRifter Blueprint (Copy)")).toEqual([
      { name: "Rifter", quantity: 1 },
      { name: "Rifter Blueprint", quantity: 1 },
    ]);
  });
});

describe("appraisal totals", () => {
  it("sums buy, sell, split and packaged volume", () => {
    const items = [
      { typeId: 34, name: "Tritanium", quantity: 1000, buy: 4, sell: 5, volume: 0.01 },
      { typeId: 587, name: "Rifter", quantity: 2, buy: null, sell: 500_000, volume: 2500 },
      { typeId: 1, name: "Unpriced", quantity: 3, buy: null, sell: null, volume: 1 },
    ];
    expect(splitPrice(items[0])).toBe(4.5);
    expect(splitPrice(items[1])).toBe(500_000);
    expect(totalsOf(items)).toEqual({
      buy: 4000,
      sell: 1_005_000,
      split: 1_004_500,
      volume: 5013,
      quantity: 1005,
      types: 3,
      unpriced: 1,
    });
  });

  it("generates unguessable share ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => appraisalId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{10}$/);
  });
});
