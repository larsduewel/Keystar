import { describe, expect, it } from "vitest";
import { failingJobs, jobTotals } from "@/app/(app)/admin/system/system-view";
import { MESSAGES } from "@/i18n/messages";
import { pilotEntityRow, shipEntityRow, tableColumns } from "@/modules/killboard/table-rows";
import { reviewTotals, suggestedCount, tabTotal } from "@/modules/mining/pnl/review-totals";

/** The pure parts of the page components: what the panels show, computed from the rows the queries return. */

describe("review page totals", () => {
  const purchases = [
    { status: "counted" as const, amount: 100, count: 2 },
    { status: "suggested" as const, amount: 50, count: 1 },
    { status: "untagged" as const, amount: 7, count: 3 },
  ];
  const fees = [
    { status: "suggested" as const, amount: 5, count: 4 },
    { status: "excluded" as const, amount: 9, count: 1 },
  ];
  const totals = reviewTotals([...purchases, ...fees]);

  it("adds purchases and broker fees per status", () => {
    expect(totals).toEqual({
      counted: { amount: 100, count: 2 },
      suggested: { amount: 55, count: 5 },
      excluded: { amount: 9, count: 1 },
      untagged: { amount: 7, count: 3 },
    });
  });

  it("counts what 'include all' would count, separately for purchases and fees", () => {
    expect(suggestedCount(purchases)).toBe(1);
    expect(suggestedCount(fees)).toBe(4);
  });

  it("covers everything tagged as a mining cost on the 'mining' tab, decided or not", () => {
    expect(tabTotal(totals, "mining")).toEqual({ amount: 164, count: 8 });
    expect(tabTotal(totals, "untagged")).toEqual({ amount: 7, count: 3 });
  });

  it("is all zeros without rows", () => {
    expect(tabTotal(reviewTotals([]), "mining")).toEqual({ amount: 0, count: 0 });
    expect(suggestedCount([])).toBe(0);
  });
});

describe("system page worker figures", () => {
  const job = (over: Partial<Parameters<typeof jobTotals>[0][number]>) => ({
    jobKey: "x",
    ownerType: "global" as const,
    enabled: 1,
    disabled: 0,
    ok: 0,
    error: 0,
    running: 0,
    pending: 0,
    skipped: 0,
    failingOwners: 0,
    maxStreak: 0,
    avgMs: null,
    maxMs: null,
    overdue: 0,
    staleLocks: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    ...over,
  });

  it("sums the per-job counts", () => {
    expect(jobTotals([job({ ok: 3, error: 1 }), job({ running: 2, overdue: 1, error: 2 })])).toEqual({ ok: 3, error: 3, running: 2, overdue: 1 });
    expect(jobTotals([])).toEqual({ ok: 0, error: 0, running: 0, overdue: 0 });
  });

  it("folds the errors of one job key into one row with the latest error and the longest streak", () => {
    const rows = failingJobs([
      { jobKey: "mining.ledger", ownerType: "character", error: "old", consecutiveFailures: 2, lastRunAt: "2026-10-01T00:00:00Z" },
      { jobKey: "mining.ledger", ownerType: "character", error: "new", consecutiveFailures: 5, lastRunAt: "2026-10-02T00:00:00Z" },
      { jobKey: "core.server-status", ownerType: "global", error: "down", consecutiveFailures: 1, lastRunAt: null },
    ]);
    expect(rows).toEqual([
      { jobKey: "mining.ledger", owners: 2, streak: 5, error: "new", lastRunAt: "2026-10-02T00:00:00Z" },
      { jobKey: "core.server-status", owners: 1, streak: 1, error: "down", lastRunAt: null },
    ]);
  });
});

describe("killboard table rows", () => {
  const t = MESSAGES.en;

  it("derives efficiency and net ISK for ships and pilots", () => {
    const ship = shipEntityRow(
      { typeId: 587, name: "Rifter", kills: 4, destroyed: 300, losses: 1, lost: 100, killsDelta: 2, lossesDelta: -1 },
      t,
    );
    expect(ship.name).toBe("Rifter");
    expect(ship.href).toContain("587");
    expect(ship.values.efficiency).toBeCloseTo(0.75);
    expect(ship.values.net).toBe(200);

    const pilot = pilotEntityRow(
      { characterId: 42, name: null, kills: 0, losses: 0, finalBlows: 0, solo: 0, destroyed: 0, lost: 0, killsDelta: 0, lossesDelta: 0 },
      t,
    );
    expect(pilot.name).toBe(t.killboard.fallback.character(42));
    expect(pilot.values.efficiency).toBeNull();
  });

  it("only uses column keys the rows provide", () => {
    const columns = tableColumns(t);
    const ship = shipEntityRow({ typeId: 1, name: "x", kills: 1, destroyed: 1, losses: 1, lost: 1, killsDelta: 0, lossesDelta: 0 }, t);
    const pilot = pilotEntityRow(
      { characterId: 1, name: "y", kills: 1, losses: 1, finalBlows: 1, solo: 1, destroyed: 1, lost: 1, killsDelta: 0, lossesDelta: 0 },
      t,
    );
    for (const c of [...columns.effective, ...columns.used, ...columns.lost]) expect(ship.values).toHaveProperty(c.key);
    for (const c of columns.pilots) expect(pilot.values).toHaveProperty(c.key);
  });
});
