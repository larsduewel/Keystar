import { beforeEach, it, expect, vi } from "vitest";
import { emptyLedger } from "@/modules/loot/types";
const h = vi.hoisted(() => ({
  auth: vi.fn(),
  getDb: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/core/auth/dal", () => ({ assertPermission: h.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/core/db", () => ({
  getDb: h.getDb,
  lootOperations: { id: "id", ownerId: "ownerId", createdAt: "createdAt" },
  fleetTrackers: { userId: "userId", fleetId: "fleetId" },
}));
import { updateLootOperation } from "@/app/(app)/loot/actions";
const id = "36b8329c-e0a4-48e8-8563-cae0af887425";
let op: {
  id: string;
  ownerId: string;
  revision: number;
  closed: boolean;
  ledger: ReturnType<typeof emptyLedger>;
  syncStatus: string;
  startsAt: Date;
  endsAt: Date;
  shared: boolean;
};
beforeEach(() => {
  vi.clearAllMocks();
  op = {
    id,
    ownerId: "owner",
    revision: 1,
    closed: false,
    ledger: emptyLedger(),
    syncStatus: "ready",
    startsAt: new Date("2026-11-14T00:00:00Z"),
    endsAt: new Date("2026-11-14T23:59:59Z"),
    shared: false,
  };
  h.auth.mockResolvedValue({ id: "owner" });
  h.getDb.mockReturnValue({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from: () => ({ where: () => ({ for: async () => [op] }) }),
        }),
        update: h.update,
      }),
  });
  h.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
});
it("requires permission before any read", async () => {
  h.auth.mockRejectedValue(new Error("denied"));
  await expect(updateLootOperation(id, 1, { kind: "sync" })).rejects.toThrow();
  expect(h.getDb).not.toHaveBeenCalled();
});
it("denies non-organizers even on shared ledgers", async () => {
  op.shared = true;
  h.auth.mockResolvedValue({ id: "other" });
  await expect(updateLootOperation(id, 1, { kind: "sync" })).rejects.toThrow(
    "access",
  );
  expect(h.update).not.toHaveBeenCalled();
});
it("rejects stale revisions and closed-ledger edits", async () => {
  await expect(updateLootOperation(id, 0, { kind: "sync" })).rejects.toThrow(
    "conflict",
  );
  op.closed = true;
  await expect(updateLootOperation(id, 1, { kind: "sync" })).rejects.toThrow(
    "closed",
  );
});
it("rejects duplicate imports and out-of-window entries", async () => {
  await updateLootOperation(id, 1, {
    kind: "import",
    text: "Tritanium\t10",
    collector: "Pilot",
  });
  await expect(
    updateLootOperation(id, 1, {
      kind: "import",
      text: "Tritanium\t10",
      collector: "Pilot",
    }),
  ).rejects.toThrow("duplicate");
  await expect(
    updateLootOperation(id, 1, {
      kind: "import",
      text: "Time\tCharacter\tItem Type\tQuantity\n2026.11.13 12:00:00\tPilot\tTritanium\t10",
      collector: "",
    }),
  ).rejects.toThrow("window");
});
it("refuses over-allocation of a killmail drop", async () => {
  const itemId = "16b8329c-e0a4-48e8-8563-cae0af887425";
  op.ledger.kills = [
    {
      id: 10,
      time: "2026-11-14T18:00:00Z",
      victim: 1,
      items: [{ typeId: 34, quantity: 5 }],
    },
  ];
  op.ledger.items = [
    {
      id: itemId,
      name: "Tritanium",
      typeId: 34,
      quantity: 10,
      collector: "Pilot",
      time: null,
      price: 10,
      pricedAt: null,
      status: "collected",
      proceeds: null,
      retainedBy: null,
      killmailId: null,
      match: "unmatched",
      candidates: [],
      importKey: "a",
    },
  ];
  await expect(
    updateLootOperation(id, 1, {
      kind: "item",
      id: itemId,
      status: "collected",
      price: 10,
      proceeds: null,
      retainedBy: null,
      killmailId: 10,
      match: "confirmed",
    }),
  ).rejects.toThrow("allocation");
});
