import { describe, expect, it } from "vitest";
import { matchingSystems } from "../src/modules/map/search";
import type { MapSystem } from "../src/modules/map/model";
const system = (id: number, name: string): MapSystem => [id, name, 0, 0, 0, 0];
const systems = [system(1, "New Jita"), system(2, "Jita Prime"), system(3, "Jita"), system(31000001, "J123456")];
describe("map system search", () => {
  it("ranks exact, prefix and substring matches consistently", () => {
    expect(matchingSystems(systems, " JITA ").map(s => s[1])).toEqual(["Jita", "Jita Prime", "New Jita"]);
    expect(matchingSystems(systems, "prime")[0]?.[1]).toBe("Jita Prime");
  });
  it("finds wormholes regardless of the currently displayed map space", () => {
    expect(matchingSystems(systems, "j123", 1)[0]?.[0]).toBe(31000001);
  });
  it("has no selection for blank or missing matches and respects result limits", () => {
    expect(matchingSystems(systems, " ")).toEqual([]);
    expect(matchingSystems(systems, "missing")).toEqual([]);
    expect(matchingSystems(systems, "jita", 1)).toHaveLength(1);
  });
});