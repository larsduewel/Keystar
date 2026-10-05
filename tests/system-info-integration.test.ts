/**
 * System Info against a real database: what the collectors read, and that the
 * support package built from it leaks nothing. Runs only with TEST_DATABASE_URL
 * (the database is truncated!).
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("system info integration", async () => {
  const { closeDb, getDb, schema } = await import("@/core/db");
  const { runMigrations } = await import("@/scripts/migrate");
  const { collectSystemSnapshot } = await import("@/core/system/collect");
  const { readJournal } = await import("@/core/system/database");
  const { runChecks } = await import("@/core/system/checks");
  const { buildSupportPackage } = await import("@/core/system/support-package");
  const { KEYSTAR_VERSION } = await import("@/core/version");

  const db = () => getDb();
  const PILOT = "Canary Pilot Zeta";
  const CORP_ID = 98000123;
  const CHARACTER_ID = 2119998877;

  beforeAll(async () => {
    await runMigrations(process.env.TEST_DATABASE_URL!);
    await db().execute(sql`TRUNCATE users, characters, esi_tokens, sync_jobs, worker_heartbeats, audit_log, app_settings
      RESTART IDENTITY CASCADE`);
    const [user] = await db().insert(schema.users).values({ role: "admin", mainCharacterId: CHARACTER_ID }).returning();
    await db().insert(schema.characters).values({
      characterId: CHARACTER_ID,
      userId: user.id,
      name: PILOT,
      corporationId: CORP_ID,
      ownerHash: "canary-owner-hash",
    });
    await db().insert(schema.esiTokens).values({
      characterId: CHARACTER_ID,
      refreshTokenEnc: "canary-refresh-token",
      scopes: ["esi-skills.read_skills.v1", "esi-wallet.read_corporation_wallets.v1"],
    });
    await db().insert(schema.syncJobs).values([
      {
        jobKey: "corp.wallet",
        ownerType: "corporation",
        ownerId: CORP_ID,
        lastStatus: "error",
        lastError: `ESI GET /corporations/${CORP_ID}/wallets/ failed: "${PILOT}" lacks the Accountant role`,
        consecutiveFailures: 5,
        lastRunAt: new Date(),
      },
      { jobKey: "skills.queue", ownerType: "character", ownerId: CHARACTER_ID, lastStatus: "ok", lastDurationMs: 120 },
    ]);
    await db()
      .insert(schema.workerHeartbeats)
      .values({ workerId: "canary-host:4242", version: KEYSTAR_VERSION, info: { running: 1, concurrency: 4 } });
  });

  afterAll(async () => {
    await closeDb();
  });

  it("reads migrations, schema, tables and jobs", async () => {
    const s = await collectSystemSnapshot({ source: "cli", network: false });
    expect(s.database.ok).toBe(true);
    if (!s.database.ok || !s.worker.ok || !s.tokens.ok) return;
    const db = s.database.data;
    expect(db.migrations).toMatchObject({ bundled: readJournal()!.length, applied: readJournal()!.length, pending: [], hashMismatch: [] });
    expect(db.drift.missingTables).toEqual([]);
    expect(db.drift.missingColumns).toEqual([]);
    expect(db.tables.find((t) => t.name === "characters")).toMatchObject({ rows: 1, rowsEstimated: false });
    // The IN list of settings must render as valid SQL: these come back only if it does.
    expect(db.settings.max_connections).toMatch(/^\d+$/);
    expect(db.settings.TimeZone).toBeTruthy();
    expect(db.serverVersion).toMatch(/^\d+/);

    expect(s.worker.data.jobs.find((j) => j.jobKey === "corp.wallet")).toMatchObject({ error: 1, maxStreak: 5, failingOwners: 1 });
    expect(s.tokens.data).toMatchObject({ users: { admin: 1 }, characters: 1, tokens: { active: 1 } });
    expect(s.tokens.data.scopes["esi-skills.read_skills.v1"]).toBe(1);

    const checks = runChecks(s);
    expect(checks.find((c) => c.id === "migrations")?.status).toBe("ok");
    expect(checks.find((c) => c.id === "worker")?.status).toBe("ok");
    expect(checks.find((c) => c.id === "jobs")?.status).toBe("fail");
  });

  it("builds a support package without names, IDs or the worker host", async () => {
    const s = await collectSystemSnapshot({ source: "cli", network: false });
    const json = JSON.stringify(buildSupportPackage(s, runChecks(s)));
    for (const marker of [PILOT, String(CORP_ID), String(CHARACTER_ID), "canary-host", "canary-refresh-token", "canary-owner-hash"]) {
      expect(json).not.toContain(marker);
    }
    expect(json).toContain("/corporations/[id]/wallets/");
  });
});
