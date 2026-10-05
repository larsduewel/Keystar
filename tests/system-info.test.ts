import { describe, expect, it, vi } from "vitest";
import { EsiClient } from "@/core/esi/client";
import { resetEnvCache } from "@/core/env";
import { runChecks, worstStatus, type CheckResult } from "@/core/system/checks";
import type { SystemSnapshot } from "@/core/system/collect";
import { appUrlMatches, collectConfig, originFromHeaders } from "@/core/system/config";
import { compareMigrations, compareSchema, readJournal } from "@/core/system/database";
import { createRedactor, errorSignature } from "@/core/system/redact";
import { cpuPercent, parseCpuLimit, parseMemoryLimit, parseMemoryUsage, processRuntime } from "@/core/system/runtime";
import { bugReportUrl, issueSummary } from "@/core/system/summary";
import { buildSupportPackage, supportPackageFilename } from "@/core/system/support-package";
import { collectNetwork, networkError } from "@/core/system/network";
import { MESSAGES } from "@/i18n/messages";
import { ZkillClient } from "@/modules/killboard/zkill";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

/** A healthy instance; tests override what they need. */
function snapshot(overrides: Partial<SystemSnapshot> = {}): SystemSnapshot {
  return {
    collectedAt: new Date(NOW).toISOString(),
    source: "web",
    build: { version: "0.11.0", commit: "a1b2c3d4e5f6", imageTag: "0.11.0", buildDate: null, dependencies: {} },
    runtime: { ...processRuntime(), install: "docker" },
    config: [
      { name: "NODE_ENV", kind: "value", state: "set", value: "production" },
      { name: "APP_URL", kind: "url", state: "set", https: true },
      { name: "EVE_CLIENT_ID", kind: "private", state: "set" },
      { name: "EVE_CLIENT_SECRET", kind: "secret", state: "set" },
    ],
    appUrlMatchesOrigin: true,
    demoMode: false,
    settings: {
      ok: true,
      data: {
        homeCorporationSet: true,
        autoApproveCorpMembers: true,
        autoApproveAllianceMembers: false,
        permissionOverrides: {},
        valuationSource: "jita_buy",
        valuationMode: "current",
        syncPaused: false,
        setupCompleted: true,
        eveServer: null,
      },
    },
    modules: [],
    tokens: { ok: true, data: { users: { admin: 1 }, characters: 1, tokens: { active: 1 }, notRefreshedForADay: 0, scopes: {} } },
    database: {
      ok: true,
      data: {
        serverVersion: "17.2 (Debian 17.2-1)",
        latencyMs: 3,
        sizeBytes: 1024 * 1024,
        settings: {},
        extensions: {},
        migrations: { bundled: 12, applied: 12, pending: [], unknown: 0, hashMismatch: [], latest: null },
        drift: { missingTables: [], missingColumns: [], extraTables: [], extraColumns: [] },
        tables: [],
        connections: {},
        longRunning: [],
        locksWaiting: 0,
        migrationLockHeld: false,
      },
    },
    worker: {
      ok: true,
      data: {
        heartbeats: [{ workerId: "keystar-worker-1:42", version: "0.11.0", startedAt: ago(3600), lastBeatAt: ago(14), info: {} }],
        jobs: [],
        errors: [],
      },
    },
    network: [
      { target: "esi", reachable: true, status: 200, ms: 80, error: null },
      { target: "sso", reachable: true, status: 200, ms: 60, error: null },
      { target: "zkill", reachable: true, status: 200, ms: 140, error: null },
    ],
    clock: { ok: true, data: { dbOffsetMs: 12 } },
    esi: null,
    zkill: null,
    audit: { ok: true, data: {} },
    auditFailures: { count: 0, lastAt: null, lastAction: null },
    ...overrides,
  };
}

const status = (checks: CheckResult[], id: CheckResult["id"]) => checks.find((c) => c.id === id)?.status;

describe("redactor", () => {
  it("removes tokens, URLs, emails, hosts, EVE IDs and names, and counts them", () => {
    const r = createRedactor("salt");
    const out = r.scrub(
      'ESI GET /characters/2112345678/wallet/ failed for "Some Pilot": Bearer abc.def-123 eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl ' +
        "see https://esi.evetech.net/x?token=1 or mail ops@example.com; getaddrinfo ENOTFOUND db.corp.example 10.0.0.12",
    );
    expect(out).not.toMatch(/2112345678|Some Pilot|abc\.def|eyJ|esi\.evetech|example|10\.0\.0\.12/);
    expect(out).toContain("/characters/[id]/wallet/");
    expect(r.counts()).toEqual({ token: 2, url: 1, email: 1, host: 2, eveId: 1, name: 1 });
  });

  it("keeps identifiers needed to debug: tables, columns, scopes, status codes", () => {
    const r = createRedactor();
    const text = 'relation "sync_jobs" does not exist; missing esi-wallet.read_corporation_wallets.v1 (HTTP 403, 3 retries)';
    expect(r.scrub(text)).toBe(text);
    expect(Object.values(r.counts()).every((n) => n === 0)).toBe(true);
  });

  it("removes bare Docker host names and IPv6 addresses from network errors", () => {
    const r = createRedactor();
    expect(r.scrub("getaddrinfo ENOTFOUND db")).toBe("getaddrinfo ENOTFOUND [host]");
    expect(r.scrub("getaddrinfo EAI_AGAIN keystar-db")).toBe("getaddrinfo EAI_AGAIN [host]");
    expect(r.scrub("connect ECONNREFUSED 172.18.0.2:5432")).toBe("connect ECONNREFUSED [host]:5432");
    expect(r.scrub("connect ECONNREFUSED ::1:5432")).toBe("connect ECONNREFUSED [host]");
    expect(r.scrub("connect ETIMEDOUT 2001:0db8:0:0:0:0:0:1")).toBe("connect ETIMEDOUT [host]");
    expect(r.scrub("connect ECONNREFUSED fd00::12:5432")).toBe("connect ECONNREFUSED [host]");
    expect(r.scrub('no pg_hba.conf entry for host "db"')).toBe('no pg_hba.conf entry for host "[host]"');
    expect(r.counts().host).toBe(7);
    // Times and C++-style names are not addresses.
    const text = "timed out at 2026-10-04T11:00:00.000Z after 12:30 in std::vector";
    expect(r.scrub(text)).toBe(text);
  });

  it("hashes consistently within a package, differently across packages", () => {
    const a = createRedactor("one");
    expect(a.hash("host:1")).toBe(a.hash("host:1"));
    expect(a.hash("host:1")).not.toBe(createRedactor("two").hash("host:1"));
    expect(a.hash("host:1")).not.toContain("host");
  });

  it("groups errors that differ only in durations and timestamps", () => {
    expect(errorSignature("timed out after 3012 ms at 2026-10-04T11:00:00.000Z")).toBe(
      errorSignature("timed out after 30000 ms at 2026-10-05T01:00:00Z"),
    );
  });
});

describe("runtime", () => {
  it("reads cgroup limits and treats 'max' and huge v1 values as unlimited", () => {
    const total = 16 * 1024 ** 3;
    expect(parseMemoryLimit("2147483648", total)).toBe(2048);
    expect(parseMemoryLimit("max", total)).toBeNull();
    expect(parseMemoryLimit("9223372036854771712", total)).toBeNull();
    expect(parseMemoryLimit(null, total)).toBeNull();
    expect(parseCpuLimit("150000 100000", null, null)).toBe(1.5);
    expect(parseCpuLimit("max 100000", null, null)).toBeNull();
    expect(parseCpuLimit(null, "50000", "100000")).toBe(0.5);
    expect(parseCpuLimit(null, "-1", "100000")).toBeNull();
  });

  it("turns CPU time into a share of the available cores", () => {
    // 1.5 s of CPU over 10 s on 2 cores: 7.5 %.
    expect(cpuPercent(1_500_000, 10_000, 2)).toBe(7.5);
    expect(cpuPercent(10_000_000, 10_000, 1)).toBe(100);
    expect(cpuPercent(123, 0, 2)).toBe(0);
    expect(parseMemoryUsage("268435456")).toBe(256);
    expect(parseMemoryUsage("garbage")).toBeNull();
    expect(parseMemoryUsage(null)).toBeNull();
  });

  it("reports load figures of this process", () => {
    const rt = processRuntime();
    expect(rt.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(rt.freeMemoryMb).toBeGreaterThan(0);
    if (rt.loadAverage) expect(rt.loadAverage).toHaveLength(3);
  });
});

describe("configuration", () => {
  it("never reveals secret or private values", () => {
    const marker = "MARKER-SECRET-VALUE-0123456789-0123456789";
    vi.stubEnv("ANTHROPIC_API_KEY", marker);
    vi.stubEnv("ESI_CONTACT", "pilot@example.com");
    vi.stubEnv("ADMIN_CHARACTER_IDS", "2112345678,2112345679");
    vi.stubEnv("SOURCE_URL", "https://github.com/some-fork/keystar");
    resetEnvCache();
    try {
      const config = collectConfig();
      const json = JSON.stringify(config);
      for (const value of [marker, "pilot@example.com", "2112345678", "some-fork", process.env.APP_SECRET!]) {
        expect(json).not.toContain(value);
      }
      expect(config.find((c) => c.name === "ANTHROPIC_API_KEY")).toEqual({ name: "ANTHROPIC_API_KEY", kind: "secret", state: "set" });
      expect(config.find((c) => c.name === "ADMIN_CHARACTER_IDS")?.count).toBe(2);
      expect(config.find((c) => c.name === "SOURCE_URL")?.value).toBe("custom");
      expect(config.find((c) => c.name === "LOG_LEVEL")?.value).toBe("error");
    } finally {
      vi.unstubAllEnvs();
      resetEnvCache();
    }
  });

  it("compares APP_URL with the browser's address, honouring proxy headers", () => {
    expect(appUrlMatches("http://localhost:3000")).toBe(true);
    expect(appUrlMatches("http://127.0.0.1:3000")).toBe(false);
    expect(appUrlMatches(null)).toBeNull();
    expect(originFromHeaders(new Headers({ host: "app:3000", "x-forwarded-host": "ks.example", "x-forwarded-proto": "https" }))).toBe(
      "https://ks.example",
    );
    expect(originFromHeaders(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });
});

describe("migrations and schema", () => {
  it("finds pending, unknown and edited migrations", () => {
    const journal = [
      { tag: "0000_init", when: 1, hash: "a" },
      { tag: "0001_next", when: 2, hash: "b" },
      { tag: "0002_new", when: 3, hash: "c" },
    ];
    const info = compareMigrations(journal, [
      { createdAt: 1, hash: "a" },
      { createdAt: 2, hash: "changed" },
      { createdAt: 9, hash: "z" },
    ]);
    expect(info).toMatchObject({ bundled: 3, applied: 3, pending: ["0002_new"], unknown: 1, hashMismatch: ["0001_next"] });
    expect(info.latest?.tag).toBe("unknown");
  });

  it("matches the shipped migration files the way drizzle hashes them", () => {
    const journal = readJournal();
    expect(journal?.length).toBeGreaterThan(0);
    expect(journal!.every((j) => /^[0-9a-f]{64}$/.test(j.hash ?? ""))).toBe(true);
  });

  it("reports missing and extra tables and columns", () => {
    const drift = compareSchema(
      new Map([
        ["users", new Set(["id", "role"])],
        ["sync_jobs", new Set(["id"])],
      ]),
      new Map([
        ["users", new Set(["id", "legacy"])],
        ["old_table", new Set(["id"])],
      ]),
    );
    expect(drift).toEqual({
      missingTables: ["sync_jobs"],
      missingColumns: ["users.role"],
      extraTables: ["old_table"],
      extraColumns: ["users.legacy"],
    });
  });
});

describe("health checks", () => {
  it("pass on a healthy instance", () => {
    const checks = runChecks(snapshot(), NOW);
    expect(checks.filter((c) => c.status === "warn" || c.status === "fail")).toEqual([]);
    expect(worstStatus(checks)).toBe("ok");
  });

  it("flag a stopped or outdated worker", () => {
    const stopped = snapshot();
    if (stopped.worker.ok) stopped.worker.data.heartbeats[0].lastBeatAt = ago(180);
    expect(status(runChecks(stopped, NOW), "worker")).toBe("fail");
    expect(status(runChecks(stopped, NOW), "workerVersion")).toBe("skip");

    const outdated = snapshot();
    if (outdated.worker.ok) outdated.worker.data.heartbeats[0].version = "0.10.2";
    const check = runChecks(outdated, NOW).find((c) => c.id === "workerVersion");
    expect(check).toEqual({ id: "workerVersion", status: "warn", values: { worker: "0.10.2", web: "0.11.0" } });
  });

  it("fail when jobs fail 3 times in a row, not before", () => {
    const job = (maxStreak: number) => ({
      jobKey: "corp.wallet",
      ownerType: "corporation" as const,
      enabled: 1,
      disabled: 0,
      ok: 0,
      error: 1,
      running: 0,
      pending: 0,
      skipped: 0,
      failingOwners: 1,
      maxStreak,
      avgMs: 10,
      maxMs: 10,
      overdue: 0,
      staleLocks: 0,
      lastRunAt: null,
      lastSuccessAt: null,
    });
    const withJob = (streak: number) => {
      const s = snapshot();
      if (s.worker.ok) s.worker.data.jobs = [job(streak)];
      return s;
    };
    expect(status(runChecks(withJob(2), NOW), "jobs")).toBe("ok");
    expect(status(runChecks(withJob(3), NOW), "jobs")).toBe("fail");
  });

  it("flag pending migrations, missing columns, paused sync, missing SSO, a wrong APP_URL and clock skew", () => {
    const s = snapshot({ appUrlMatchesOrigin: false, clock: { ok: true, data: { dbOffsetMs: 9_000 } } });
    if (s.database.ok) {
      s.database.data.migrations.pending = ["0012_next"];
      s.database.data.drift.missingColumns = ["users.role"];
    }
    if (s.settings.ok) s.settings.data.syncPaused = true;
    s.config = s.config.filter((c) => c.name !== "EVE_CLIENT_SECRET");
    const checks = runChecks(s, NOW);
    expect(status(checks, "migrations")).toBe("fail");
    expect(status(checks, "schema")).toBe("fail");
    expect(status(checks, "syncPaused")).toBe("warn");
    expect(status(checks, "jobQueue")).toBe("skip");
    expect(status(checks, "sso")).toBe("fail");
    expect(status(checks, "appUrl")).toBe("warn");
    expect(status(checks, "clock")).toBe("warn");
  });

  it("skip what depends on an unreachable database", () => {
    const failed = { ok: false as const, error: "connect ECONNREFUSED" };
    const checks = runChecks(snapshot({ database: failed, worker: failed, settings: failed, clock: failed }), NOW);
    expect(status(checks, "database")).toBe("fail");
    for (const id of ["migrations", "schema", "worker", "jobs", "syncPaused", "clock"] as const) {
      expect(status(checks, id)).toBe("skip");
    }
  });

  it("warn about audit entries the web process failed to write", () => {
    const failures = { count: 2, lastAt: ago(60), lastAction: "user.login" };
    const check = runChecks(snapshot({ auditFailures: failures }), NOW).find((c) => c.id === "auditLog");
    expect(check).toEqual({ id: "auditLog", status: "warn", values: { count: 2, last: ago(60), action: "user.login" } });
    expect(status(runChecks(snapshot({ auditFailures: null }), NOW), "auditLog")).toBe("skip");
    expect(MESSAGES.en.admin.system.checks.auditLog.detail("warn", check!.values)).toContain("2 audit entries");
  });

  it("have a text for every check and status in every language", () => {
    const checks = runChecks(snapshot(), NOW);
    for (const messages of Object.values(MESSAGES)) {
      for (const c of checks) {
        for (const s of ["ok", "warn", "fail", "skip"] as const) {
          expect(messages.admin.system.checks[c.id].detail(s, { reason: "x" })).toBeTruthy();
        }
      }
    }
  });
});

describe("support package", () => {
  const MARKERS = ["Aria Vexmoor", "Keystar Industries", "2112345678", "98765432", "worker-host-secret", "db.internal.example"];

  function leaky(): SystemSnapshot {
    const s = snapshot();
    if (s.worker.ok) {
      s.worker.data.heartbeats[0].workerId = "worker-host-secret:42";
      s.worker.data.errors = [
        {
          jobKey: "corp.wallet",
          ownerType: "corporation",
          error: "ESI GET /corporations/98765432/wallets/ failed: Forbidden",
          consecutiveFailures: 7,
          lastRunAt: ago(60),
        },
        {
          jobKey: "corp.wallet",
          ownerType: "corporation",
          error: "ESI GET /corporations/98765433/wallets/ failed: Forbidden",
          consecutiveFailures: 2,
          lastRunAt: ago(30),
        },
        {
          jobKey: "mining.character-ledger",
          ownerType: "character",
          error: 'Token of "Aria Vexmoor" (2112345678) for "Keystar Industries" is invalid',
          consecutiveFailures: 4,
          lastRunAt: ago(10),
        },
      ];
    }
    s.audit = { ok: false, error: "getaddrinfo ENOTFOUND db.internal.example" };
    return s;
  }

  it("contains no names, IDs, hosts or worker ids, and says what it removed", () => {
    const s = leaky();
    const pkg = buildSupportPackage(s, runChecks(s, NOW), { now: NOW });
    const json = JSON.stringify(pkg);
    for (const marker of MARKERS) expect(json).not.toContain(marker);
    expect(pkg.meta.redactions.eveId).toBeGreaterThanOrEqual(3);
    expect(pkg.meta.redactions.name).toBe(2);
    expect(pkg.meta.collectorErrors).toEqual({ audit: "getaddrinfo ENOTFOUND [host]" });
    expect(pkg.workers[0].id).toMatch(/^h:[0-9a-f]{10}$/);
  });

  it("groups failing owners by error signature", () => {
    const s = leaky();
    const pkg = buildSupportPackage(s, runChecks(s, NOW), { now: NOW });
    expect(pkg.errorSignatures[0]).toMatchObject({
      jobKey: "corp.wallet",
      count: 2,
      maxStreak: 7,
      text: "ESI GET /corporations/[id]/wallets/ failed: Forbidden",
    });
    expect(pkg.errorSignatures).toHaveLength(2);
  });

  it("still builds when collectors failed", () => {
    const failed = { ok: false as const, error: "boom" };
    const s = snapshot({ database: failed, worker: failed, tokens: failed });
    const pkg = buildSupportPackage(s, runChecks(s, NOW), { now: NOW });
    expect(pkg.database).toBeNull();
    expect(pkg.workers).toEqual([]);
    expect(Object.keys(pkg.meta.collectorErrors).sort()).toEqual(["database", "tokens", "worker"]);
  });

  it("is named after the version and time", () => {
    const pkg = buildSupportPackage(snapshot(), [], { now: Date.parse("2026-10-04T12:41:07.123Z") });
    expect(supportPackageFilename(pkg)).toBe("keystar-support-0.11.0-20261004T124107Z.json");
  });
});

describe("issue summary", () => {
  it("lists the build, worker and problems in English, and fits a prefilled GitHub URL", () => {
    const s = snapshot();
    if (s.worker.ok) s.worker.data.heartbeats[0].version = "0.10.2";
    const summary = issueSummary(s, runChecks(s, NOW), NOW);
    expect(summary).toContain("Keystar **0.11.0** (a1b2c3d), Docker image :0.11.0");
    expect(summary).toContain("PostgreSQL 17.2");
    expect(summary).not.toContain("Debian");
    expect(summary).toContain("⚠ Worker and web on the same version: The worker runs 0.10.2");
    const url = bugReportUrl("https://github.com/theragus/keystar/", "0.11.0", summary);
    expect(url).toMatch(/^https:\/\/github\.com\/theragus\/keystar\/issues\/new\?template=bug_report\.yml&version=0\.11\.0&system=/);
    expect(new URL(url).searchParams.get("system")).toBe(summary);
    expect(url.length).toBeLessThan(8000);
  });
});

describe("ESI client stats", () => {
  it("counts responses, cache hits and the error limit, and estimates ESI's clock", async () => {
    let call = 0;
    const esiDate = new Date(Date.now() + 120_000).toUTCString();
    const fetchImpl = vi.fn(async () => {
      call++;
      const headers = {
        "content-type": "application/json",
        date: esiDate,
        expires: new Date(Date.now() + 60_000).toUTCString(),
        "x-esi-error-limit-remain": "97",
        "x-esi-error-limit-reset": "30",
      };
      return call === 2 ? new Response("{}", { status: 404, headers }) : new Response("[]", { status: 200, headers });
    });
    const store = new Map();
    const esi = new EsiClient({
      baseUrl: "https://esi.test",
      userAgent: "test",
      compatibilityDate: "2026-08-18",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
      cache: { get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) },
    });
    await esi.get("/status");
    await esi.get("/missing").catch(() => undefined);
    await esi.get("/status");
    const stats = esi.stats();
    expect(stats.requests).toMatchObject({ ok: 1, clientError: 1 });
    expect(stats.cacheHits).toBe(1);
    expect(stats.errorLimitRemain).toBe(97);
    expect(stats.clockOffsetMs).toBeGreaterThan(115_000);
    expect(stats.clockOffsetMs).toBeLessThan(121_000);
  });
});

describe("network", () => {
  const ok = (status: number) => async () => ({ status });
  const fail = (code: string) => async (): Promise<{ status: number }> => {
    throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(`getaddrinfo ${code} db`), { code }) });
  };

  it("probes every target in parallel and reports error codes and timeouts", async () => {
    const result = await collectNetwork(
      { esi: ok(200), sso: fail("ENOTFOUND"), zkill: () => new Promise<{ status: number }>(() => {}) },
      50,
    );
    expect(result.map((p) => [p.target, p.reachable, p.status, p.error])).toEqual([
      ["esi", true, 200, null],
      ["sso", false, null, "ENOTFOUND"],
      ["zkill", false, null, "timeout"],
    ]);
    expect(networkError(new Error("socket hang up"))).toBe("socket hang up");
  });

  it("cancels a probe's request when it times out", async () => {
    let aborted = false;
    const [result] = await collectNetwork(
      {
        esi: (signal) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(signal.reason);
            }),
          ),
        sso: ok(200),
        zkill: ok(200),
      },
      20,
    );
    expect(result).toMatchObject({ target: "esi", reachable: false, error: "timeout" });
    expect(aborted).toBe(true);
  });

  it("fails when ESI or EVE SSO are unreachable, warns for zKillboard, a 403 or an ESI outage", () => {
    const probes = (overrides: Partial<Record<"esi" | "sso" | "zkill", { reachable: boolean; status: number | null }>>) =>
      (["esi", "sso", "zkill"] as const).map((target) => ({
        target,
        reachable: true,
        status: 200 as number | null,
        ms: 10,
        error: null,
        ...overrides[target],
      }));
    const check = (network: ReturnType<typeof probes> | null) =>
      runChecks(snapshot({ network }), NOW).find((c) => c.id === "network");
    expect(check(probes({}))).toMatchObject({ status: "ok", values: { ms: 10 } });
    expect(check(probes({ sso: { reachable: false, status: null } }))).toMatchObject({ status: "fail", values: { down: "sso" } });
    expect(check(probes({ zkill: { reachable: false, status: null } }))?.status).toBe("warn");
    expect(check(probes({ zkill: { reachable: true, status: 403 } }))).toMatchObject({
      status: "warn",
      values: { refused: "zkill:403" },
    });
    expect(check(probes({ esi: { reachable: true, status: 503 } }))?.status).toBe("warn");
    expect(check(null)?.status).toBe("skip");
    const en = MESSAGES.en.admin.system.checks.network;
    expect(en.detail("fail", { down: "esi,sso", refused: "" })).toContain("ESI, EVE SSO");
    expect(en.detail("warn", { down: "", refused: "zkill:403" })).toContain("zKillboard blocks this server (HTTP 403)");
    expect(en.detail("warn", { down: "", refused: "esi:503" })).toBe("ESI answers with an error (HTTP 503) and may be down.");
    // A 403 means "blocked" only from zKillboard; ESI's or SSO's isn't flagged (or blamed on ESI_CONTACT).
    expect(check(probes({ esi: { reachable: true, status: 403 } }))?.status).toBe("ok");
  });

  it("scrubs host names from network errors in the support package", () => {
    const s = snapshot({
      network: [{ target: "esi", reachable: false, status: null, ms: 5000, error: "getaddrinfo ENOTFOUND proxy.corp.example" }],
    });
    const pkg = buildSupportPackage(s, runChecks(s, NOW), { now: NOW });
    expect(pkg.network?.[0].error).toBe("getaddrinfo ENOTFOUND [host]");
    expect(pkg.meta.redactions.host).toBeGreaterThan(0);
  });

  it("pings ESI and zKillboard once, without retries, counting the request", async () => {
    const esiFetch = vi.fn(async () => new Response("{}", { status: 503 }));
    const esi = new EsiClient({
      baseUrl: "https://esi.test",
      userAgent: "test",
      compatibilityDate: "2026-08-18",
      fetchImpl: esiFetch as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(await esi.ping()).toEqual({ status: 503 });
    expect(esiFetch).toHaveBeenCalledTimes(1);
    expect(esi.stats().requests.serverError).toBe(1);

    const zkFetch = vi.fn(async () => new Response("{}", { status: 403 }));
    const zkill = new ZkillClient({ userAgent: "test", fetch: zkFetch as unknown as typeof fetch, sleep: async () => {} });
    expect(await zkill.ping()).toEqual({ status: 403 });
    expect(zkFetch).toHaveBeenCalledTimes(1);
    expect(zkill.stats()).toMatchObject({ requests: 1, failed: 1 });
  });
});
