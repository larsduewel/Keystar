import { eq, inArray } from "drizzle-orm";
import { eveCorporations, eveEntities, eveSystems, eveTypes, getDb, intelScans } from "@/core/db";
import { ensureNames, ensureTypes } from "@/core/eve/resolver";
import { env } from "@/core/env";
import { createLogger, errorMessage } from "@/core/logger";
import { nameAffiliations } from "./resolve";
import type { Engagement, PilotHistory } from "./types";

/** Display names for the ids a scan page shows; unknown ids are simply missing. */
export interface DisplayNames {
  types: Map<number, { name: string; groupId: number }>;
  systems: Map<number, { name: string; securityStatus: number }>;
  entities: Map<number, string>;
  tickers: Map<number, string>;
}

const log = createLogger("intel-names");
const uniq = (ids: Iterable<number | null | undefined>) => [...new Set([...ids].filter((n): n is number => !!n && n > 0))];

export async function lookupDisplayNames(ids: {
  typeIds?: Iterable<number | null | undefined>;
  systemIds?: Iterable<number | null | undefined>;
  entityIds?: Iterable<number | null | undefined>;
  corporationIds?: Iterable<number | null | undefined>;
}): Promise<DisplayNames> {
  const db = getDb();
  const typeIds = uniq(ids.typeIds ?? []);
  const systemIds = uniq(ids.systemIds ?? []);
  const entityIds = uniq(ids.entityIds ?? []);
  const corpIds = uniq(ids.corporationIds ?? []);
  const [types, systems, entities, corps] = await Promise.all([
    typeIds.length
      ? db.select({ id: eveTypes.typeId, name: eveTypes.name, groupId: eveTypes.groupId }).from(eveTypes).where(inArray(eveTypes.typeId, typeIds))
      : [],
    systemIds.length
      ? db
          .select({ id: eveSystems.systemId, name: eveSystems.name, securityStatus: eveSystems.securityStatus })
          .from(eveSystems)
          .where(inArray(eveSystems.systemId, systemIds))
      : [],
    entityIds.length ? db.select({ id: eveEntities.id, name: eveEntities.name }).from(eveEntities).where(inArray(eveEntities.id, entityIds)) : [],
    corpIds.length
      ? db
          .select({ id: eveCorporations.corporationId, name: eveCorporations.name, ticker: eveCorporations.ticker })
          .from(eveCorporations)
          .where(inArray(eveCorporations.corporationId, corpIds))
      : [],
  ]);
  const entityNames = new Map(entities.map((e) => [e.id, e.name]));
  for (const c of corps) entityNames.set(c.id, c.name);
  return {
    types: new Map(types.map((t) => [t.id, { name: t.name, groupId: t.groupId }])),
    systems: new Map(systems.map((s) => [s.id, { name: s.name, securityStatus: s.securityStatus }])),
    entities: entityNames,
    tickers: new Map(corps.map((c) => [c.id, c.ticker])),
  };
}

/** Ids a scan shows that may not be named yet: hulls flown against us and the corporations/alliances in fights. */
export function scanEntityIds(histories: (PilotHistory | null)[], engagements: Engagement[]) {
  const typeIds = new Set<number>();
  const entityIds = new Set<number>();
  const corporationIds = new Set<number>();
  for (const h of histories) for (const s of h?.ships ?? []) typeIds.add(s.shipTypeId);
  for (const e of engagements) {
    for (const p of e.battleAffiliations ?? []) {
      if (p.corporationId) corporationIds.add(p.corporationId);
      if (p.allianceId) entityIds.add(p.allianceId);
    }
    for (const b of e.brought) typeIds.add(b.shipTypeId);
    for (const ship of [...(e.battle?.ours ?? []), ...(e.battle?.theirs ?? [])]) { typeIds.add(ship.shipTypeId); for (const id of ship.pilotIds ?? []) entityIds.add(id); }
    for (const p of e.pilots) p.shipTypeIds.forEach((t) => typeIds.add(t));
    for (const o of e.others) {
      if (o.corporationId) corporationIds.add(o.corporationId);
      if (o.allianceId) entityIds.add(o.allianceId);
    }
  }
  return { typeIds: [...typeIds], entityIds: [...entityIds], corporationIds: [...corporationIds] };
}

export interface NamingWork {
  typeIds: number[];
  entityIds: number[];
  corporationIds: number[];
  pilotAffiliations: { corporationId: number | null; allianceId: number | null }[];
}

/**
 * Names what a new scan shows. Runs after the response (Next `after`), so
 * pasting stays fast; open pages pick the names up on their next refresh.
 */
export async function nameScanEntities(scanId: string, work: NamingWork): Promise<void> {
  if (env().KEYSTAR_DEMO_MODE) return;
  try {
    await ensureTypes(work.typeIds);
    await ensureNames(work.entityIds);
    await nameAffiliations(
      [...work.pilotAffiliations, ...work.corporationIds.map((corporationId) => ({ corporationId, allianceId: null }))],
      200,
    );
    await getDb().update(intelScans).set({ updatedAt: new Date() }).where(eq(intelScans.id, scanId));
  } catch (err) {
    log.warn("Could not name scan entities", { scanId, error: errorMessage(err) });
  }
}
