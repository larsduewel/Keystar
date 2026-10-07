/**
 * The gate check against a real database (skipped without TEST_DATABASE_URL, which is truncated!).
 * Kills go in the way the live feed stores them; ESI and zKillboard are never called.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZkillKillmail } from "@/modules/killboard/zkill";

vi.mock("server-only", () => ({}));

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("gate check integration", async () => {
  const { closeDb, getDb, schema } = await import("@/core/db");
  const { runMigrations } = await import("@/scripts/migrate");
  const { recordFeedKillmails } = await import("@/modules/gatecheck/ingest");
  const { killsByPilots, killsInSystems, loadFeedStatus } = await import("@/modules/gatecheck/queries");
  const { runGatecheck } = await import("@/modules/gatecheck/service");
  const { parseQuery } = await import("@/modules/gatecheck/params");
  const { getUniverse } = await import("@/modules/gatecheck/universe-data");
  const { checkGates } = await import("@/modules/map/check-gates");
  const { gatecheckHousekeepingJob } = await import("@/modules/gatecheck/jobs");

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("[]", { status: 200 }));
  const db = () => getDb();
  const u = getUniverse();
  const id = (name: string) => u.byName.get(name.toLowerCase())!;
  const RANCER = id("Rancer");
  const CRIELERE = id("Crielere");
  const gate = u.gates.get(RANCER)!.find((g) => g.destinationId === CRIELERE)!;

  const km = (killmailId: number, minutesAgo: number, over: Partial<ZkillKillmail> = {}): ZkillKillmail => ({
    killmail_id: killmailId,
    killmail_time: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    solar_system_id: RANCER,
    victim: {
      ship_type_id: 670,
      damage_taken: 1,
      corporation_id: 9,
      position: { x: gate.x + 5000, y: gate.y, z: gate.z },
    },
    attackers: [
      {
        character_id: 501,
        corporation_id: 601,
        ship_type_id: 17738,
        weapon_type_id: 3955,
        damage_done: 100,
        final_blow: true,
      },
    ],
    zkb: { hash: `h${killmailId}`, totalValue: 10_000 },
    ...over,
  });

  beforeAll(async () => {
    await runMigrations(process.env.TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    fetchSpy.mockRestore();
    await closeDb();
  });

  beforeEach(async () => {
    await db().execute(sql`TRUNCATE gatecheck_kills, gatecheck_feed, eve_types, eve_groups, eve_entities RESTART IDENTITY CASCADE`);
    await db()
      .insert(schema.eveGroups)
      .values([
        { groupId: 27, name: "Battleship", categoryId: 6 },
        { groupId: 29, name: "Capsule", categoryId: 6 },
        { groupId: 72, name: "Smart Bomb", categoryId: 7 },
      ]);
    await db()
      .insert(schema.eveTypes)
      .values([
        { typeId: 17738, name: "Machariel", groupId: 27 },
        { typeId: 670, name: "Capsule", groupId: 29 },
        { typeId: 3955, name: "Medium EMP Smartbomb II", groupId: 72 },
      ]);
    await db()
      .insert(schema.eveEntities)
      .values([
        { id: 501, name: "Bomber Bob", category: "character" },
        { id: 601, name: "Bomb Corp", category: "corporation" },
        { id: 9, name: "Victim Corp", category: "corporation" },
      ]);
  });

  it("stores kills in known space once, with their gate, and tracks the feed's coverage", async () => {
    const wormhole = km(3, 5, { solar_system_id: 31_000_005 });
    const stored = await recordFeedKillmails(db(), [km(1, 30), km(2, 10), wormhole, km(1, 30)], { restarted: true, caughtUp: false });
    expect(stored).toBe(2);
    const rows = await killsInSystems([RANCER], new Date(Date.now() - 3600_000));
    expect(rows.map((r) => [r.killmailId, r.gateId, Math.round(r.gateDistanceM!)]).sort()).toEqual([
      [1, gate.id, 5000],
      [2, gate.id, 5000],
    ]);
    let feed = await loadFeedStatus();
    expect(feed.caughtUpAt).toBeNull();
    expect(feed.coverageSince!.getTime()).toBeCloseTo(Date.now() - 30 * 60_000, -4);
    expect(feed.historySince!.getTime()).toBe(feed.coverageSince!.getTime());

    // Catching up later keeps the coverage and records when.
    await recordFeedKillmails(db(), [], { restarted: false, caughtUp: true });
    feed = await loadFeedStatus();
    expect(feed.caughtUpAt).not.toBeNull();
    expect(feed.coverageSince!.getTime()).toBeCloseTo(Date.now() - 30 * 60_000, -4);

    await recordFeedKillmails(db(), [km(4, 2)], { restarted: false, caughtUp: true });
    const advanced = await loadFeedStatus();
    expect(advanced.lastKillmailAt!.getTime()).toBeGreaterThan(feed.lastKillmailAt!.getTime());

    expect((await killsByPilots([501, 999], new Date(Date.now() - 3600_000))).length).toBe(3);
    expect((await killsByPilots([999], new Date(Date.now() - 3600_000))).length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("checks the live-feed route and preserves the map’s cached killmail evidence", async () => {
    await recordFeedKillmails(db(), [km(1, 12), km(2, 11)], {
      restarted: true,
      caughtUp: true,
    });
    const result = await runGatecheck(parseQuery({ from: "Miroitem", to: "Crielere" }));
    expect(result?.route).toEqual([id("Miroitem"), RANCER, CRIELERE]);
    const rancer = result!.check.systems[1];
    expect(rancer.status).toBe("camp");
    expect(rancer.routeKills.map((k) => k.place)).toEqual(["exit", "exit"]);
    expect(rancer.routeTags).toEqual(["smartbomb", "pod"]);
    expect(result!.feed.health).toBe("fresh");
    expect(result!.names.entities.get(501)).toBe("Bomber Bob");
    expect(result!.predictions[1].factors.live).toBeGreaterThan(0.5);

    // The fork map retains full attacker/weapon evidence from its cached zKillboard path.
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([km(1, 12), km(2, 11)]), { status: 200 }));
    expect(fetchSpy).not.toHaveBeenCalled();
    const map = await checkGates(RANCER);
    expect(map.complete).toBe(true);
    expect(map.kills.map((k) => [k.id, k.destinationId])).toEqual([
      [2, CRIELERE],
      [1, CRIELERE],
    ]);
    expect(map.kills.every((k) => k.smartbombPodKill === true)).toBe(true);
    expect(map.characterNames?.[501]).toBe("Bomber Bob");
    expect(map.shipNames?.[17738]).toBe("Machariel");
    expect(map.kills[0].attackers).toEqual([{ characterId: 501, shipTypeId: 17738 }]);
    expect(await runGatecheck(parseQuery({ from: "Nowhere", to: "Rancer" }))).toBeNull();
  });

  it("keeps gate kills longer than kills elsewhere", async () => {
    const offGate = km(2, 8 * 24 * 60, {
      victim: {
        ship_type_id: 670,
        damage_taken: 1,
        position: { x: gate.x + 1e9, y: 0, z: 0 },
      },
    });
    await recordFeedKillmails(db(), [km(1, 8 * 24 * 60), offGate, km(3, 61 * 24 * 60)], { restarted: true, caughtUp: true });
    await gatecheckHousekeepingJob.run({ db: db() } as never);
    const left = await db().select({ id: schema.gatecheckKills.killmailId }).from(schema.gatecheckKills);
    expect(left.map((r) => r.id)).toEqual([1]);
  });
});
