import { getDb, eveSystems, eveConstellations } from "@/core/db";
import { eq, inArray } from "drizzle-orm";
import { systemContext } from "./resolve";
import { scorePilot } from "./score/composite";
import { env } from "@/core/env";
import { ensureNames } from "@/core/eve/resolver";
import { getSetting } from "@/core/settings";
import { encountersWithUs, engagementsWithUs, historyTotals } from "./history";
import { lookupDisplayNames, scanEntityIds } from "./names";
import { getScanPilots, type ScanRow } from "./scans";
import { groupSummary } from "./score/summary";
import { loadStandings, standingOf } from "./standings";
import type { PilotProfile } from "./types";

/**
 * Everything a scan shows, loaded once: pilots with standings, profiles and
 * scores, fights with us, the group summary and display names. Used by the
 * scan page and by the briefing writer, so both see the same facts.
 */
export async function loadScanView(scan: ScanRow) {
  const [pilots, standings, home] = await Promise.all([getScanPilots(scan.id), loadStandings(), getSetting("corp.homeCorporationId")]);
  const ids = pilots.map((p) => p.characterId);
  const engagements = home ? await engagementsWithUs(home, await encountersWithUs(home, ids), ids) : [];
  const system = await systemContext(scan.systemId);
  const systemIds = [...new Set(pilots.flatMap(p => (p.profile as PilotProfile | null)?.recent.latest.map(e => e.systemId) ?? []))];
  const nearby = systemIds.length ? await getDb().select({ systemId: eveSystems.systemId, constellationId: eveSystems.constellationId, regionId: eveConstellations.regionId }).from(eveSystems).leftJoin(eveConstellations, eq(eveConstellations.constellationId, eveSystems.constellationId)).where(inArray(eveSystems.systemId, systemIds)) : [];
  const systemsInfo = new Map(nearby.map(s => [s.systemId, s]));
  const rows = pilots.map((p) => ({
    pilot: p,
    standing: standingOf(p, standings),
    profile: (p.profile as PilotProfile | null) ?? null,
    score: scorePilot((p.profile as PilotProfile | null) ?? null, { now: new Date(), standing: standingOf(p, standings), history: p.history, historyAvailable: !!home, system, systemsInfo }),
  }));
  for (const row of rows) { row.pilot.scoreDetail = row.score; row.pilot.score = row.score.tier === "unknown" ? null : row.score.composite; row.pilot.tier = row.score.tier; }
  const entityIds = scanEntityIds(
    pilots.map((p) => p.history),
    engagements,
  );
  if (!env().KEYSTAR_DEMO_MODE) await ensureNames(entityIds.entityIds);
  const names = await lookupDisplayNames({
    typeIds: [
      ...entityIds.typeIds,
      ...rows.flatMap((r) => [
        ...(r.profile?.hulls.slice(0, 5).map((h) => h.shipTypeId) ?? []),
        ...(r.profile?.recent.latest.flatMap((e) => [e.shipTypeId, e.otherShipTypeId]) ?? []),
      ]),
    ],
    systemIds: [
      scan.systemId,
      ...engagements.map((e) => e.systemId),
      ...rows.flatMap((r) => [...(r.profile?.recent.latest.map((e) => e.systemId) ?? []), r.profile?.recent.lastSeen?.systemId]),
    ],
    entityIds: [...entityIds.entityIds, ...pilots.map((p) => p.allianceId)],
    corporationIds: [...entityIds.corporationIds, ...pilots.map((p) => p.corporationId)],
  });
  const summary = groupSummary(
    rows.map((r) => ({
      characterId: r.pilot.characterId,
      corporationId: r.pilot.corporationId,
      allianceId: r.pilot.allianceId,
      standing: r.standing,
      score: r.score,
      profile: r.profile,
    })),
    scan.createdAt,
  );
  return {
    home,
    pilots,
    rows,
    engagements,
    names,
    summary,
    totals: historyTotals(
      pilots.map((p) => p.history),
      engagements,
    ),
    pilotNames: new Map(pilots.map((p) => [p.characterId, p.name])),
    system: scan.systemId ? (names.systems.get(scan.systemId) ?? null) : null,
  };
}

export type ScanView = Awaited<ReturnType<typeof loadScanView>>;
