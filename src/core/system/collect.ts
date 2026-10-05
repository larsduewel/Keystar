import { sql } from "drizzle-orm";
import { auditFailures, type AuditFailures } from "@/core/audit";
import { getDb } from "@/core/db";
import { esiStats } from "@/core/esi";
import type { EsiClientStats } from "@/core/esi/client";
import { errorMessage } from "@/core/logger";
import { MODULES } from "@/core/modules/registry";
import { getSettings } from "@/core/settings";
import { buildInfo, type BuildInfo } from "@/core/version";
import { JOBS } from "@/modules/jobs";
import { zkillStats } from "@/modules/killboard/sync";
import type { ZkillClientStats } from "@/modules/killboard/zkill";
import { appUrlMatches, collectConfig, type ConfigEntry } from "./config";
import { collectDatabase, type DatabaseInfo } from "./database";
import { collectNetwork, type NetworkProbe } from "./network";
import { processRuntime, type ProcessRuntime } from "./runtime";
import { collectWorker, type WorkerInfo } from "./worker";

/** A collector's result; one failing collector never takes the rest down. */
export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

async function section<T>(fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export interface SettingsSummary {
  homeCorporationSet: boolean;
  autoApproveCorpMembers: boolean;
  autoApproveAllianceMembers: boolean;
  /** Permission key → minimum role, as changed by admins. */
  permissionOverrides: Record<string, string>;
  valuationSource: string;
  valuationMode: string;
  syncPaused: boolean;
  setupCompleted: boolean;
  eveServer: { serverVersion: string; players: number; checkedAt: string } | null;
}

export interface ModuleSummary {
  id: string;
  scopes: { scope: string; level: "character" | "corporation"; optional: boolean }[];
  jobs: { key: string; owner: string; intervalSeconds: number }[];
}

/** Counts only: how healthy the stored ESI tokens are and which scopes they grant. */
export interface TokenSummary {
  users: Record<string, number>;
  characters: number;
  tokens: Record<string, number>;
  /** Active tokens not refreshed for a day: the worker may not be using them. */
  notRefreshedForADay: number;
  /** Scope → number of active tokens granting it. */
  scopes: Record<string, number>;
}

export interface SystemSnapshot {
  collectedAt: string;
  source: "web" | "cli";
  build: BuildInfo;
  runtime: ProcessRuntime;
  config: ConfigEntry[];
  /** Whether APP_URL matches the address the page was opened with; null from the CLI. */
  appUrlMatchesOrigin: boolean | null;
  demoMode: boolean;
  settings: Section<SettingsSummary>;
  modules: ModuleSummary[];
  tokens: Section<TokenSummary>;
  database: Section<DatabaseInfo>;
  worker: Section<WorkerInfo>;
  /** Reachability of ESI, EVE SSO and zKillboard from this process; null when not probed. */
  network: NetworkProbe[] | null;
  /** Database clock minus ours. */
  clock: Section<{ dbOffsetMs: number }>;
  /** Counters of this process's clients; the worker's own are in its heartbeat. */
  esi: EsiClientStats | null;
  zkill: ZkillClientStats | null;
  /** Action → count over the last 7 days. */
  audit: Section<Record<string, number>>;
  /** Audit entries this process failed to write since it started; null from the CLI, whose process just started. */
  auditFailures: AuditFailures | null;
}

async function collectSettings(): Promise<SettingsSummary> {
  const s = await getSettings();
  const server = s["eve.serverStatus"];
  return {
    homeCorporationSet: s["corp.homeCorporationId"] !== null,
    autoApproveCorpMembers: s["access.autoApproveCorpMembers"],
    autoApproveAllianceMembers: s["access.autoApproveAllianceMembers"],
    permissionOverrides: s["permissions.overrides"],
    valuationSource: s["mining.valuationSource"],
    valuationMode: s["mining.valuationMode"],
    syncPaused: s["sync.paused"],
    setupCompleted: s["setup.completedAt"] !== null,
    eveServer: server ? { serverVersion: server.serverVersion, players: server.players, checkedAt: server.checkedAt } : null,
  };
}

function collectModules(): ModuleSummary[] {
  return MODULES.map((m) => ({
    id: m.id,
    scopes: m.scopes.map((s) => ({ scope: s.scope, level: s.level, optional: Boolean(s.optional) })),
    jobs: JOBS.filter((j) => j.module === m.id).map((j) => ({ key: j.key, owner: j.owner, intervalSeconds: j.intervalSeconds })),
  }));
}

type Counted = { key: string | null; n: number };
const counted = (rows: unknown) =>
  Object.fromEntries((rows as Counted[]).map((r) => [r.key ?? "none", r.n])) as Record<string, number>;

async function collectTokens(): Promise<TokenSummary> {
  const db = getDb();
  const [users, characters, tokens, stale, scopes] = await Promise.all([
    db.execute(sql`SELECT role AS key, count(*)::int AS n FROM users GROUP BY role`),
    db.execute(sql`SELECT count(*)::int AS n FROM characters`),
    db.execute(sql`SELECT status AS key, count(*)::int AS n FROM esi_tokens GROUP BY status`),
    db.execute(sql`SELECT count(*)::int AS n FROM esi_tokens
                   WHERE status = 'active' AND (last_refreshed_at IS NULL OR last_refreshed_at < now() - interval '1 day')`),
    db.execute(sql`SELECT scope AS key, count(*)::int AS n FROM esi_tokens, unnest(scopes) AS scope
                   WHERE status = 'active' GROUP BY scope ORDER BY scope`),
  ]);
  return {
    users: counted(users),
    characters: (characters as unknown as { n: number }[])[0]?.n ?? 0,
    tokens: counted(tokens),
    notRefreshedForADay: (stale as unknown as { n: number }[])[0]?.n ?? 0,
    scopes: counted(scopes),
  };
}

async function collectClock(): Promise<{ dbOffsetMs: number }> {
  const before = Date.now();
  const [row] = (await getDb().execute(sql`SELECT (extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms`)) as unknown as {
    ms: number;
  }[];
  const after = Date.now();
  return { dbOffsetMs: Math.round(Number(row.ms) - (before + after) / 2) };
}

async function collectAudit(): Promise<Record<string, number>> {
  return counted(
    await getDb().execute(sql`SELECT action AS key, count(*)::int AS n FROM audit_log
                              WHERE created_at > now() - interval '7 days' GROUP BY action ORDER BY action`),
  );
}

/**
 * Everything System Info shows and the support package is built from. Holds raw
 * data (job errors, worker ids); `buildSupportPackage` decides what may leave the instance.
 */
export async function collectSystemSnapshot(opts: {
  source: "web" | "cli";
  origin?: string | null;
  /** Probe ESI, EVE SSO and zKillboard (default); tests turn it off to stay offline. */
  network?: boolean;
}): Promise<SystemSnapshot> {
  const config = collectConfig();
  const [settings, tokens, database, worker, clock, audit, network] = await Promise.all([
    section(collectSettings),
    section(collectTokens),
    section(collectDatabase),
    section(collectWorker),
    section(collectClock),
    section(collectAudit),
    opts.network === false ? null : collectNetwork(),
  ]);
  return {
    collectedAt: new Date().toISOString(),
    source: opts.source,
    build: buildInfo(),
    runtime: processRuntime(),
    config,
    appUrlMatchesOrigin: appUrlMatches(opts.origin ?? null),
    demoMode: config.find((c) => c.name === "KEYSTAR_DEMO_MODE")?.value === "true",
    settings,
    modules: collectModules(),
    tokens,
    database,
    worker,
    network,
    clock,
    esi: esiStats(),
    zkill: zkillStats(),
    audit,
    auditFailures: opts.source === "web" ? auditFailures() : null,
  };
}
