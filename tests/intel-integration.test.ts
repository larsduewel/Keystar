/**
 * Threat intel against a real database (skipped without TEST_DATABASE_URL, which is truncated!).
 * ESI is mocked at the fetch level; zKillboard is never called here.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("intel integration", async () => {
  const { closeDb, getDb, schema } = await import("@/core/db");
  const { runMigrations } = await import("@/scripts/migrate");
  const { setSetting } = await import("@/core/settings");
  const { storeKillmails } = await import("@/modules/killboard/sync");
  const { startScan, getScanPilots, profileRemaining } = await import("@/modules/intel/scans");
  const { encountersWithUs, engagementsWithUs } = await import("@/modules/intel/history");
  const { enqueuePilots } = await import("@/modules/intel/queue");
  const { runScanWorker } = await import("@/modules/intel/worker");
  const { ZkillError } = await import("@/modules/killboard/zkill");
  const { EsiClient } = await import("@/core/esi/client");
  const { createLogger } = await import("@/core/logger");
  const activeStats = (await import("./fixtures/zkill-stats-active.json")).default;
  const { allianceContactsJob, corporationContactsJob } = await import("@/modules/intel/contacts");
  const { recentSightings } = await import("@/modules/intel/scans");
  const { loadStandings, standingOf } = await import("@/modules/intel/standings");
  const { writeBriefing, writeDossier, latestNote } = await import("@/modules/intel/ai/generate");
  const { readBriefing } = await import("@/modules/intel/ai/template");
  const { MESSAGES } = await import("@/i18n/messages");
  const { DSCAN_ERROR_HEADROOM, DSCAN_LOOKUP_LIMIT, DSCAN_MAX_LOOKUPS, USER_HOURLY_LIMIT } = await import("@/modules/intel/constants");
  const { dscanShips } = await import("@/modules/intel/dscan");
  const { getEsi } = await import("@/core/esi");
  const { resetEnvCache } = await import("@/core/env");

  const db = () => getDb();
  const HOME = 100;
  const now = new Date("2026-10-02T20:00:00Z");
  const at = (iso: string) => `${iso}Z`;
  let userId = "";

  // Pilot 9 (corp 555) killed one of ours and lost two ships to us; 10 (corp 555) flew with 9;
  // 11 is in our alliance; 12 is in a corporation we set red.
  const killmails = [
    { killmail_id: 1, killmail_time: at("2026-09-28T20:00:00"), solar_system_id: 30000180,
      victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 900 },
      attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 17843, damage_done: 900, final_blow: true }],
      zkb: { hash: "h1", totalValue: 100e6 } },
    { killmail_id: 2, killmail_time: at("2026-09-28T20:10:00"), solar_system_id: 30000180,
      victim: { character_id: 1, corporation_id: HOME, ship_type_id: 17843, damage_taken: 5000 },
      attackers: [
        { character_id: 9, corporation_id: 555, ship_type_id: 22456, damage_done: 3000, final_blow: true },
        { character_id: 10, corporation_id: 555, ship_type_id: 29990, damage_done: 1500, final_blow: false },
        { character_id: 77, corporation_id: 556, alliance_id: 600, ship_type_id: 11987, damage_done: 500, final_blow: false },
      ],
      zkb: { hash: "h2", totalValue: 250e6 } },
    { killmail_id: 3, killmail_time: at("2026-08-01T12:00:00"), solar_system_id: 30000181,
      victim: { character_id: 9, corporation_id: 555, ship_type_id: 587, damage_taken: 300 },
      attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 11186, damage_done: 300, final_blow: true }],
      zkb: { hash: "h3", totalValue: 10e6 } },
    // Someone else's fight: not history with us.
    { killmail_id: 4, killmail_time: at("2026-09-29T12:00:00"), solar_system_id: 30000180,
      victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 100 },
      attackers: [{ character_id: 8, corporation_id: 888, ship_type_id: 622, damage_done: 100, final_blow: true }],
      zkb: { hash: "h4", totalValue: 1e9 } },
  ];

  // One fetch mock for the whole file: the shared ESI client keeps the fetch it was created with,
  // so per-test spies would let later tests reach the real ESI.
  let handler: (path: string, body: unknown) => unknown = () => undefined;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const result = handler(url.pathname, body);
    if (result instanceof Response) return result;
    if (result === undefined) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  });
  const esi = (next: (path: string, body: unknown) => unknown) => {
    handler = next;
    fetchSpy.mockClear();
    return { mock: fetchSpy.mock, mockRestore: () => void (handler = () => undefined) };
  };

  const characters: Record<string, { id: number; corporation_id: number; alliance_id?: number }> = {
    "pilot nine": { id: 9, corporation_id: 555 },
    "pilot ten": { id: 10, corporation_id: 555 },
    "ally eleven": { id: 11, corporation_id: 101, alliance_id: 200 },
    "red twelve": { id: 12, corporation_id: 300 },
  };
  const fakeEsi = (path: string, body: unknown) => {
    if (path === "/universe/ids") {
      const names = body as string[];
      const found = names.flatMap((n) => {
        const c = characters[n.toLowerCase()];
        return c ? [{ id: c.id, name: n }] : [];
      });
      return { characters: found };
    }
    if (path === "/characters/affiliation") {
      return (body as number[]).map((id) => {
        const c = Object.values(characters).find((x) => x.id === id)!;
        return { character_id: id, corporation_id: c.corporation_id, alliance_id: c.alliance_id };
      });
    }
    if (path.startsWith("/corporations/")) return { name: `Corp ${path.split("/")[2]}`, ticker: "TCK", member_count: 10 };
    if (path === "/universe/names") return [];
    return undefined;
  };

  beforeAll(async () => {
    await runMigrations(process.env.TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    fetchSpy.mockRestore();
    await closeDb();
  });

  beforeEach(async () => {
    await db().execute(sql`TRUNCATE users, characters, app_settings, eve_entities, eve_corporations, eve_systems, eve_types,
      eve_groups, eve_constellations, killmails, killmail_attackers, sync_jobs, esi_cache, intel_scans, intel_scan_pilots,
      intel_pilots, intel_pilot_killmails, intel_queue, intel_contacts, intel_ai_notes, intel_dscan_lookups RESTART IDENTITY CASCADE`);
    const [u] = await db().insert(schema.users).values({ role: "member" }).returning();
    userId = u.id;
    await setSetting("corp.homeCorporationId", HOME);
    await db().insert(schema.eveCorporations).values({ corporationId: HOME, name: "Home", ticker: "HOME", allianceId: 200 });
    await db().insert(schema.intelContacts).values({ ownerType: "corporation", ownerId: HOME, contactId: 300, contactType: "corporation", standing: -10 });
    expect(await storeKillmails(db(), killmails as never)).toBe(4);
  });

  it("finds fights with us and what they brought", async () => {
    const encounters = await encountersWithUs(HOME, [9, 10, 11]);
    expect(encounters.map((e) => [e.characterId, e.killmailId, e.kind]).sort()).toEqual([
      [10, 2, "onUs"],
      [9, 1, "byUs"],
      [9, 2, "onUs"],
      [9, 3, "byUs"],
    ]);
    const fights = await engagementsWithUs(HOME, encounters, [9, 10]);
    expect(fights).toHaveLength(2);
    // Newest first: the fight on 28 September with both kills, then the August one.
    expect(fights[0]).toMatchObject({ systemId: 30000180, ourKills: 1, ourLosses: 1, iskKilled: 100e6, iskLost: 250e6 });
    expect(fights[0].pilots.map((p) => [p.characterId, p.role])).toEqual([
      [9, "both"],
      [10, "attacker"],
    ]);
    expect(fights[0].others).toEqual([{ corporationId: 556, allianceId: 600, pilots: 1 }]);
    expect(fights[1]).toMatchObject({ systemId: 30000181, ourKills: 1, ourLosses: 0 });
  });

  it("creates a scan: resolves names, keeps history, profiles only non-friendlies", async () => {
    const spy = esi(fakeEsi);
    try {
      const result = await startScan(
        {
          text: "Pilot Nine\nPilot Ten\nAlly Eleven\nRed Twelve\nNobody Known",
          userId,
          userName: "Tester",
          aiAllowed: true,
        },
        { now },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.naming.typeIds).toEqual(expect.arrayContaining([22456, 29990, 11987]));

      const [scan] = await db().select().from(schema.intelScans);
      expect(scan).toMatchObject({ id: result.id, pilotCount: 4, unresolved: ["Nobody Known"], status: "running", aiAllowed: true });

      const pilots = await getScanPilots(result.id);
      const byId = new Map(pilots.map((p) => [p.characterId, p]));
      expect(byId.get(9)!.history).toMatchObject({ killsOnUs: 1, lossesToUs: 2 });
      expect(byId.get(11)!.profiled).toBe(false); // alliance mate
      expect(byId.get(12)!.profiled).toBe(true);

      // Red and recent killers first; the alliance mate is not queued.
      const queue = await db().select().from(schema.intelQueue);
      const priority = new Map(queue.map((q) => [q.characterId, q.priority]));
      expect([...priority.keys()].sort((a, b) => a - b)).toEqual([9, 10, 12]);
      expect(priority.get(12)!).toBeGreaterThan(priority.get(10)!);
      expect(priority.get(9)).toBe(priority.get(10)); // both were on a recent loss of ours

      // Affiliations are cached for the next scan.
      const cached = await db().select().from(schema.intelPilots);
      expect(cached.find((p) => p.characterId === 11)).toMatchObject({ corporationId: 101, allianceId: 200 });

      // Profiling the rest on request queues the alliance mate too; a friendly does not change the briefing.
      const briefingBefore = (await db().select().from(schema.intelScans))[0].briefingStatus;
      expect(await profileRemaining(result.id)).toBe(1);
      expect((await db().select().from(schema.intelQueue)).length).toBe(4);
      expect((await db().select().from(schema.intelScans))[0].briefingStatus).toBe(briefingBefore);
      // A hostile left out (very large lists) is briefed once read.
      await db().update(schema.intelScans).set({ briefingStatus: "done" });
      await db().update(schema.intelScanPilots).set({ profiled: false }).where(sql`character_id = 12`);
      expect(await profileRemaining(result.id)).toBe(1);
      expect((await db().select().from(schema.intelScans))[0]).toMatchObject({ status: "running", briefingStatus: "pending" });
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses empty pastes and unknown systems", async () => {
    const spy = esi(fakeEsi);
    try {
      expect(await startScan({ text: "12345\tWreck\tRifter Wreck\t1 km", userId, userName: null, aiAllowed: false })).toMatchObject({
        ok: false,
        error: { code: "dscanInPilots" },
      });
      expect(await startScan({ text: "Pilot Nine", systemName: "Nowhere", userId, userName: null, aiAllowed: false })).toMatchObject({
        ok: false,
        error: { code: "unknownSystem", name: "Nowhere" },
      });
      expect(await startScan({ text: "Nobody Known", userId, userName: null, aiAllowed: false })).toMatchObject({ ok: false });
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps queued work when a pilot is requested again, raising its priority", async () => {
    await enqueuePilots([{ characterId: 9, priority: 5 }]);
    await db().update(schema.intelQueue).set({ stage: 2 });
    await enqueuePilots([{ characterId: 9, priority: 40 }, { characterId: 9, priority: 1 }]);
    const [row] = await db().select().from(schema.intelQueue);
    expect(row).toMatchObject({ characterId: 9, stage: 2, priority: 40 });
  });

  describe("d-scan type lookups", () => {
    const SABRE = 22456;
    const typeLookups = (calls: unknown[][]) =>
      calls.filter(([input]) => String(input).includes("/universe/types/")).map(([input]) => Number(String(input).split("/").at(-1)));
    // The Sabre's line first and most often, then made-up ids from `from` on.
    const paste = (from: number, junk: number) =>
      [`${SABRE}\ta\tSabre\t1 km`, `${SABRE}\tb\tSabre\t2 km`, ...Array.from({ length: junk }, (_, i) => `${from + i}\tx\ty\t-`)].join("\n");
    const fakeTypes = (extra?: (path: string) => Response | undefined) => (path: string) => {
      const hit = extra?.(path);
      if (hit) return hit;
      if (path === `/universe/types/${SABRE}`) return { type_id: SABRE, name: "Sabre", group_id: 541, published: true };
      if (path === "/universe/groups/541") return { group_id: 541, name: "Interdictor", category_id: 6, types: [SABRE] };
      return undefined;
    };

    it("looks up a capped number of unknown types and never asks again for ids ESI doesn't know", async () => {
      const spy = esi(fakeTypes());
      try {
        const first = await dscanShips(paste(9_000_000, 300), { userId, db: db() });
        expect(first.ships.map((s) => s.name)).toEqual(["Sabre"]);
        expect(first.lines).toBe(302);
        const asked = typeLookups(spy.mock.calls);
        expect(asked).toHaveLength(DSCAN_MAX_LOOKUPS);
        expect(asked).toContain(SABRE);

        // The same paste again: the ids ESI answered 404 for are remembered, the rest get their turn.
        spy.mock.calls.length = 0;
        await dscanShips(paste(9_000_000, 300), { userId, db: db() });
        const again = typeLookups(spy.mock.calls);
        expect(again).toHaveLength(DSCAN_MAX_LOOKUPS);
        expect(again.some((id) => asked.includes(id))).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it("stops looking up types when the shared ESI error budget runs low", async () => {
      const remain = (n: number) =>
        new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "x-esi-error-limit-remain": String(n), "x-esi-error-limit-reset": "30" } });
      const spy = esi(fakeTypes((path) => (path.startsWith("/universe/types/91") ? remain(DSCAN_ERROR_HEADROOM - 1) : undefined)));
      try {
        await dscanShips(paste(9_100_000, 40), { userId, db: db() });
        // Lookups already in flight finish; none start after the low budget was seen.
        expect(typeLookups(spy.mock.calls).length).toBeLessThanOrEqual(6);
      } finally {
        // Leave the shared client with a healthy budget for later tests.
        esi(() => remain(100));
        await getEsi().get("/status").catch(() => undefined);
        spy.mockRestore();
      }
    });

    it("limits pastes with lookups per user, but known ships still show", async () => {
      await db().insert(schema.eveGroups).values({ groupId: 541, name: "Interdictor", categoryId: 6 });
      await db().insert(schema.eveTypes).values({ typeId: SABRE, name: "Sabre", groupId: 541, published: true });
      const spy = esi(fakeTypes());
      try {
        for (let i = 0; i < DSCAN_LOOKUP_LIMIT; i++) await dscanShips(paste(9_300_000 + i * 10, 1), { userId, now, db: db() });
        expect(typeLookups(spy.mock.calls)).toHaveLength(DSCAN_LOOKUP_LIMIT);
        spy.mock.calls.length = 0;
        const limited = await dscanShips(paste(9_400_000, 5), { userId, now, db: db() });
        expect(typeLookups(spy.mock.calls)).toHaveLength(0);
        expect(limited.ships.map((s) => s.name)).toEqual(["Sabre"]);
        // A paste of known types only costs nothing.
        const [lookups] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.intelDscanLookups);
        await dscanShips(paste(0, 0), { userId, now, db: db() });
        const [after] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.intelDscanLookups);
        expect(after.n).toBe(lookups.n);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("worker", () => {
    const esiClient = new EsiClient({ baseUrl: "https://esi.invalid", userAgent: "t", compatibilityDate: "2026-08-18" });
    const log = createLogger("test");
    // The queue stamps rows with the database clock, so the worker tests run on real time.
    const wnow = new Date();
    const workerNow = () => new Date();
    // Pilot 9's newest killmails: kills last week in an Interceptor, one loss with a cyno fitted.
    const pageFor = (characterId: number) =>
      characterId !== 9
        ? []
        : [0.5, 1, 2, 3, 4, 5].map((days, i) => ({
            killmail_id: 7000 + i,
            killmail_time: new Date(wnow.getTime() - days * 86_400_000).toISOString(),
            solar_system_id: 30000180,
            victim:
              i === 5
                ? { character_id: 9, corporation_id: 555, ship_type_id: 11184, damage_taken: 1, items: [{ item_type_id: 28646, flag: 27, quantity_destroyed: 1 }] }
                : { character_id: 500 + i, corporation_id: 700, ship_type_id: 587, damage_taken: 1 },
            attackers:
              i === 5
                ? [{ character_id: 600, corporation_id: 701, ship_type_id: 587, damage_done: 1, final_blow: true }]
                : [
                    { character_id: 9, corporation_id: 555, ship_type_id: 11184, damage_done: 1, final_blow: i % 2 === 0 },
                    { character_id: 10, corporation_id: 555, ship_type_id: 22456, damage_done: 1, final_blow: false },
                  ],
            zkb: { hash: `x${i}`, totalValue: 200e6, solo: false, npc: false, awox: false, labels: [] },
          }));
    const source = {
      stats: vi.fn(async (id: number) => (id === 9 ? ({ kind: "ok", stats: activeStats } as const) : ({ kind: "none" } as const))),
      page: vi.fn(async (id: number) => pageFor(id)),
    };

    async function scan() {
      const spy = esi(fakeEsi);
      try {
        const res = await startScan({ text: "Pilot Nine\nPilot Ten\nRed Twelve", userId, userName: null, aiAllowed: false }, { now: wnow });
        if (!res.ok) throw new Error(res.error.code);
        return res.id;
      } finally {
        spy.mockRestore();
      }
    }

    beforeEach(() => {
      source.stats.mockClear();
      source.page.mockClear();
    });

    it("reads statistics, then newest killmails, scores pilots and marks the scan ready", async () => {
      await db().insert(schema.eveTypes).values([
        { typeId: 11184, name: "Crusader", groupId: 831 },
        { typeId: 28646, name: "Covert Cynosural Field Generator I", groupId: 658 },
      ]);
      const id = await scan();
      const out = await runScanWorker({ db: db(), esi: esiClient, log }, { source, offline: true, now: workerNow, budgetMs: 30_000 });
      expect(out.remaining).toBe(0);
      expect(out.readyScans).toEqual([id]);
      expect(await db().select().from(schema.intelQueue)).toEqual([]);
      // Statistics for everyone before any killmail page.
      const order = [...source.stats.mock.invocationCallOrder, ...source.page.mock.invocationCallOrder].sort((a, b) => a - b);
      expect(Math.max(...source.stats.mock.invocationCallOrder)).toBeLessThan(Math.min(...source.page.mock.invocationCallOrder));
      expect(order.length).toBe(source.stats.mock.calls.length + source.page.mock.calls.length);

      const pilots = new Map((await getScanPilots(id)).map((p) => [p.characterId, p]));
      const nine = pilots.get(9)!;
      expect(nine.deepStatus).toBe("complete");
      expect(nine.score).toBeGreaterThan(0);
      expect(nine.scoreDetail?.quick).toBe(false);
      expect(nine.scoreDetail?.tags.map((t) => t.key)).toContain("cyno");
      expect(nine.profile?.recent.latest[0].killmailId).toBe(7000);
      // Pilot 10 shares kills with 9 in the digest; zKillboard has no statistics for 10.
      expect(nine.profile?.associates.find((a) => a.characterId === 10)?.source).toBe("digest");
      expect(pilots.get(10)).toMatchObject({ statsStatus: "none", score: null, tier: "unknown" });

      const [row] = await db().select().from(schema.intelScans);
      expect(row.status).toBe("ready");

      // A new scan within the hour reuses everything: no zKillboard calls.
      source.stats.mockClear();
      source.page.mockClear();
      const again = await scan();
      await runScanWorker({ db: db(), esi: esiClient, log }, { source, offline: true, now: workerNow, budgetMs: 30_000 });
      expect(source.stats).not.toHaveBeenCalled();
      expect(source.page).not.toHaveBeenCalled();
      expect((await getScanPilots(again)).find((p) => p.characterId === 9)?.score).toBe(nine.score);
    });

    it("stops on a blocked user agent and retries other failures later", async () => {
      await scan();
      const blocked = { ...source, stats: vi.fn(async () => Promise.reject(new ZkillError("zKillboard responded 403", 403))) };
      await expect(runScanWorker({ db: db(), esi: esiClient, log }, { source: blocked, offline: true, now: workerNow })).rejects.toThrow("403");

      const flaky = { ...source, stats: vi.fn(async () => Promise.reject(new ZkillError("zKillboard responded 502", 502))) };
      const out = await runScanWorker({ db: db(), esi: esiClient, log }, { source: flaky, offline: true, now: workerNow });
      expect(out.remaining).toBe(0);
      const queue = await db().select().from(schema.intelQueue);
      expect(queue.every((q) => q.attempts === 1 && q.notBefore.getTime() > Date.now() && q.lastError?.includes("502"))).toBe(true);
    });
  });

  describe("contacts and the hostiles feed", () => {
    const contactsEsi = (lists: Record<string, unknown[]>) =>
      new EsiClient({
        baseUrl: "https://esi.invalid",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async (input: string | URL | Request) => {
          const path = new URL(String(input instanceof Request ? input.url : input)).pathname;
          if (path === "/universe/names") return new Response("[]", { status: 200 });
          if (path.startsWith("/corporations/") && !path.endsWith("/contacts")) {
            return new Response(JSON.stringify({ name: "Home", ticker: "HOME", alliance_id: 200 }), { status: 200 });
          }
          return new Response(JSON.stringify(lists[path] ?? []), { status: 200, headers: { "x-pages": "1" } });
        }) as typeof fetch,
      });
    const jobCtx = (esiClient: InstanceType<typeof EsiClient>) => ({
      jobId: 1,
      ownerType: "corporation" as const,
      ownerId: HOME,
      characterId: 1,
      esi: esiClient,
      db: db(),
      log: createLogger("test"),
      meta: {},
    });

    it("replaces the corporation's and alliance's contact lists", async () => {
      handler = fakeEsi; // resolver lookups go through the shared client
      const lists = {
        [`/corporations/${HOME}/contacts`]: [
          { contact_id: 300, contact_type: "corporation", standing: -10 },
          { contact_id: 12, contact_type: "character", standing: 5 },
        ],
        "/alliances/200/contacts": [{ contact_id: 400, contact_type: "alliance", standing: -5 }],
      };
      await db().insert(schema.intelContacts).values({ ownerType: "alliance", ownerId: 999, contactId: 1, contactType: "alliance", standing: 10 });
      await corporationContactsJob.run(jobCtx(contactsEsi(lists)));
      await allianceContactsJob.run(jobCtx(contactsEsi(lists)));
      const rows = await db().select().from(schema.intelContacts);
      expect(rows.map((r) => [r.ownerType, r.ownerId, r.contactId, r.standing]).sort()).toEqual([
        ["alliance", 200, 400, -5],
        ["corporation", HOME, 12, 5],
        ["corporation", HOME, 300, -10],
      ]);
      const standings = await loadStandings();
      expect(standingOf({ characterId: 12, corporationId: 300, allianceId: null, factionId: null }, standings).cls).toBe("blue");
      expect(standingOf({ characterId: 5, corporationId: 301, allianceId: 400, factionId: null }, standings).cls).toBe("red");

      // A second sync with fewer contacts drops the removed ones.
      await corporationContactsJob.run(jobCtx(contactsEsi({ [`/corporations/${HOME}/contacts`]: [] })));
      expect((await db().select().from(schema.intelContacts)).filter((r) => r.ownerType === "corporation")).toEqual([]);
    });

    it("lists each pilot's latest sighting with how often they were seen", async () => {
      const spy = esi(fakeEsi);
      try {
        const first = await startScan({ text: "Pilot Nine\nRed Twelve", userId, userName: "Scout", aiAllowed: false }, { now: new Date(Date.now() - 3600_000) });
        const second = await startScan({ text: "Pilot Nine", userId, userName: "Scout", aiAllowed: false });
        if (!first.ok || !second.ok) throw new Error("scan failed");
        const feed = await recentSightings(7);
        expect(feed.map((s) => [s.characterId, s.scanId, s.times])).toEqual([
          [9, second.id, 2],
          [12, first.id, 1],
        ]);
        expect(feed[0]).toMatchObject({ seenBy: "Scout", fought: true });
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("briefings and dossiers", () => {
    const briefingOut = {
      content: { headline: "H", threatLevel: "high" as const, recent: "R", paragraphs: ["P"], keyPilots: [], advice: "A" },
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 10, outputTokens: 5 },
    };
    async function readyScan(aiAllowed: boolean) {
      const spy = esi(fakeEsi);
      try {
        const res = await startScan({ text: "Pilot Nine\nPilot Ten\nRed Twelve", userId, userName: null, aiAllowed });
        if (!res.ok) throw new Error(res.error.code);
        await db().update(schema.intelScans).set({ status: "ready" });
        return res.id;
      } finally {
        spy.mockRestore();
      }
    }
    const withKey = async (fn: () => Promise<void>) => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      resetEnvCache();
      try {
        await fn();
      } finally {
        delete process.env.ANTHROPIC_API_KEY;
        resetEnvCache();
      }
    };

    it("uses the template without a key, Claude with one, and the template again when Claude fails", async () => {
      const id = await readyScan(true);
      const briefing = vi.fn(async () => briefingOut);
      expect(await writeBriefing(id, { createdBy: null, automatic: true }, { briefing })).toMatchObject({ source: "template", error: null });
      expect(briefing).not.toHaveBeenCalled();
      const [scan] = await db().select().from(schema.intelScans);
      expect(scan.briefingStatus).toBe("done");

      await withKey(async () => {
        expect(await writeBriefing(id, { createdBy: null, automatic: true }, { briefing })).toMatchObject({ source: "claude", model: "claude-sonnet-5-5" });
        // Unchanged facts: the recent note is reused instead of calling Claude again.
        await writeBriefing(id, { createdBy: userId, automatic: false }, { briefing });
        expect(briefing).toHaveBeenCalledTimes(1);

        const failing = vi.fn(async () => Promise.reject(new Error("overloaded")));
        await db().delete(schema.intelAiNotes);
        expect(await writeBriefing(id, { createdBy: userId, automatic: false }, { briefing: failing })).toMatchObject({
          source: "template",
          error: "overloaded",
        });
      });
      expect((await latestNote({ kind: "briefing", scanId: id }))?.source).toBe("template");
    });

    it("writes Claude's notes in the asker's language and template notes in the reader's", async () => {
      const id = await readyScan(true);
      await db().update(schema.intelScans).set({ locale: "de" });
      const template = await writeBriefing(id, { createdBy: null, automatic: true });
      expect(template).toMatchObject({ source: "template", locale: null });
      const de = readBriefing(template!, MESSAGES.de).content;
      const en = readBriefing(template!, MESSAGES.en).content;
      expect(de.threatLevel).toBe(en.threatLevel);
      expect(de.advice).toBe(MESSAGES.de.intel.template.advice[de.threatLevel]);
      expect(en.advice).toBe(MESSAGES.en.intel.template.advice[en.threatLevel]);

      const briefing = vi.fn(async (_facts: unknown, opts: { locale: string }) => ({ ...briefingOut, content: { ...briefingOut.content, headline: opts.locale } }));
      await withKey(async () => {
        // The automatic briefing is written in the scan creator's language.
        expect(await writeBriefing(id, { createdBy: null, automatic: true }, { briefing })).toMatchObject({ source: "claude", locale: "de", content: { headline: "de" } });
        // Same facts in another language: written again; in the same language: reused.
        expect(await writeBriefing(id, { createdBy: userId, automatic: false, locale: "en" }, { briefing })).toMatchObject({ locale: "en", content: { headline: "en" } });
        expect(await writeBriefing(id, { createdBy: userId, automatic: false, locale: "de" }, { briefing })).toMatchObject({ locale: "de" });
        expect(briefing).toHaveBeenCalledTimes(2);
      });
    });

    it("respects the creator's permission and the hourly budget", async () => {
      const id = await readyScan(false);
      const briefing = vi.fn(async () => briefingOut);
      await withKey(async () => {
        // Automatic briefing for a creator without intel.ai: template.
        expect((await writeBriefing(id, { createdBy: null, automatic: true }, { briefing }))?.source).toBe("template");
        expect(briefing).not.toHaveBeenCalled();
        // Budget used up: template with the reason.
        await db().insert(schema.intelAiNotes).values(
          Array.from({ length: USER_HOURLY_LIMIT }, () => ({ kind: "dossier" as const, factsHash: "x", source: "claude", claudeCalled: true, content: {}, facts: {}, createdBy: userId })),
        );
        const out = await writeBriefing(id, { createdBy: userId, automatic: false }, { briefing });
        expect(out).toMatchObject({ source: "template" });
        expect(out?.error).toBe("budget:user");
        expect(briefing).not.toHaveBeenCalled();
      });
    });

    it("counts failed and concurrent Claude calls against the hourly budget", async () => {
      const id = await readyScan(true);
      const dossierOut = {
        content: { summary: "S", recentActivity: "R", playstyle: "P", watchFor: [], historyWithUs: null, confidence: "low" as const },
        model: "m",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
      await withKey(async () => {
        await db().insert(schema.intelAiNotes).values(
          Array.from({ length: USER_HOURLY_LIMIT - 2 }, () => ({ kind: "dossier" as const, factsHash: "x", source: "claude", claudeCalled: true, content: {}, facts: {}, createdBy: userId })),
        );
        // A failed call uses a slot too.
        const failing = vi.fn(async () => Promise.reject(new Error("overloaded")));
        expect(await writeDossier(id, 9, { createdBy: userId, locale: "en" }, { dossier: failing })).toMatchObject({ source: "template", error: "overloaded" });
        // One slot left: of three concurrent requests only one reaches Claude.
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const slow = vi.fn(async () => {
          await gate;
          return dossierOut;
        });
        const runs = [9, 10, 12].map((cid) => writeDossier(id, cid, { createdBy: userId, locale: "en" }, { dossier: slow }));
        await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1));
        release();
        const out = await Promise.all(runs);
        expect(slow).toHaveBeenCalledTimes(1);
        expect(out.map((o) => o?.source).sort()).toEqual(["claude", "template", "template"]);
        expect(out.filter((o) => o?.error === "budget:user")).toHaveLength(2);
      });
    });

    it("shows neither notes still being written nor d-scan reads of an earlier d-scan", async () => {
      const id = await readyScan(true);
      const earlier = new Date(Date.now() - 60_000);
      await db().insert(schema.intelAiNotes).values([
        { kind: "dscan" as const, scanId: id, factsHash: "x", source: "template", content: {}, facts: {}, createdAt: earlier },
        { kind: "dscan" as const, scanId: id, factsHash: "y", source: "pending", claudeCalled: true, content: {}, facts: {} },
      ]);
      expect(await latestNote({ kind: "dscan", scanId: id })).toMatchObject({ source: "template" });
      expect(await latestNote({ kind: "dscan", scanId: id, since: new Date() })).toBeNull();
    });

    it("writes dossiers for pilots of a scan", async () => {
      const id = await readyScan(true);
      const dossier = vi.fn(async () => ({
        content: { summary: "S", recentActivity: "R", playstyle: "P", watchFor: [], historyWithUs: null, confidence: "low" as const },
        model: "m",
        usage: { inputTokens: 1, outputTokens: 1 },
      }));
      await withKey(async () => {
        expect(await writeDossier(id, 9, { createdBy: userId, locale: "en" }, { dossier })).toMatchObject({ source: "claude", locale: "en" });
        expect(await writeDossier(id, 424242, { createdBy: userId, locale: "en" }, { dossier })).toBeNull();
      });
      expect((await latestNote({ kind: "dossier", scanId: id, characterId: 9 }))?.content).toMatchObject({ summary: "S" });
    });
  });
});
