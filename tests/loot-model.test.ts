import { describe, it, expect } from "vitest";
import {
  parseLoot,
  settlement,
  matchLoot,
  canReadOperation,
} from "@/modules/loot/model";
import { emptyLedger, type LootItem } from "@/modules/loot/types";
const item = (overrides: Partial<LootItem> = {}): LootItem => ({
  id: "a",
  name: "Tritanium",
  quantity: 10,
  collector: "Pilot",
  time: null,
  typeId: 34,
  price: 10,
  pricedAt: null,
  status: "collected",
  proceeds: null,
  retainedBy: null,
  killmailId: null,
  match: "unmatched",
  candidates: [],
  importKey: "a",
  ...overrides,
});
const participant = (id: string, payee = id) => ({
  id,
  name: id,
  characterId: null,
  payee,
  weight: 1,
  paid: 0,
  source: "manual" as const,
});
describe("loot imports", () => {
  it("reads exported rows in UTC with collector and quantity", () => {
    expect(
      parseLoot(
        "Time\tCharacter\tItem Type\tQuantity\n2026.11.14 18:30:00\tPilot A\tTritanium\t1,000",
        "",
      ),
    ).toEqual([
      {
        name: "Tritanium",
        quantity: 1000,
        collector: "Pilot A",
        time: "2026-11-14T18:30:00.000Z",
      },
    ]);
  });
  it("supports inventory lists without inventing times", () =>
    expect(parseLoot("Tritanium\t10", "Pilot")[0].time).toBeNull());
  it("rejects malformed rows and unknown collectors instead of discarding them", () => {
    for (const text of [
      "Tritanium\t-1",
      "Tritanium\t1.2",
      "Tritanium\t0",
      "Tritanium\t10\nBad row",
      "Tritanium\t1000000001",
    ])
      expect(() => parseLoot(text, "Pilot")).toThrow();
    expect(() => parseLoot("Tritanium\t10", "")).toThrow();
  });
});
describe("loot settlement", () => {
  it("groups alts as one share and subtracts expenses and corporation cut", () => {
    const ledger = emptyLedger();
    ledger.participants = [
      participant("Main"),
      participant("Alt", "Main"),
      participant("Other"),
    ];
    ledger.items = [item({ quantity: 100 })];
    ledger.expenses = 100;
    ledger.corpPercent = 10;
    const result = settlement(ledger);
    expect(result.corp).toBe(90);
    expect(result.shares.map((p) => p.entitlement)).toEqual([405, 405]);
  });
  it("never counts a handover twice and credits retained loot against cash", () => {
    const ledger = emptyLedger();
    ledger.participants = [participant("A"), participant("B")];
    ledger.basis = "sales";
    ledger.items = [
      item({ status: "sold", proceeds: 80 }),
      item({ id: "b", status: "retained", retainedBy: "A" }),
      item({ id: "c", status: "handed" }),
      item({ id: "d", status: "excluded" }),
    ];
    const result = settlement(ledger);
    expect(result.gross).toBe(180);
    expect(result.shares[0].balance).toBe(-10);
    expect(result.shares[1].balance).toBe(90);
  });
  it("flags missing prices, handles zero weights and rounds cents without losing money", () => {
    const ledger = emptyLedger();
    ledger.participants = [
      participant("A"),
      participant("B"),
      participant("C"),
    ];
    ledger.items = [item({ quantity: 1, price: 100 })];
    expect(settlement(ledger).shares.map((p) => p.entitlement)).toEqual([
      33.34, 33.33, 33.33,
    ]);
    ledger.items[0].price = null;
    expect(settlement(ledger).missing).toBe(1);
    ledger.participants.forEach((p) => (p.weight = 0));
    expect(settlement(ledger).shares.every((p) => p.balance === 0)).toBe(true);
  });
});
it("killmail matches remain suggestions and require sufficient dropped quantity before loot time", () => {
  const ledger = emptyLedger();
  ledger.kills = [
    {
      id: 1,
      time: "2026-11-14T18:00:00Z",
      victim: 1,
      items: [{ typeId: 34, quantity: 10 }],
    },
    {
      id: 2,
      time: "2026-11-14T20:00:00Z",
      victim: 1,
      items: [{ typeId: 34, quantity: 20 }],
    },
  ];
  const result = matchLoot(
    [item({ time: "2026-11-14T19:00:00Z" })],
    ledger,
    Date.parse("2026-11-14T21:00:00Z"),
  );
  expect(result[0].candidates).toEqual([1]);
  expect(result[0].match).toBe("possible");
  expect(matchLoot([item({ quantity: 50 })], ledger, Date.now())[0].match).toBe(
    "unmatched",
  );
});
it("shared operations remain restricted to listed linked character IDs", () => {
  const ledger = emptyLedger();
  ledger.participants = [{ ...participant("Pilot"), characterId: 123 }];
  expect(
    canReadOperation({ ownerId: "owner", shared: false, ledger }, "owner", []),
  ).toBe(true);
  expect(
    canReadOperation({ ownerId: "owner", shared: false, ledger }, "other", [
      123,
    ]),
  ).toBe(false);
  expect(
    canReadOperation({ ownerId: "owner", shared: true, ledger }, "other", [
      123,
    ]),
  ).toBe(true);
  expect(
    canReadOperation({ ownerId: "owner", shared: true, ledger }, "other", [
      456,
    ]),
  ).toBe(false);
});

it("recalculates payouts when characters are manually excluded", () => {
  const ledger = emptyLedger();
  ledger.participants = [
    participant("Main"),
    { ...participant("Alt"), eligible: false },
    participant("Other"),
  ];
  ledger.items = [item({ quantity: 100 })];
  expect(settlement(ledger).shares.map((p) => p.entitlement)).toEqual([
    500, 0, 500,
  ]);
  ledger.participants[2].eligible = false;
  expect(settlement(ledger).shares.map((p) => p.entitlement)).toEqual([
    1000, 0, 0,
  ]);
});

describe("copied EVE loot history", () => {
  it("reads multi-word pilots, quoted item names and grouped quantities from actual copied lines", () => {
    const result = parseLoot(
      "21:06:00 Ancient Wolf has looted 1 x Glorification-1 'Devana' Filament\n21:06:00 Ancient Wolf has looted 3,005 x Nova Fury Heavy Missile\n21:06:00 Cornelius York has looted 1 x Republic Fleet Large Cap Battery\n20:39:20 Toastbrotkillor has looted 22 x Warp Disrupt Probe",
      "",
      "2026-11-14",
    );
    expect(result[0]).toEqual({
      name: "Glorification-1 'Devana' Filament",
      quantity: 1,
      collector: "Ancient Wolf",
      time: "2026-11-14T21:06:00.000Z",
    });
    expect(result[1].quantity).toBe(3005);
    expect(result[2].collector).toBe("Cornelius York");
    expect(result[3].time).toBe("2026-11-14T20:39:20.000Z");
  });
  it("requires an explicit date and refuses invalid times or malformed quantities", () => {
    expect(() =>
      parseLoot("21:06:00 Ancient Wolf has looted 1 x Item", ""),
    ).toThrow("date");
    for (const line of [
      "24:06:00 Ancient Wolf has looted 1 x Item",
      "21:06:00 Ancient Wolf has looted 3,00 x Item",
    ])
      expect(() => parseLoot(line, "", "2026-11-14")).toThrow("line:1");
  });
  it("preserves ISO timestamp fractions in tab-separated exports", () => {
    expect(
      parseLoot(
        "Time\tCharacter\tItem Type\tQuantity\n2026-11-14T21:06:00.123Z\tPilot\tTritanium\t10",
        "",
      )[0].time,
    ).toBe("2026-11-14T21:06:00.123Z");
  });
});

describe("per-loot attendance shares", () => {
  const visit = (joined: string, left: string | null) => ({
    joined: `2026-11-14T${joined}:00Z`,
    lastSeen: "2026-11-14T23:00:00Z",
    left: left ? `2026-11-14T${left}:00Z` : null,
    stopped: false,
  });
  it("excludes late joiners from earlier loot, but includes them in later loot", () => {
    const ledger = emptyLedger();
    ledger.splitMode = "atLoot";
    ledger.attendanceFrom = "2026-11-14T17:00:00Z";
    ledger.participants = [
      { ...participant("A"), attendance: [visit("18:00", "20:00")] },
      { ...participant("B"), attendance: [visit("19:00", "20:00")] },
    ];
    ledger.items = [
      item({ time: "2026-11-14T18:30:00Z" }),
      item({ id: "b", time: "2026-11-14T19:30:00Z" }),
    ];
    expect(settlement(ledger).shares.map((p) => p.entitlement)).toEqual([
      150, 50,
    ]);
    ledger.expenses = 20;
    ledger.corpPercent = 10;
    expect(settlement(ledger).shares.map((p) => p.entitlement)).toEqual([
      121.5, 40.5,
    ]);
  });
  it("keeps rejoin gaps, missing timestamps and unobserved future attendance unallocated", () => {
    const ledger = emptyLedger();
    ledger.splitMode = "atLoot";
    ledger.attendanceFrom = "2026-11-14T17:00:00Z";
    ledger.participants = [
      {
        ...participant("A"),
        attendance: [visit("18:00", "19:00"), visit("21:00", "22:00")],
      },
    ];
    ledger.items = [
      item({ time: "2026-11-14T20:00:00Z" }),
      item({ id: "b", time: null }),
    ];
    expect(settlement(ledger).unallocated).toBe(200);
    expect(settlement(ledger).shares[0].entitlement).toBe(0);
    ledger.participants[0].attendance = [
      { ...visit("18:00", null), lastSeen: "2026-11-14T19:00:00Z" },
    ];
    expect(settlement(ledger).unallocated).toBe(200);
  });
  it("respects alt exclusions and groups mains/alts once per loot event", () => {
    const ledger = emptyLedger();
    ledger.splitMode = "atLoot";
    ledger.attendanceFrom = "2026-11-14T17:00:00Z";
    ledger.participants = [
      { ...participant("Main"), attendance: [visit("18:00", null)] },
      { ...participant("Alt", "Main"), attendance: [visit("18:00", null)] },
      { ...participant("Other"), attendance: [visit("18:00", null)] },
    ];
    ledger.items = [item({ time: "2026-11-14T19:00:00Z" })];
    expect(settlement(ledger).shares.map((p) => p.entitlement)).toEqual([
      50, 50,
    ]);
    ledger.participants[2].eligible = false;
    expect(settlement(ledger).shares.map((p) => p.entitlement)).toEqual([
      100, 0,
    ]);
  });
});

it("does not use the current roster to distribute loot from before tracking began", () => {
  const ledger = emptyLedger();
  ledger.splitMode = "atLoot";
  ledger.attendanceFrom = "2026-11-14T20:00:00Z";
  ledger.participants = [
    {
      ...participant("A"),
      attendance: [
        {
          joined: "2026-11-14T18:00:00Z",
          lastSeen: "2026-11-14T23:00:00Z",
          left: null,
          stopped: false,
        },
      ],
    },
  ];
  ledger.items = [item({ time: "2026-11-14T19:00:00Z" })];
  expect(settlement(ledger).unallocated).toBe(100);
  expect(settlement(ledger).shares[0].entitlement).toBe(0);
});
