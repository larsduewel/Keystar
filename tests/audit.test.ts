import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
vi.mock("@/core/db", () => ({ auditLog: {}, getDb: () => ({ insert }) }));

const { audit, auditFailures, auditInTx } = await import("@/core/audit");

const failingInsert = () => ({ values: () => Promise.reject(new Error("connection terminated")) });

describe("audit", () => {
  beforeEach(() => {
    insert.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("never throws, but counts failed writes for System Info", async () => {
    const before = auditFailures().count;
    insert.mockImplementation(failingInsert);
    await expect(audit({ action: "user.login" })).resolves.toBeUndefined();
    expect(auditFailures()).toMatchObject({ count: before + 1, lastAction: "user.login" });

    insert.mockImplementation(() => ({ values: () => Promise.resolve() }));
    await audit({ action: "user.login" });
    expect(auditFailures().count).toBe(before + 1);
  });

  it("lets a failed write inside a transaction roll the change back", async () => {
    const before = auditFailures().count;
    const tx = { insert: vi.fn(failingInsert) };
    await expect(auditInTx(tx as never, { action: "user.role.changed" })).rejects.toThrow("connection terminated");
    expect(auditFailures().count).toBe(before);
  });
});
