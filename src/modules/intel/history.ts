import { sql, type SQL } from "drizzle-orm";
import { getDb, type Db } from "@/core/db";
import { ENGAGEMENT_GAP_MINUTES, HISTORY_HALF_LIFE_DAYS, MAX_ENGAGEMENTS } from "./constants";
import { weightAt } from "./score/decay";
import type { Engagement, PilotHistory } from "./types";

/**
 * "Have we fought them before, and what did they bring?" — answered from the
 * home corporation's own killboard tables (no zKillboard calls). Coverage is
 * whatever the killboard sync has stored.
 */

/** One killmail where a pasted pilot met the home corporation. */
export interface Encounter {
  characterId: number;
  killmailId: number;
  time: Date;
  systemId: number;
  value: number;
  shipTypeId: number | null;
  /** onUs: the pilot was on one of our losses; byUs: the pilot died to us. */
  kind: "onUs" | "byUs";
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const id = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const list = (ids: number[]): SQL => sql.join(ids.map((i) => sql`${i}`), sql`, `);

export async function encountersWithUs(homeCorporationId: number, characterIds: number[], db: Db = getDb()): Promise<Encounter[]> {
  if (!characterIds.length) return [];
  const H = homeCorporationId;
  const out: Encounter[] = [];
  for (let i = 0; i < characterIds.length; i += 500) {
    const ids = list(characterIds.slice(i, i + 500));
    const [onUs, byUs] = await Promise.all([
      db.execute<Record<string, unknown>>(sql`
        SELECT a.character_id, k.killmail_id, k.killmail_time, k.solar_system_id, k.total_value, a.ship_type_id
        FROM killmail_attackers a JOIN killmails k ON k.killmail_id = a.killmail_id
        WHERE a.character_id IN (${ids}) AND k.victim_corporation_id = ${H}
          AND a.corporation_id IS DISTINCT FROM ${H}`),
      db.execute<Record<string, unknown>>(sql`
        SELECT k.victim_character_id AS character_id, k.killmail_id, k.killmail_time, k.solar_system_id, k.total_value,
          k.victim_ship_type_id AS ship_type_id
        FROM killmails k
        WHERE k.victim_character_id IN (${ids}) AND k.victim_corporation_id IS DISTINCT FROM ${H}
          AND EXISTS (SELECT 1 FROM killmail_attackers a WHERE a.killmail_id = k.killmail_id AND a.corporation_id = ${H})`),
    ]);
    const map = (r: Record<string, unknown>, kind: Encounter["kind"]): Encounter => ({
      characterId: num(r.character_id),
      killmailId: num(r.killmail_id),
      time: new Date(String(r.killmail_time)),
      systemId: num(r.solar_system_id),
      value: num(r.total_value),
      shipTypeId: id(r.ship_type_id),
      kind,
    });
    out.push(...onUs.map((r) => map(r, "onUs")), ...byUs.map((r) => map(r, "byUs")));
  }
  return out;
}

/** Per-pilot totals, newest encounter and hulls flown against us. */
export function summarizeHistory(encounters: Encounter[], now: Date): Map<number, PilotHistory> {
  const out = new Map<number, PilotHistory>();
  const ships = new Map<number, Map<number, { count: number; lastAt: number }>>();
  for (const e of encounters) {
    let h = out.get(e.characterId);
    if (!h) {
      h = { killsOnUs: 0, lossesToUs: 0, iskDestroyedOnUs: 0, iskLostToUs: 0, firstAt: null, lastAt: null, ships: [], weight: 0 };
      out.set(e.characterId, h);
    }
    const w = weightAt(e.time, now, HISTORY_HALF_LIFE_DAYS);
    if (e.kind === "onUs") {
      h.killsOnUs++;
      h.iskDestroyedOnUs += e.value;
      h.weight += w;
    } else {
      h.lossesToUs++;
      h.iskLostToUs += e.value;
      h.weight += 0.4 * w;
    }
    const t = e.time.toISOString();
    if (!h.firstAt || t < h.firstAt) h.firstAt = t;
    if (!h.lastAt || t > h.lastAt) h.lastAt = t;
    if (e.shipTypeId) {
      const byShip = ships.get(e.characterId) ?? new Map();
      ships.set(e.characterId, byShip);
      const s = byShip.get(e.shipTypeId) ?? { count: 0, lastAt: 0 };
      s.count++;
      s.lastAt = Math.max(s.lastAt, e.time.getTime());
      byShip.set(e.shipTypeId, s);
    }
  }
  for (const [characterId, byShip] of ships) {
    out.get(characterId)!.ships = [...byShip.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].lastAt - a[1].lastAt)
      .slice(0, 8)
      .map(([shipTypeId, s]) => ({ shipTypeId, count: s.count, lastAt: new Date(s.lastAt).toISOString() }));
  }
  for (const h of out.values()) h.weight = Math.round(h.weight * 1000) / 1000;
  return out;
}

export interface Cluster {
  systemId: number;
  start: Date;
  end: Date;
  killmailIds: number[];
}

/**
 * Groups killmails into fights: same system, each within `gapMinutes` of the
 * previous one. Newest fight first.
 */
export function clusterEngagements(
  rows: { killmailId: number; time: Date; systemId: number }[],
  gapMinutes: number = ENGAGEMENT_GAP_MINUTES,
): Cluster[] {
  const gap = gapMinutes * 60_000;
  const unique = new Map<number, { killmailId: number; time: Date; systemId: number }>();
  for (const r of rows) unique.set(r.killmailId, r);
  const sorted = [...unique.values()].sort((a, b) => a.systemId - b.systemId || a.time.getTime() - b.time.getTime());
  const clusters: Cluster[] = [];
  let current: Cluster | null = null;
  for (const r of sorted) {
    if (current && current.systemId === r.systemId && r.time.getTime() - current.end.getTime() <= gap) {
      current.end = r.time;
      current.killmailIds.push(r.killmailId);
    } else {
      current = { systemId: r.systemId, start: r.time, end: r.time, killmailIds: [r.killmailId] };
      clusters.push(current);
    }
  }
  return clusters.sort((a, b) => b.end.getTime() - a.end.getTime());
}

export interface FightKillmail {
  killmailId: number;
  time: Date;
  systemId: number;
  victimCharacterId: number | null;
  victimCorporationId: number | null;
  victimAllianceId: number | null;
  victimShipTypeId: number;
  value: number;
}

export interface FightAttacker {
  killmailId: number;
  characterId: number | null;
  corporationId: number | null;
  allianceId: number | null;
  shipTypeId: number | null;
}

/** Who was on their side, what they flew, and how the fight went for us. */
export function summarizeEngagement(
  cluster: Cluster,
  killmails: FightKillmail[],
  attackers: FightAttacker[],
  homeCorporationId: number,
  pasted: Set<number>,
): Engagement | null {
  if (!killmails.length) return null;
  const H = homeCorporationId;
  const ours = (km: FightKillmail) => km.victimCorporationId === H;
  const attackersBy = new Map<number, FightAttacker[]>();
  for (const a of attackers) {
    const l = attackersBy.get(a.killmailId) ?? [];
    l.push(a);
    attackersBy.set(a.killmailId, l);
  }

  const theirs = new Map<
    number,
    { corporationId: number | null; allianceId: number | null; ships: Set<number>; attacker: boolean; victim: boolean }
  >();
  const side = (characterId: number, corporationId: number | null, allianceId: number | null) => {
    let p = theirs.get(characterId);
    if (!p) {
      p = { corporationId, allianceId, ships: new Set(), attacker: false, victim: false };
      theirs.set(characterId, p);
    }
    return p;
  };

  let ourKills = 0;
  let ourLosses = 0;
  let iskKilled = 0;
  let iskLost = 0;
  let top = killmails[0];
  for (const km of killmails) {
    if (km.value > top.value) top = km;
    if (ours(km)) {
      ourLosses++;
      iskLost += km.value;
      for (const a of attackersBy.get(km.killmailId) ?? []) {
        if (!a.characterId || a.corporationId === H) continue;
        const p = side(a.characterId, a.corporationId, a.allianceId);
        p.attacker = true;
        if (a.shipTypeId) p.ships.add(a.shipTypeId);
      }
    } else {
      ourKills++;
      iskKilled += km.value;
      if (km.victimCharacterId) {
        const p = side(km.victimCharacterId, km.victimCorporationId, km.victimAllianceId);
        p.victim = true;
        p.ships.add(km.victimShipTypeId);
      }
    }
  }

  const brought = new Map<number, number>();
  for (const p of theirs.values()) for (const s of p.ships) brought.set(s, (brought.get(s) ?? 0) + 1);

  const pilots: Engagement["pilots"] = [];
  const others = new Map<string, { corporationId: number | null; allianceId: number | null; pilots: number }>();
  for (const [characterId, p] of theirs) {
    if (pasted.has(characterId)) {
      pilots.push({
        characterId,
        role: p.attacker && p.victim ? "both" : p.attacker ? "attacker" : "victim",
        shipTypeIds: [...p.ships],
      });
    } else {
      const key = `${p.allianceId ?? 0}:${p.corporationId ?? 0}`;
      const o = others.get(key) ?? { corporationId: p.corporationId, allianceId: p.allianceId, pilots: 0 };
      o.pilots++;
      others.set(key, o);
    }
  }
  if (!pilots.length) return null;

  const shipRows = { ours: new Map<number, { pilots: Set<string>; lost: number }>(), theirs: new Map<number, { pilots: Set<string>; lost: number }>() };
  const addShip = (team: "ours" | "theirs", type: number, pilot: string, lost: boolean) => {
    const entry = shipRows[team].get(type) ?? { pilots: new Set<string>(), lost: 0 };
    entry.pilots.add(pilot);
    if (lost) entry.lost++;
    shipRows[team].set(type, entry);
  };
  for (const km of killmails) {
    addShip(ours(km) ? "ours" : "theirs", km.victimShipTypeId, String(km.victimCharacterId ?? `victim:${km.killmailId}`), true);
    for (const attacker of attackersBy.get(km.killmailId) ?? []) {
      if (!attacker.characterId || !attacker.shipTypeId) continue;
      if (ours(km) && attacker.corporationId !== H) addShip("theirs", attacker.shipTypeId, String(attacker.characterId), false);
      if (!ours(km) && attacker.corporationId === H) addShip("ours", attacker.shipTypeId, String(attacker.characterId), false);
    }
  }
  const shipsFor = (team: "ours" | "theirs") => [...shipRows[team]].map(([shipTypeId, entry]) => ({ shipTypeId, count: Math.max(entry.pilots.size, entry.lost), lost: entry.lost, pilotIds: [...entry.pilots].map(Number).filter(id => Number.isSafeInteger(id) && id > 0) })).sort((a, b) => b.lost - a.lost || b.count - a.count);
  const times = killmails.map((k) => k.time.getTime());
  return {
    key: `${cluster.systemId}-${Math.min(...times)}`,
    systemId: cluster.systemId,
    start: new Date(Math.min(...times)).toISOString(),
    end: new Date(Math.max(...times)).toISOString(),
    pilots: pilots.sort((a, b) => a.characterId - b.characterId),
    brought: [...brought.entries()].sort((a, b) => b[1] - a[1]).map(([shipTypeId, count]) => ({ shipTypeId, count })),
    others: [...others.values()].sort((a, b) => b.pilots - a.pilots).slice(0, 8),
    ourKills,
    ourLosses,
    iskKilled,
    iskLost,
    topKillmailId: top.killmailId,
    battleAffiliations: [...new Map([
      ...killmails.filter(k => k.victimCharacterId).map(k => [k.victimCharacterId!, { characterId: k.victimCharacterId!, corporationId: k.victimCorporationId, allianceId: k.victimAllianceId }] as const),
      ...attackers.filter(a => a.characterId).map(a => [a.characterId!, { characterId: a.characterId!, corporationId: a.corporationId, allianceId: a.allianceId }] as const),
    ]).values()],
    battle: { ours: shipsFor("ours"), theirs: shipsFor("theirs") },
  };
}

/** The newest fights with any of the pasted pilots, expanded to everything that happened in them. */
export async function engagementsWithUs(
  homeCorporationId: number,
  encounters: Encounter[],
  pastedIds: number[],
  opts: { limit?: number; db?: Db } = {},
): Promise<Engagement[]> {
  const db = opts.db ?? getDb();
  const H = homeCorporationId;
  const clusters = clusterEngagements(encounters).slice(0, opts.limit ?? MAX_ENGAGEMENTS);
  if (!clusters.length) return [];
  const gap = ENGAGEMENT_GAP_MINUTES * 60_000;
  const windows = clusters.map(
    (c) =>
      sql`(k.solar_system_id = ${c.systemId} AND k.killmail_time >= ${new Date(c.start.getTime() - gap).toISOString()}::timestamptz
        AND k.killmail_time <= ${new Date(c.end.getTime() + gap).toISOString()}::timestamptz)`,
  );
  const kmRows = await db.execute<Record<string, unknown>>(sql`
    SELECT k.killmail_id, k.killmail_time, k.solar_system_id, k.victim_character_id, k.victim_corporation_id,
      k.victim_alliance_id, k.victim_ship_type_id, k.total_value
    FROM killmails k
    WHERE (${sql.join(windows, sql` OR `)})
      AND (k.victim_corporation_id = ${H}
        OR EXISTS (SELECT 1 FROM killmail_attackers a WHERE a.killmail_id = k.killmail_id AND a.corporation_id = ${H}))`);
  const killmails: FightKillmail[] = kmRows.map((r) => ({
    killmailId: num(r.killmail_id),
    time: new Date(String(r.killmail_time)),
    systemId: num(r.solar_system_id),
    victimCharacterId: id(r.victim_character_id),
    victimCorporationId: id(r.victim_corporation_id),
    victimAllianceId: id(r.victim_alliance_id),
    victimShipTypeId: num(r.victim_ship_type_id),
    value: num(r.total_value),
  }));
  const attackerRows = killmails.length
    ? await db.execute<Record<string, unknown>>(sql`
        SELECT killmail_id, character_id, corporation_id, alliance_id, ship_type_id
        FROM killmail_attackers WHERE killmail_id IN (${list(killmails.map((k) => k.killmailId))})`)
    : [];
  const attackers: FightAttacker[] = attackerRows.map((r) => ({
    killmailId: num(r.killmail_id),
    characterId: id(r.character_id),
    corporationId: id(r.corporation_id),
    allianceId: id(r.alliance_id),
    shipTypeId: id(r.ship_type_id),
  }));

  // Each killmail belongs to the first (newest) fight whose window contains it.
  const assigned = new Set<number>();
  const pasted = new Set(pastedIds);
  const out: Engagement[] = [];
  for (const c of clusters) {
    const lo = c.start.getTime() - gap;
    const hi = c.end.getTime() + gap;
    const mine = killmails.filter(
      (k) => !assigned.has(k.killmailId) && k.systemId === c.systemId && k.time.getTime() >= lo && k.time.getTime() <= hi,
    );
    mine.forEach((k) => assigned.add(k.killmailId));
    const ids = new Set(mine.map((k) => k.killmailId));
    const e = summarizeEngagement(c, mine, attackers.filter((a) => ids.has(a.killmailId)), H, pasted);
    if (e) out.push(e);
  }
  return out;
}

/** "Fought 4 of these 23 pilots in 3 engagements …" numbers for the group view. */
export function historyTotals(histories: (PilotHistory | null | undefined)[], engagements: Engagement[]) {
  const fought = histories.filter((h): h is PilotHistory => !!h && h.killsOnUs + h.lossesToUs > 0);
  return {
    pilots: fought.length,
    engagements: engagements.length,
    ourKills: engagements.reduce((s, e) => s + e.ourKills, 0),
    ourLosses: engagements.reduce((s, e) => s + e.ourLosses, 0),
    iskKilled: engagements.reduce((s, e) => s + e.iskKilled, 0),
    iskLost: engagements.reduce((s, e) => s + e.iskLost, 0),
    last: engagements[0] ?? null,
  };
}
