import type { EsiClientStats } from "@/core/esi/client";
import type { BuildInfo } from "@/core/version";
import type { ZkillClientStats } from "@/modules/killboard/zkill";
import type { CheckResult } from "./checks";
import type { ModuleSummary, Section, SettingsSummary, SystemSnapshot, TokenSummary } from "./collect";
import type { ConfigEntry } from "./config";
import type { DatabaseInfo } from "./database";
import type { NetworkProbe } from "./network";
import { createRedactor, errorSignature, type RedactionRule, type Redactor } from "./redact";
import type { ProcessRuntime } from "./runtime";
import type { JobSummary } from "./worker";

/** Bump when the layout changes in a way a reader of older packages must know about. */
export const SUPPORT_PACKAGE_FORMAT = 1;

export interface ErrorSignature {
  jobKey: string;
  ownerType: string;
  /** Owners failing with this error. */
  count: number;
  maxStreak: number;
  lastSeen: string | null;
  text: string;
}

export interface WorkerEntry {
  /** Hashed worker id (host:pid), consistent within this package only. */
  id: string;
  version: string | null;
  startedAt: string;
  lastBeatSecondsAgo: number;
  running: number | null;
  concurrency: number | null;
  demo: boolean | null;
  runtime: ProcessRuntime | null;
  esi: EsiClientStats | null;
  zkill: ZkillClientStats | null;
}

/**
 * The support package: technical facts about an instance for a bug report.
 * Built from an allowlist of fields, never by dumping tables or the environment.
 * It contains no pilot, corporation or alliance names or IDs, no secrets, no
 * instance address and no audit actors; free text (errors) is scrubbed.
 */
export interface SupportPackage {
  meta: {
    packageFormat: typeof SUPPORT_PACKAGE_FORMAT;
    generatedAt: string;
    generatedBy: "web" | "cli";
    /** What the scrubber removed from error texts. */
    redactions: Record<RedactionRule, number>;
    /** Collectors that failed, with their scrubbed error. */
    collectorErrors: Record<string, string>;
  };
  build: BuildInfo;
  checks: CheckResult[];
  runtime: ProcessRuntime;
  clock: { dbOffsetMs: number | null };
  /** Reachability of ESI, EVE SSO and zKillboard from the process that built the package. */
  network: NetworkProbe[] | null;
  config: { entries: ConfigEntry[]; appUrlMatchesOrigin: boolean | null; demoMode: boolean };
  settings: SettingsSummary | null;
  modules: ModuleSummary[];
  tokens: TokenSummary | null;
  database: DatabaseInfo | null;
  workers: WorkerEntry[];
  jobs: JobSummary[];
  errorSignatures: ErrorSignature[];
  esi: EsiClientStats | null;
  zkill: ZkillClientStats | null;
  audit: Record<string, number> | null;
  /** Failed audit writes in the web process; the failed action names only, no actors. */
  auditFailures: { count: number; lastAt: string | null; lastAction: string | null } | null;
}

function data<T>(s: Section<T>, name: string, errors: Record<string, string>, r: Redactor): T | null {
  if (s.ok) return s.data;
  errors[name] = r.scrub(s.error);
  return null;
}

function signatures(snapshot: SystemSnapshot, r: Redactor): ErrorSignature[] {
  if (!snapshot.worker.ok) return [];
  const groups = new Map<string, ErrorSignature>();
  for (const e of snapshot.worker.data.errors) {
    const text = errorSignature(r.scrub(e.error));
    const key = `${e.jobKey}\u0000${e.ownerType}\u0000${text}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.maxStreak = Math.max(g.maxStreak, e.consecutiveFailures);
      if (e.lastRunAt && (!g.lastSeen || e.lastRunAt > g.lastSeen)) g.lastSeen = e.lastRunAt;
    } else {
      groups.set(key, {
        jobKey: e.jobKey,
        ownerType: e.ownerType,
        count: 1,
        maxStreak: e.consecutiveFailures,
        lastSeen: e.lastRunAt,
        text,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.maxStreak - a.maxStreak || b.count - a.count);
}

export function buildSupportPackage(
  snapshot: SystemSnapshot,
  checks: CheckResult[],
  opts: { redactor?: Redactor; now?: number } = {},
): SupportPackage {
  const r = opts.redactor ?? createRedactor();
  const now = opts.now ?? Date.now();
  const collectorErrors: Record<string, string> = {};
  const settings = data(snapshot.settings, "settings", collectorErrors, r);
  const tokens = data(snapshot.tokens, "tokens", collectorErrors, r);
  const database = data(snapshot.database, "database", collectorErrors, r);
  const worker = data(snapshot.worker, "worker", collectorErrors, r);
  const clock = data(snapshot.clock, "clock", collectorErrors, r);
  const audit = data(snapshot.audit, "audit", collectorErrors, r);
  const errorSignatures = signatures(snapshot, r);
  const network = snapshot.network?.map((p) => ({ ...p, error: p.error && r.scrub(p.error) })) ?? null;

  return {
    meta: {
      packageFormat: SUPPORT_PACKAGE_FORMAT,
      generatedAt: new Date(now).toISOString(),
      generatedBy: snapshot.source,
      // Read last, after every scrub above.
      redactions: r.counts(),
      collectorErrors,
    },
    build: snapshot.build,
    checks,
    runtime: snapshot.runtime,
    clock: { dbOffsetMs: clock?.dbOffsetMs ?? null },
    network,
    config: { entries: snapshot.config, appUrlMatchesOrigin: snapshot.appUrlMatchesOrigin, demoMode: snapshot.demoMode },
    settings,
    modules: snapshot.modules,
    tokens,
    database,
    workers: (worker?.heartbeats ?? []).map((h) => ({
      id: r.hash(h.workerId),
      version: h.version,
      startedAt: h.startedAt,
      lastBeatSecondsAgo: Math.round((now - Date.parse(h.lastBeatAt)) / 1000),
      running: h.info.running ?? null,
      concurrency: h.info.concurrency ?? null,
      demo: h.info.demo ?? null,
      runtime: h.info.runtime ?? null,
      esi: h.info.esi ?? null,
      zkill: h.info.zkill ?? null,
    })),
    jobs: worker?.jobs ?? [],
    errorSignatures,
    esi: snapshot.esi,
    zkill: snapshot.zkill,
    audit,
    auditFailures: snapshot.auditFailures,
  };
}

/** `keystar-support-0.11.0-20261004T124107Z.json` */
export function supportPackageFilename(pkg: SupportPackage): string {
  const stamp = pkg.meta.generatedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `keystar-support-${pkg.build.version}-${stamp}.json`;
}
