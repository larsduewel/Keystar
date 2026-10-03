import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  eveCorporations,
  eveEntities,
  getDb,
  intelPilots,
  intelScanPilots,
  intelScans,
  type Db,
} from "@/core/db";
import { getSetting } from "@/core/settings";
import type { Locale } from "@/i18n/config";
import { triggerJobs } from "@/core/sync/scheduler";
import { shareId } from "@/lib/share-id";
import { MAX_INPUT_CHARS, MAX_PILOTS, MAX_PROFILED, SCAN_RATE_LIMIT, SCAN_RATE_WINDOW_MS } from "./constants";
import { encountersWithUs, engagementsWithUs, summarizeHistory } from "./history";
import { scanEntityIds, type NamingWork } from "./names";
import { parsePilotList } from "./parse";
import { priorPriority } from "./priority";
import { enqueuePilots } from "./queue";
import { refreshAffiliations, resolvePilotNames, resolveSystem } from "./resolve";
import { isFriendly, loadStandings, standingOf } from "./standings";
import type { DscanEntry, Engagement, PilotHistory } from "./types";

export const SCAN_WORKER_JOB = "intel.scan-worker";
export const BRIEFING_JOB = "intel.briefings";

export interface StartScanInput {
  text: string;
  systemName?: string;
  dscan?: DscanEntry[] | null;
  userId: string;
  userName: string | null;
  aiAllowed: boolean;
  /** The creator's language (for the automatic briefing). */
  locale?: Locale;
}

/** Why a paste was refused; the action writes it out in the user's language (t.intel.errors). */
export type ScanError =
  | { code: "tooLong"; max: number }
  | { code: "dscanInPilots" }
  | { code: "noNames" }
  | { code: "tooMany"; found: number; max: number }
  | { code: "rateLimited" }
  | { code: "unknownSystem"; name: string }
  | { code: "noCharacters" };

/** `naming`: ids the new scan shows that may still need names (see nameScanEntities). */
export type StartScanResult = { ok: true; id: string; naming: NamingWork } | { ok: false; error: ScanError };

/**
 * Creates a scan from a paste: resolves names, affiliations and history with
 * us right away, then queues zKillboard work for the worker.
 */
export async function startScan(input: StartScanInput, deps: { now?: Date; db?: Db } = {}): Promise<StartScanResult> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  if (input.text.length > MAX_INPUT_CHARS) return { ok: false, error: { code: "tooLong", max: MAX_INPUT_CHARS } };

  const parsed = parsePilotList(input.text);
  if (!parsed.names.length) {
    return { ok: false, error: { code: parsed.dscanLines ? "dscanInPilots" : "noNames" } };
  }
  if (parsed.names.length > MAX_PILOTS) {
    return { ok: false, error: { code: "tooMany", found: parsed.names.length, max: MAX_PILOTS } };
  }

  const [recent] = await db
    .select({ n: count() })
    .from(intelScans)
    .where(and(eq(intelScans.createdBy, input.userId), gt(intelScans.createdAt, new Date(now.getTime() - SCAN_RATE_WINDOW_MS))));
  if ((recent?.n ?? 0) >= SCAN_RATE_LIMIT) {
    return { ok: false, error: { code: "rateLimited" } };
  }

  let systemId: number | null = null;
  if (input.systemName?.trim()) {
    const system = await resolveSystem(input.systemName);
    if (!system) return { ok: false, error: { code: "unknownSystem", name: input.systemName.trim() } };
    systemId = system.systemId;
  }

  const { found, unresolved } = await resolvePilotNames(parsed.names);
  if (!found.length) return { ok: false, error: { code: "noCharacters" } };
  const affiliations = await refreshAffiliations(found);
  const standings = await loadStandings();
  const home = await getSetting("corp.homeCorporationId");
  let histories = new Map<number, PilotHistory>();
  let engagements: Engagement[] = [];
  if (home) {
    const ids = found.map((p) => p.characterId);
    const encounters = await encountersWithUs(home, ids, db);
    histories = summarizeHistory(encounters, now);
    engagements = await engagementsWithUs(home, encounters, ids, { db });
  }

  const pilots = found.map((p, position) => {
    const a = affiliations.get(p.characterId);
    const affiliated = {
      characterId: p.characterId,
      corporationId: a?.corporationId ?? null,
      allianceId: a?.allianceId ?? null,
      factionId: a?.factionId ?? null,
    };
    const standing = standingOf(affiliated, standings);
    const history = histories.get(p.characterId) ?? null;
    return {
      ...affiliated,
      name: p.name,
      position,
      history,
      friendly: isFriendly(standing),
      priority: priorPriority({ standing, history, corporationId: affiliated.corporationId, allianceId: affiliated.allianceId, now }),
    };
  });

  // Profile the most interesting non-friendly pilots; the rest can be profiled on request.
  const profiled = new Set(
    pilots
      .filter((p) => !p.friendly)
      .sort((a, b) => b.priority - a.priority || a.position - b.position)
      .slice(0, MAX_PROFILED)
      .map((p) => p.characterId),
  );

  const id = shareId();
  await db.transaction(async (tx) => {
    await tx.insert(intelScans).values({
      id,
      createdBy: input.userId,
      createdByName: input.userName,
      createdAt: now,
      updatedAt: now,
      names: parsed.names,
      unresolved,
      dscan: input.dscan ?? null,
      dscanAt: input.dscan ? now : null,
      systemId,
      pilotCount: pilots.length,
      aiAllowed: input.aiAllowed,
      locale: input.locale ?? "en",
      // Nothing to wait for when no pilot gets profiled.
      status: profiled.size ? "running" : "ready",
      readyAt: profiled.size ? null : now,
      briefingStatus: profiled.size ? "pending" : "skipped",
    });
    for (let i = 0; i < pilots.length; i += 500) {
      await tx.insert(intelScanPilots).values(
        pilots.slice(i, i + 500).map((p) => ({
          scanId: id,
          characterId: p.characterId,
          position: p.position,
          name: p.name,
          corporationId: p.corporationId,
          allianceId: p.allianceId,
          factionId: p.factionId,
          profiled: profiled.has(p.characterId),
          history: p.history,
        })),
      );
    }
    await enqueuePilots(
      pilots.filter((p) => profiled.has(p.characterId)).map((p) => ({ characterId: p.characterId, priority: p.priority })),
      tx,
    );
  });
  if (profiled.size) await triggerJobs({ jobKey: SCAN_WORKER_JOB }).catch(() => []);
  const naming = scanEntityIds(pilots.map((p) => p.history), engagements);
  return {
    ok: true,
    id,
    naming: { ...naming, pilotAffiliations: pilots.map((p) => ({ corporationId: p.corporationId, allianceId: p.allianceId })) },
  };
}

/**
 * Queues pilots of a scan that were not profiled automatically (friendlies,
 * very large lists). The briefing is written again once they are read if any
 * of them is not friendly.
 */
export async function profileRemaining(scanId: string, db: Db = getDb()): Promise<number> {
  const rows = await db
    .select({
      characterId: intelScanPilots.characterId,
      corporationId: intelScanPilots.corporationId,
      allianceId: intelScanPilots.allianceId,
      factionId: intelScanPilots.factionId,
    })
    .from(intelScanPilots)
    .where(and(eq(intelScanPilots.scanId, scanId), eq(intelScanPilots.profiled, false)));
  if (!rows.length) return 0;
  const standings = await loadStandings();
  const rebrief = rows.some((r) => !isFriendly(standingOf(r, standings)));
  await db.transaction(async (tx) => {
    await tx
      .update(intelScanPilots)
      .set({ profiled: true })
      .where(and(eq(intelScanPilots.scanId, scanId), eq(intelScanPilots.profiled, false)));
    await tx
      .update(intelScans)
      .set({ status: "running", readyAt: null, updatedAt: new Date(), ...(rebrief ? { briefingStatus: "pending" as const } : {}) })
      .where(eq(intelScans.id, scanId));
    await enqueuePilots(
      rows.map((r) => ({ characterId: r.characterId, priority: 0 })),
      tx,
    );
  });
  await triggerJobs({ jobKey: SCAN_WORKER_JOB }).catch(() => []);
  return rows.length;
}

export type ScanRow = typeof intelScans.$inferSelect;

export async function getScan(id: string, db: Db = getDb()): Promise<ScanRow | null> {
  const [row] = await db.select().from(intelScans).where(eq(intelScans.id, id));
  return row ?? null;
}

const allianceNames = alias(eveEntities, "alliance_names");

/** Pilots of a scan (or one of them) with their cached profile and corporation/alliance names, best score first. */
export async function getScanPilots(scanId: string, opts: { characterId?: number; db?: Db } = {}) {
  const db = opts.db ?? getDb();
  return db
    .select({
      characterId: intelScanPilots.characterId,
      position: intelScanPilots.position,
      name: intelScanPilots.name,
      corporationId: intelScanPilots.corporationId,
      allianceId: intelScanPilots.allianceId,
      factionId: intelScanPilots.factionId,
      profiled: intelScanPilots.profiled,
      history: intelScanPilots.history,
      score: intelScanPilots.score,
      tier: intelScanPilots.tier,
      scoreDetail: intelScanPilots.scoreDetail,
      corporationName: eveCorporations.name,
      corporationTicker: eveCorporations.ticker,
      allianceName: allianceNames.name,
      statsStatus: intelPilots.statsStatus,
      statsAt: intelPilots.statsAt,
      deepStatus: intelPilots.deepStatus,
      deepAt: intelPilots.deepAt,
      profile: intelPilots.profile,
      birthday: intelPilots.birthday,
      securityStatus: intelPilots.securityStatus,
      corpHistory: intelPilots.corpHistory,
      stats: intelPilots.stats,
    })
    .from(intelScanPilots)
    .leftJoin(intelPilots, eq(intelPilots.characterId, intelScanPilots.characterId))
    .leftJoin(eveCorporations, eq(eveCorporations.corporationId, intelScanPilots.corporationId))
    .leftJoin(allianceNames, eq(allianceNames.id, intelScanPilots.allianceId))
    .where(
      opts.characterId === undefined
        ? eq(intelScanPilots.scanId, scanId)
        : and(eq(intelScanPilots.scanId, scanId), eq(intelScanPilots.characterId, opts.characterId)),
    )
    .orderBy(sql`${intelScanPilots.score} DESC NULLS LAST`, asc(intelScanPilots.position));
}

export type ScanPilot = Awaited<ReturnType<typeof getScanPilots>>[number];

/** The user's latest scans for the start page. */
export async function getRecentScans(userId: string, limit = 10, db: Db = getDb()) {
  return db
    .select({
      id: intelScans.id,
      createdAt: intelScans.createdAt,
      names: intelScans.names,
      pilotCount: intelScans.pilotCount,
      systemId: intelScans.systemId,
      status: intelScans.status,
    })
    .from(intelScans)
    .where(eq(intelScans.createdBy, userId))
    .orderBy(desc(intelScans.createdAt))
    .limit(limit);
}

export interface ScanProgress {
  status: ScanRow["status"];
  version: string;
  /** Profiled pilots still waiting for statistics, their newest killmails, or older pages. */
  pending: { stats: number; newest: number; deeper: number };
  browserStats?: number[];
  pendingPilots: number[];
}

export async function scanProgress(scan: ScanRow, db: Db = getDb()): Promise<ScanProgress> {
  const rows = await db.execute<{ stage: number; n: number }>(sql`
    SELECT q.stage, count(*)::int AS n FROM intel_queue q
    JOIN intel_scan_pilots sp ON sp.character_id = q.character_id
    WHERE sp.scan_id = ${scan.id} AND sp.profiled
    GROUP BY q.stage`);
  const by = new Map(rows.map((r) => [Number(r.stage), Number(r.n)]));
  const pendingRows = await db.execute<{ character_id: number }>(sql`
    SELECT q.character_id FROM intel_queue q
    JOIN intel_scan_pilots sp ON sp.character_id = q.character_id
    WHERE sp.scan_id = ${scan.id} AND sp.profiled`);
  return {
    pendingPilots: pendingRows.map(r => Number(r.character_id)),
    status: scan.status,
    version: scan.updatedAt.toISOString(),
    pending: { stats: by.get(1) ?? 0, newest: by.get(2) ?? 0, deeper: (by.get(3) ?? 0) + (by.get(4) ?? 0) },
  };
}

export interface Sighting {
  characterId: number;
  name: string;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
  score: number | null;
  tier: string | null;
  scanId: string;
  seenAt: Date;
  systemId: number | null;
  seenBy: string | null;
  times: number;
  fought: boolean;
}

/** Each pilot's latest sighting in anyone's scan over the last `days`, newest first. */
export async function recentSightings(days: number, limit = 400, db: Db = getDb()): Promise<Sighting[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT * FROM (
      SELECT DISTINCT ON (sp.character_id)
        sp.character_id, sp.name, sp.corporation_id, sp.alliance_id, sp.faction_id, sp.score, sp.tier,
        (sp.history->>'killsOnUs')::int > 0 OR (sp.history->>'lossesToUs')::int > 0 AS fought,
        s.id AS scan_id, s.created_at, s.system_id, s.created_by_name,
        count(*) OVER (PARTITION BY sp.character_id) AS times
      FROM intel_scan_pilots sp JOIN intel_scans s ON s.id = sp.scan_id
      WHERE s.created_at > now() - make_interval(days => ${days})
      ORDER BY sp.character_id, s.created_at DESC
    ) latest
    ORDER BY created_at DESC
    LIMIT ${limit}`);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return rows.map((r) => ({
    characterId: Number(r.character_id),
    name: String(r.name),
    corporationId: n(r.corporation_id),
    allianceId: n(r.alliance_id),
    factionId: n(r.faction_id),
    score: n(r.score),
    tier: r.tier === null ? null : String(r.tier),
    scanId: String(r.scan_id),
    seenAt: new Date(String(r.created_at)),
    systemId: n(r.system_id),
    seenBy: r.created_by_name === null ? null : String(r.created_by_name),
    times: Number(r.times),
    fought: r.fought === true,
  }));
}
