import { describe, expect, it } from "vitest";
import { dedupeCharacterLedger, dedupeObserverLedger } from "@/modules/mining/dedupe";

describe("character ledger dedupe", () => {
  it("keeps one row per key with the larger quantity", () => {
    const rows = dedupeCharacterLedger([
      { date: "2026-10-01", solarSystemId: 1, typeId: 10, quantity: 100 },
      { date: "2026-10-01", solarSystemId: 2, typeId: 10, quantity: 50 },
      { date: "2026-10-01", solarSystemId: 1, typeId: 10, quantity: 120 },
      { date: "2026-10-01", solarSystemId: 1, typeId: 10, quantity: 90 },
    ]);
    expect(rows).toEqual([
      { date: "2026-10-01", solarSystemId: 1, typeId: 10, quantity: 120 },
      { date: "2026-10-01", solarSystemId: 2, typeId: 10, quantity: 50 },
    ]);
  });
});

describe("observer ledger dedupe", () => {
  const row = (recordedCorporationId: number, quantity: number, typeId = 10) => ({
    observerId: 7,
    characterId: 1,
    date: "2026-10-01",
    typeId,
    recordedCorporationId,
    quantity,
  });

  it("keeps the larger quantity for a repeat under the same corporation", () => {
    expect(dedupeObserverLedger([row(100, 500), row(100, 400)])).toEqual([row(100, 500)]);
  });

  it("adds up totals across corporations and keeps the last one listed", () => {
    expect(dedupeObserverLedger([row(100, 500), row(200, 300)])).toEqual([row(200, 800)]);
    expect(dedupeObserverLedger([row(200, 300), row(100, 500), row(200, 250)])).toEqual([row(200, 800)]);
  });

  it("leaves distinct keys alone", () => {
    const rows = [row(100, 500, 10), row(100, 500, 11)];
    expect(dedupeObserverLedger(rows)).toEqual(rows);
  });
});
