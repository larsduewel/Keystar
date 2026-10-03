import { describe, expect, it } from "vitest";
import { validBrowserStats } from "@/modules/intel/browser-stats";

describe("browser statistics validation", () => {
  const stats = { info: { id: 123 }, shipsDestroyed: 50, shipsLost: 3 };
  it("accepts matching entity statistics, including zero history", () => {
    expect(validBrowserStats(123, stats)).toBe(true);
    expect(validBrowserStats(123, { ...stats, shipsDestroyed: 0, shipsLost: 0 })).toBe(true);
  });
  it("rejects another entity, errors and invalid counters", () => {
    expect(validBrowserStats(456, stats)).toBe(false);
    for (const bad of [null, [], {}, { ...stats, error: "Invalid id" }, { ...stats, shipsLost: -1 }, { ...stats, shipsDestroyed: Infinity }]) expect(validBrowserStats(123, bad)).toBe(false);
  });
});
