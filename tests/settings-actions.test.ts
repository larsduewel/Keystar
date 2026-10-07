import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(() => {
    throw new Error("nothing may be read or written");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/core/auth/dal", () => ({ assertPermission: async () => ({ id: "admin", main: { name: "Admin" } }) }));
vi.mock("@/core/db", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: mocks.getDb }));

const { isSettingValue } = await import("@/core/settings");
const { saveSettings } = await import("@/app/(app)/admin/actions");
const { saveSetupAccess } = await import("@/app/setup/actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = {
  homeCorporationId: "98765432",
  autoApproveCorpMembers: "on",
  restrictToMembers: "on",
  valuationSource: "jita_sell",
  valuationMode: "historical",
};

describe("isSettingValue", () => {
  it("checks values against the setting's schema", () => {
    expect(isSettingValue("mining.valuationSource", "jita_split")).toBe(true);
    expect(isSettingValue("mining.valuationSource", "jita_bogus")).toBe(false);
    expect(isSettingValue("mining.valuationSource", null)).toBe(false);
    expect(isSettingValue("corp.homeCorporationId", null)).toBe(true);
    expect(isSettingValue("corp.homeCorporationId", -1)).toBe(false);
  });
});

describe("settings forms refuse invalid input before writing anything", () => {
  beforeEach(() => {
    mocks.getDb.mockClear();
  });

  it.each([
    ["an unknown valuation source", { ...valid, valuationSource: "jita_bogus" }],
    ["an unknown valuation mode", { ...valid, valuationMode: "tomorrow" }],
    ["a missing valuation source", { ...valid, valuationSource: "" }],
  ])("admin settings: %s", async (_, values) => {
    expect(await saveSettings(form(values))).toEqual({ ok: false, error: "invalidValuation" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("admin settings: an invalid corporation ID", async () => {
    expect(await saveSettings(form({ ...valid, homeCorporationId: "abc" }))).toEqual({
      ok: false,
      error: "invalidCorporation",
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("setup: an unknown valuation source", async () => {
    expect(await saveSetupAccess(form({ valuationSource: "jita_bogus" }))).toEqual({ ok: false, error: "invalidValuation" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
