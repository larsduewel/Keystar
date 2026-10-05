import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/core/db";

/** The advisory lock `runMigrations` holds while migrating (src/scripts/migrate.ts). */
const MIGRATION_LOCK_KEY = 727274;
/** Postgres settings worth knowing when debugging, all harmless to share. */
const PG_SETTINGS = [
  "max_connections",
  "shared_buffers",
  "work_mem",
  "statement_timeout",
  "idle_in_transaction_session_timeout",
  "TimeZone",
  "server_encoding",
  "lc_collate",
  "max_wal_size",
];

export interface MigrationInfo {
  /** Migrations shipped with this build (drizzle/meta/_journal.json); null when the folder isn't readable. */
  bundled: number | null;
  applied: number;
  /** Bundled but not applied. */
  pending: string[];
  /** Applied but unknown to this build: the database was migrated by a newer Keystar. */
  unknown: number;
  /** Applied with a different SQL file than this build ships (an edited migration). */
  hashMismatch: string[];
  latest: { tag: string; appliedAt: string } | null;
}

export interface TableInfo {
  name: string;
  rows: number;
  /** PostgreSQL's estimate instead of an exact count: the table took too long to count. */
  rowsEstimated: boolean;
  totalBytes: number;
  indexBytes: number;
  deadTuples: number;
  lastVacuum: string | null;
  lastAnalyze: string | null;
}

export interface DatabaseInfo {
  serverVersion: string;
  latencyMs: number;
  sizeBytes: number;
  settings: Record<string, string>;
  extensions: Record<string, string>;
  migrations: MigrationInfo;
  /** Tables and columns the Drizzle schema expects but the database lacks, and the reverse. */
  drift: { missingTables: string[]; missingColumns: string[]; extraTables: string[]; extraColumns: string[] };
  /** Largest first. */
  tables: TableInfo[];
  connections: Record<string, number>;
  /** Queries running for more than 30 s: state and duration only, never the query text. */
  longRunning: { state: string; seconds: number }[];
  locksWaiting: number;
  migrationLockHeld: boolean;
}

type Row = Record<string, unknown>;
const rows = async <T extends Row>(query: ReturnType<typeof sql>) => (await getDb().execute(query)) as unknown as T[];

interface JournalEntry {
  tag: string;
  when: number;
  hash: string | null;
}

/** Reads the migrations this build ships, the way drizzle's migrator does (hash = SHA-256 of the SQL file). */
export function readJournal(folder = path.resolve(process.cwd(), "drizzle")): JournalEntry[] | null {
  try {
    const journal = JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    return journal.entries.map(({ tag, when }) => {
      let hash: string | null = null;
      try {
        hash = createHash("sha256").update(readFileSync(path.join(folder, `${tag}.sql`), "utf8")).digest("hex");
      } catch {
        // Hash check skipped for this file.
      }
      return { tag, when, hash };
    });
  } catch {
    return null;
  }
}

export function compareMigrations(
  journal: JournalEntry[] | null,
  applied: { hash: string; createdAt: number }[],
): MigrationInfo {
  const byWhen = new Map(applied.map((a) => [a.createdAt, a]));
  const known = new Set((journal ?? []).map((j) => j.when));
  const last = applied.reduce<{ hash: string; createdAt: number } | null>(
    (max, a) => (!max || a.createdAt > max.createdAt ? a : max),
    null,
  );
  const lastTag = last ? (journal?.find((j) => j.when === last.createdAt)?.tag ?? "unknown") : null;
  return {
    bundled: journal ? journal.length : null,
    applied: applied.length,
    pending: (journal ?? []).filter((j) => !byWhen.has(j.when)).map((j) => j.tag),
    unknown: journal ? applied.filter((a) => !known.has(a.createdAt)).length : 0,
    hashMismatch: (journal ?? [])
      .filter((j) => j.hash && byWhen.has(j.when) && byWhen.get(j.when)!.hash !== j.hash)
      .map((j) => j.tag),
    latest: last && lastTag ? { tag: lastTag, appliedAt: new Date(last.createdAt).toISOString() } : null,
  };
}

/** Tables and columns of the Drizzle schema. */
export function expectedSchema(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    if (config.schema && config.schema !== "public") continue;
    tables.set(config.name, new Set(config.columns.map((c) => c.name)));
  }
  return tables;
}

export function compareSchema(expected: Map<string, Set<string>>, actual: Map<string, Set<string>>): DatabaseInfo["drift"] {
  const drift: DatabaseInfo["drift"] = { missingTables: [], missingColumns: [], extraTables: [], extraColumns: [] };
  for (const [table, columns] of expected) {
    const have = actual.get(table);
    if (!have) {
      drift.missingTables.push(table);
      continue;
    }
    for (const c of columns) if (!have.has(c)) drift.missingColumns.push(`${table}.${c}`);
    for (const c of have) if (!columns.has(c)) drift.extraColumns.push(`${table}.${c}`);
  }
  for (const table of actual.keys()) if (!expected.has(table)) drift.extraTables.push(table);
  for (const list of Object.values(drift)) list.sort();
  return drift;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** Exact row counts are worth a little time, never a slow page: past these limits a table gets the estimate. */
const COUNT_TIMEOUT_MS = 2_000;
const COUNT_BUDGET_MS = 10_000;

/** Exact row count, or null when it would exceed `timeoutMs` (statement_timeout, scoped to one transaction). */
async function exactCount(table: string, timeoutMs: number): Promise<number | null> {
  try {
    return await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('statement_timeout', ${String(Math.max(1, Math.round(timeoutMs)))}, true)`);
      const [{ n }] = (await tx.execute(sql`SELECT count(*)::float8 AS n FROM ${sql.identifier(table)}`)) as unknown as { n: number }[];
      return Number(n);
    });
  } catch {
    return null;
  }
}

export async function collectDatabase(): Promise<DatabaseInfo> {
  const started = performance.now();
  await getDb().execute(sql`SELECT 1`);
  const latencyMs = Math.round(performance.now() - started);

  const [version, size, settings, extensions, applied, columns, stats, connections, longRunning, locks] = await Promise.all([
    rows<{ server_version: string }>(sql`SHOW server_version`),
    rows<{ bytes: string }>(sql`SELECT pg_database_size(current_database())::text AS bytes`),
    rows<{ name: string; setting: string; unit: string | null }>(
      sql`SELECT name, setting, unit FROM pg_settings WHERE name IN ${PG_SETTINGS}`,
    ),
    rows<{ extname: string; extversion: string }>(sql`SELECT extname, extversion FROM pg_extension ORDER BY extname`),
    // The table only exists once drizzle migrated.
    rows<{ hash: string; created_at: string }>(
      sql`SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at`,
    ).catch(() => []),
    rows<{ table_name: string; column_name: string }>(
      sql`SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')`,
    ),
    rows<{
      name: string;
      estimate: string;
      total_bytes: string;
      index_bytes: string;
      dead: string;
      last_vacuum: string | null;
      last_analyze: string | null;
    }>(
      sql`SELECT relname AS name, n_live_tup::text AS estimate, pg_total_relation_size(relid)::text AS total_bytes, pg_indexes_size(relid)::text AS index_bytes,
                 n_dead_tup::text AS dead, GREATEST(last_vacuum, last_autovacuum) AS last_vacuum,
                 GREATEST(last_analyze, last_autoanalyze) AS last_analyze
          FROM pg_stat_user_tables WHERE schemaname = 'public'`,
    ),
    rows<{ state: string | null; n: number }>(
      sql`SELECT state, count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`,
    ),
    rows<{ state: string | null; seconds: number }>(
      sql`SELECT state, extract(epoch FROM now() - query_start)::int AS seconds FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
            AND query_start < now() - interval '30 seconds'
          ORDER BY query_start LIMIT 20`,
    ),
    rows<{ waiting: number; migration: number }>(
      sql`SELECT count(*) FILTER (WHERE NOT granted)::int AS waiting,
                 count(*) FILTER (WHERE granted AND locktype = 'advisory' AND classid = 0
                                  AND objid = ${MIGRATION_LOCK_KEY} AND objsubid = 1)::int AS migration
          FROM pg_locks`,
    ),
  ]);

  // Exact row counts (estimates are far off right after imports), smallest tables first, within a time budget.
  const counts = new Map<string, number>();
  const budgetEnd = performance.now() + COUNT_BUDGET_MS;
  for (const t of [...stats].sort((a, b) => Number(a.total_bytes) - Number(b.total_bytes))) {
    const left = budgetEnd - performance.now();
    if (left <= 0) break;
    const n = await exactCount(t.name, Math.min(COUNT_TIMEOUT_MS, left));
    if (n !== null) counts.set(t.name, n);
  }

  const actual = new Map<string, Set<string>>();
  for (const c of columns) {
    if (!actual.has(c.table_name)) actual.set(c.table_name, new Set());
    actual.get(c.table_name)!.add(c.column_name);
  }

  return {
    serverVersion: version[0]?.server_version ?? "unknown",
    latencyMs,
    sizeBytes: Number(size[0]?.bytes ?? 0),
    settings: Object.fromEntries(settings.map((s) => [s.name, s.unit ? `${s.setting} ${s.unit}` : s.setting])),
    extensions: Object.fromEntries(extensions.map((e) => [e.extname, e.extversion])),
    migrations: compareMigrations(
      readJournal(),
      applied.map((a) => ({ hash: a.hash, createdAt: Number(a.created_at) })),
    ),
    drift: compareSchema(expectedSchema(), actual),
    tables: stats
      .map((t) => ({
        name: t.name,
        rows: counts.get(t.name) ?? Math.max(0, Number(t.estimate)),
        rowsEstimated: !counts.has(t.name),
        totalBytes: Number(t.total_bytes),
        indexBytes: Number(t.index_bytes),
        deadTuples: Number(t.dead),
        lastVacuum: iso(t.last_vacuum),
        lastAnalyze: iso(t.last_analyze),
      }))
      .sort((a, b) => b.totalBytes - a.totalBytes || a.name.localeCompare(b.name)),
    connections: Object.fromEntries(connections.map((c) => [c.state ?? "background", c.n])),
    longRunning: longRunning.map((q) => ({ state: q.state ?? "unknown", seconds: q.seconds })),
    locksWaiting: locks[0]?.waiting ?? 0,
    migrationLockHeld: (locks[0]?.migration ?? 0) > 0,
  };
}
