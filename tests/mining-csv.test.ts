import { describe, expect, it } from "vitest";
import { csvCell } from "@/modules/mining/csv";

describe("csvCell", () => {
  it("leaves negative numbers unchanged", () => {
    expect(csvCell("-0.45")).toBe("-0.45");
    expect(csvCell("-1.00")).toBe("-1.00");
    expect(csvCell(-5)).toBe("-5");
  });

  it("neutralises formulas in text", () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell("-1+1")).toBe(`"'-1+1"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("+cmd")).toBe(`"'+cmd"`);
  });

  it("quotes and handles null", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(null)).toBe("");
  });
});
