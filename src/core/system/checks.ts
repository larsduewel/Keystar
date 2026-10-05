import type { EsiClientStats } from "@/core/esi/client";
import type { SystemSnapshot } from "./collect";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export const CHECK_IDS = [
  "database",
  "migrations",
  "schema",
  "worker",
  "workerVersion",
  "jobs",
  "jobQueue",
  "syncPaused",
  "sso",
  "appUrl",
  "clock",
  "esiLimits",
  "network",
  "auditLog",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** `values` fill in the check's message (see `admin.system.checks` in the dictionaries). */
export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  values: Record<string, string | number>;
}

/** A worker counts as running when it sent a heartbeat within this window (the Sync page uses the same). */
export const HEARTBEAT_FRESH_MS = 2 * 60_000;
/** A job failing this many times in a row is reported. */
export const FAILURE_STREAK = 3;
const DB_CLOCK_TOLERANCE_MS = 5_000;
/** ESI's Date header has one-second resolution, so allow more slack there. */
const ESI_CLOCK_TOLERANCE_MS = 30_000;

const SEVERITY: Record<CheckStatus, number> = { skip: 0, ok: 1, warn: 2, fail: 3 };

export function worstStatus(checks: CheckResult[]): CheckStatus {
  return checks.reduce<CheckStatus>((worst, c) => (SEVERITY[c.status] > SEVERITY[worst] ? c.status : worst), "ok");
}

/**
 * A service that answers but won't serve us: any 5xx (down, or ESI's daily downtime), and zKillboard's
 * 403, which it sends to unknown User-Agents and busy IPs. A 403 from ESI or SSO to these anonymous
 * requests isn't a known failure mode, so it doesn't count.
 */
export function isRefused(target: string, status: number | null): boolean {
  return (status ?? 0) >= 500 || (target === "zkill" && status === 403);
}

/** Health checks over a snapshot. Pure, so they are easy to test and identical on the page and in the package. */
export function runChecks(s: SystemSnapshot, now = Date.now()): CheckResult[] {
  const results: CheckResult[] = [];
  const add = (id: CheckId, status: CheckStatus, values: Record<string, string | number> = {}) =>
    results.push({ id, status, values });

  // Database, migrations and schema.
  if (!s.database.ok) {
    add("database", "fail");
    add("migrations", "skip");
    add("schema", "skip");
  } else {
    const db = s.database.data;
    add("database", "ok", { ms: db.latencyMs });
    const m = db.migrations;
    if (m.pending.length) add("migrations", "fail", { pending: m.pending.length });
    else if (m.unknown) add("migrations", "warn", { unknown: m.unknown, reason: "unknown" });
    else if (m.hashMismatch.length) add("migrations", "warn", { changed: m.hashMismatch.length, reason: "changed" });
    else add("migrations", "ok", { applied: m.applied, bundled: m.bundled ?? m.applied });
    const missing = db.drift.missingTables.length + db.drift.missingColumns.length;
    add("schema", missing ? "fail" : "ok", missing ? { missing } : {});
  }

  // Worker and jobs.
  const paused = s.settings.ok && s.settings.data.syncPaused;
  const fresh = s.worker.ok
    ? s.worker.data.heartbeats.filter((h) => now - Date.parse(h.lastBeatAt) < HEARTBEAT_FRESH_MS)
    : [];
  if (!s.worker.ok) {
    for (const id of ["worker", "workerVersion", "jobs", "jobQueue"] as const) add(id, "skip");
  } else {
    const w = s.worker.data;
    if (fresh.length) add("worker", "ok", { seconds: Math.round((now - Date.parse(fresh[0].lastBeatAt)) / 1000), count: fresh.length });
    else add("worker", "fail", w.heartbeats[0] ? { last: w.heartbeats[0].lastBeatAt } : {});

    const other = fresh.find((h) => h.version !== s.build.version);
    if (!fresh.length) add("workerVersion", "skip");
    else if (other) add("workerVersion", "warn", { worker: other.version ?? "?", web: s.build.version });
    else add("workerVersion", "ok", { version: s.build.version });

    const failing = new Set(w.jobs.filter((j) => j.maxStreak >= FAILURE_STREAK).map((j) => j.jobKey));
    add("jobs", failing.size ? "fail" : "ok", failing.size ? { count: failing.size, streak: FAILURE_STREAK } : {});

    const overdue = w.jobs.reduce((n, j) => n + j.overdue, 0);
    const stale = w.jobs.reduce((n, j) => n + j.staleLocks, 0);
    if (!fresh.length || paused) add("jobQueue", "skip");
    else add("jobQueue", overdue || stale ? "warn" : "ok", { overdue, stale });
  }
  add("syncPaused", !s.settings.ok ? "skip" : paused ? "warn" : "ok");

  // Configuration.
  const isSet = (name: string) => s.config.find((c) => c.name === name)?.state === "set";
  if (s.demoMode) add("sso", "skip");
  else add("sso", isSet("EVE_CLIENT_ID") && isSet("EVE_CLIENT_SECRET") ? "ok" : "fail");

  const appUrl = s.config.find((c) => c.name === "APP_URL");
  const production = s.config.find((c) => c.name === "NODE_ENV")?.value === "production";
  if (s.appUrlMatchesOrigin === false) add("appUrl", "warn", { reason: "origin" });
  else if (production && appUrl && !appUrl.https) add("appUrl", "warn", { reason: "https" });
  else if (s.appUrlMatchesOrigin === null) add("appUrl", "skip");
  else add("appUrl", "ok");

  // Clocks: the database's, and ESI's as the web process and workers last saw it.
  const esiStats = [s.esi, ...fresh.map((h) => h.info.esi ?? null)].filter((e): e is EsiClientStats => Boolean(e));
  const esiOffsets = esiStats.map((e) => e.clockOffsetMs).filter((o): o is number => o !== null);
  const esiOffset = esiOffsets.length ? esiOffsets.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null;
  if (!s.clock.ok) add("clock", "skip");
  else {
    const dbMs = s.clock.data.dbOffsetMs;
    const off = Math.abs(dbMs) > DB_CLOCK_TOLERANCE_MS || (esiOffset !== null && Math.abs(esiOffset) > ESI_CLOCK_TOLERANCE_MS);
    add("clock", off ? "warn" : "ok", { dbSeconds: Math.round(dbMs / 1000), esiSeconds: Math.round((esiOffset ?? 0) / 1000) });
  }

  if (!esiStats.length) add("esiLimits", "skip");
  else {
    const limited = esiStats.some((e) => e.errorLimitPausedUntil || e.pausedGroups.length);
    const remain = Math.min(...esiStats.map((e) => e.errorLimitRemain ?? 100));
    add("esiLimits", limited ? "warn" : "ok", { remain });
  }

  // Outbound connections: ESI and SSO are needed for syncing and sign-in, zKillboard only for kills and intel.
  if (!s.network) add("network", "skip");
  else {
    const down = s.network.filter((p) => !p.reachable).map((p) => p.target);
    const refused = s.network
      .filter((p) => p.reachable && isRefused(p.target, p.status))
      .map((p) => `${p.target}:${p.status}`);
    const critical = down.some((t) => t === "esi" || t === "sso");
    if (down.length) add("network", critical ? "fail" : "warn", { down: down.join(","), refused: refused.join(",") });
    else if (refused.length) add("network", "warn", { down: "", refused: refused.join(",") });
    else add("network", "ok", { ms: Math.max(...s.network.map((p) => p.ms)) });
  }

  // Best-effort audit writes that failed in this process; sensitive changes write theirs in their own transaction.
  const af = s.auditFailures;
  if (!af) add("auditLog", "skip");
  else if (af.count) add("auditLog", "warn", { count: af.count, last: af.lastAt ?? "", action: af.lastAction ?? "" });
  else add("auditLog", "ok");

  return results;
}
