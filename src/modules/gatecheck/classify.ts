import type { ZkillKillmail } from "@/modules/killboard/zkill";
import { CONCORD_CORPORATION_ID, CONCORD_FACTION_ID, GATE_RADIUS_METRES, MAX_ATTACKERS } from "./constants";
import type { GatecheckKillInsert } from "./schema";
import type { Gate } from "./universe";

const id = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : 0);
const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The nearest stargate to a position and its distance in metres. */
export function nearestGate(gates: readonly Gate[], p: { x: number; y: number; z: number }): { gate: Gate; distance: number } | null {
  let best: { gate: Gate; distance: number } | null = null;
  for (const gate of gates) {
    const distance = Math.hypot(p.x - gate.x, p.y - gate.y, p.z - gate.z);
    if (!best || distance < best.distance) best = { gate, distance };
  }
  return best;
}

/**
 * Where a kill happened, relative to the system's stargates: the gate within
 * GATE_RADIUS_METRES of the victim's position, or (for the rare killmail
 * without a position) the stargate zKillboard located it at.
 */
export function locateKill(km: ZkillKillmail, gates: readonly Gate[]): { gateId: number | null; distance: number | null } {
  const p = km.victim.position;
  if (p && [p.x, p.y, p.z].every(Number.isFinite)) {
    const nearest = nearestGate(gates, p);
    return nearest && nearest.distance <= GATE_RADIUS_METRES
      ? { gateId: nearest.gate.id, distance: nearest.distance }
      : { gateId: null, distance: null };
  }
  const located = gates.find((g) => g.id === km.zkb.locationID);
  return { gateId: located?.id ?? null, distance: null };
}

/**
 * The row stored for a killmail in a system with stargates; null for
 * wormholes, Abyssal pockets and other systems without gates. Player
 * attackers are kept by damage done, final blow first on ties.
 */
export function toGateKill(km: ZkillKillmail, gates: readonly Gate[] | undefined): GatecheckKillInsert | null {
  if (!gates?.length) return null;
  const time = new Date(km.killmail_time);
  if (!Number.isFinite(time.getTime())) return null;
  const { gateId, distance } = locateKill(km, gates);
  const players = km.attackers
    .filter((a) => id(a.character_id))
    .sort((a, b) => finite(b.damage_done) - finite(a.damage_done) || Number(b.final_blow) - Number(a.final_blow))
    .slice(0, MAX_ATTACKERS);
  return {
    killmailId: km.killmail_id,
    hash: km.zkb.hash,
    killmailTime: time,
    solarSystemId: km.solar_system_id,
    gateId,
    gateDistanceM: distance,
    victimCharacterId: id(km.victim.character_id) || null,
    victimCorporationId: id(km.victim.corporation_id) || null,
    victimAllianceId: id(km.victim.alliance_id) || null,
    victimShipTypeId: km.victim.ship_type_id,
    totalValue: finite(km.zkb.totalValue),
    attackerCount: Math.min(km.attackers.length, 32_767),
    attackerCharacterIds: players.map((a) => id(a.character_id)),
    attackerCorporationIds: players.map((a) => id(a.corporation_id)),
    attackerAllianceIds: players.map((a) => id(a.alliance_id)),
    attackerShipTypeIds: players.map((a) => id(a.ship_type_id)),
    attackerWeaponTypeIds: players.map((a) => id(a.weapon_type_id)),
    npc: km.zkb.npc === true,
    concord: km.attackers.some((a) => a.faction_id === CONCORD_FACTION_ID || a.corporation_id === CONCORD_CORPORATION_ID),
  };
}
