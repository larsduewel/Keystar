import { eveEntities, eveGroups, eveTypes, gatecheckFeed, gatecheckKills, type Db } from "@/core/db";
import { gateKillRows } from "@/modules/gatecheck/ingest";
import { getUniverse } from "@/modules/gatecheck/universe-data";
import type { ZkillAttacker, ZkillKillmail } from "@/modules/killboard/zkill";
import { hostilePilots } from "./killboard";

/**
 * Demo gate check: a month of camps at well-known gates (smartbombs in
 * Rancer, Sabres in Tama and Amamake, Catalyst ganks in Uedama, bubbles at
 * the EC-P8R gate), with the same regulars on most evenings, a live camp right
 * now and a regular seen next door. Stored through the same classification as
 * live feed data. Deterministic for a given PRNG.
 */
const DAY = 86_400_000;

const GROUPS = [
  { groupId: 27, name: "Battleship", categoryId: 6 },
  { groupId: 29, name: "Capsule", categoryId: 6 },
  { groupId: 72, name: "Smart Bomb", categoryId: 7 },
  { groupId: 324, name: "Assault Frigate", categoryId: 6 },
  { groupId: 420, name: "Destroyer", categoryId: 6 },
  { groupId: 541, name: "Interdictor", categoryId: 6 },
  { groupId: 894, name: "Heavy Interdiction Cruiser", categoryId: 6 },
  { groupId: 963, name: "Strategic Cruiser", categoryId: 6 },
];

// Type ids checked against ESI /universe/types.
const T = {
  sabre: 22456,
  onyx: 11995,
  catalyst: 16240,
  thrasher: 16242,
  loki: 29990,
  jaguar: 11400,
  machariel: 17738,
  smartbomb: 3955,
  capsule: 670,
};
const TYPES = [
  { typeId: T.sabre, name: "Sabre", groupId: 541 },
  { typeId: T.onyx, name: "Onyx", groupId: 894 },
  { typeId: T.catalyst, name: "Catalyst", groupId: 420 },
  { typeId: T.thrasher, name: "Thrasher", groupId: 420 },
  { typeId: T.loki, name: "Loki", groupId: 963 },
  { typeId: T.jaguar, name: "Jaguar", groupId: 324 },
  { typeId: T.machariel, name: "Machariel", groupId: 27 },
  { typeId: T.smartbomb, name: "Medium EMP Smartbomb II", groupId: 72 },
  { typeId: T.capsule, name: "Capsule", groupId: 29 },
];
/** Victims: ships the killboard demo already names (Viator, Drake, Retriever, Raven, Ishkur). */
const VICTIM_SHIPS = [12743, 24698, 17478, 638, 12042];
const VICTIM_CORPS = [
  { id: 98_600_101, name: "Blue Lantern Transport" },
  { id: 98_600_202, name: "Quiet Star Exploration" },
  { id: 98_600_303, name: "Meridian Freight Lines" },
];
const CONCORD = { faction_id: 500_006, corporation_id: 1_000_125 };

interface Camp {
  system: string;
  /** Destination systems of the gates the camp sits on. */
  gates: string[];
  /** EVE hours the camp is usually up. */
  hours: [number, number];
  /** Chance of a camp on a given day. */
  daily: number;
  crew: number[];
  ships: number[];
  smartbombs?: boolean;
  gank?: boolean;
}

export async function seedGatecheck(db: Db, opts: { rand: () => number; now: Date }): Promise<{ kills: number }> {
  const { rand, now } = opts;
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const u = getUniverse();
  const id = (name: string) => u.byName.get(name.toLowerCase());

  await db.insert(eveGroups).values(GROUPS).onConflictDoNothing();
  await db
    .insert(eveTypes)
    .values(TYPES.map((t) => ({ ...t, volume: 0, portionSize: 1, published: true })))
    .onConflictDoNothing();
  await db
    .insert(eveEntities)
    .values(
      VICTIM_CORPS.map((c) => ({
        id: c.id,
        name: c.name,
        category: "corporation",
      })),
    )
    .onConflictDoNothing();

  const pilots = hostilePilots();
  const camps: Camp[] = [
    {
      system: "Rancer",
      gates: ["Crielere", "Miroitem"],
      hours: [17, 22],
      daily: 0.7,
      crew: [0, 1, 2],
      ships: [T.machariel, T.loki],
      smartbombs: true,
    },
    {
      system: "Tama",
      gates: ["Nourvukaiken", "Sujarento"],
      hours: [18, 23],
      daily: 0.6,
      crew: [3, 4, 5, 6],
      ships: [T.sabre, T.loki, T.jaguar],
    },
    {
      system: "Amamake",
      gates: ["Osoggur", "Vard"],
      hours: [12, 16],
      daily: 0.45,
      crew: [7, 8],
      ships: [T.thrasher, T.jaguar],
    },
    {
      system: "Uedama",
      gates: ["Sivala", "Haatomo"],
      hours: [19, 22],
      daily: 0.35,
      crew: [9, 10, 11, 12],
      ships: [T.catalyst],
      gank: true,
    },
    {
      system: "EC-P8R",
      gates: ["Torrinos"],
      hours: [0, 4],
      daily: 0.3,
      crew: [13, 14],
      ships: [T.onyx, T.sabre, T.loki],
    },
  ];

  const entries: ZkillKillmail[] = [];
  let killmailId = 150_000_000;
  const hash = () => Array.from({ length: 40 }, () => Math.floor(rand() * 16).toString(16)).join("");
  const kill = (systemId: number, gateTo: number, time: Date, crew: number[], camp: Camp, victimShip?: number) => {
    const gate = u.gates.get(systemId)?.find((g) => g.destinationId === gateTo);
    if (!gate || time > now) return;
    const corp = pick(VICTIM_CORPS);
    const attackers: ZkillAttacker[] = crew.map((c, i) => {
      const p = pilots[c % pilots.length];
      const ship = camp.smartbombs && i === 0 ? T.machariel : pick(camp.ships);
      return {
        character_id: p.characterId,
        corporation_id: p.corporationId,
        ship_type_id: ship,
        weapon_type_id: camp.smartbombs && ship === T.machariel ? T.smartbomb : ship,
        damage_done: Math.round(500 + rand() * 3000),
        final_blow: i === 0,
      };
    });
    const ship = victimShip ?? pick(VICTIM_SHIPS);
    const offset = () => (rand() - 0.5) * 40_000;
    entries.push({
      killmail_id: killmailId++,
      killmail_time: time.toISOString(),
      solar_system_id: systemId,
      victim: {
        corporation_id: corp.id,
        ship_type_id: ship,
        damage_taken: 3000,
        position: {
          x: gate.x + offset(),
          y: gate.y + offset(),
          z: gate.z + offset(),
        },
      },
      attackers,
      zkb: {
        hash: hash(),
        locationID: gate.id,
        totalValue: ship === T.capsule ? 10_000 : 20e6 + rand() * 300e6,
        npc: false,
      },
    });
    // Gankers get CONCORDed: their own loss, NPCs only, CONCORD on the mail.
    if (camp.gank) {
      for (const a of attackers.slice(0, 2)) {
        entries.push({
          killmail_id: killmailId++,
          killmail_time: new Date(time.getTime() + 15_000).toISOString(),
          solar_system_id: systemId,
          victim: {
            character_id: a.character_id,
            corporation_id: a.corporation_id,
            ship_type_id: T.catalyst,
            damage_taken: 2000,
            position: { x: gate.x, y: gate.y, z: gate.z },
          },
          attackers: [
            {
              ...CONCORD,
              ship_type_id: 0,
              damage_done: 2000,
              final_blow: true,
            },
          ],
          zkb: {
            hash: hash(),
            locationID: gate.id,
            totalValue: 2e6,
            npc: true,
          },
        });
      }
    }
  };

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const camp of camps) {
    const systemId = id(camp.system);
    if (systemId === undefined) continue;
    const gates = camp.gates.map(id).filter((g): g is number => g !== undefined);
    if (!gates.length) continue;
    for (let d = 30; d >= 1; d--) {
      if (rand() > camp.daily) continue;
      const [from, to] = camp.hours;
      const start = today - d * DAY + (from + rand() * Math.max(1, to - from - 1)) * 3600_000;
      const crew = camp.crew.filter(() => rand() < 0.8);
      if (!crew.length) crew.push(camp.crew[0]);
      const kills = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < kills; k++) {
        const time = new Date(start + k * (5 + rand() * 25) * 60_000);
        kill(systemId, pick(gates), time, crew, camp);
        if (!camp.gank && rand() < 0.4) kill(systemId, pick(gates), new Date(time.getTime() + 30_000), crew.slice(0, 1), camp, T.capsule);
      }
    }
  }

  // Now: a smartbomb camp in Rancer and Sabres in Tama, minutes ago; a Tama regular killing next door in Sujarento.
  const live = (system: string, gate: string, minutesAgo: number, camp: Camp, victimShip?: number) => {
    const systemId = id(system);
    const gateTo = id(gate);
    if (systemId !== undefined && gateTo !== undefined)
      kill(systemId, gateTo, new Date(now.getTime() - minutesAgo * 60_000), camp.crew, camp, victimShip);
  };
  live("Rancer", "Crielere", 12, camps[0]);
  live("Rancer", "Crielere", 11, camps[0], T.capsule);
  live("Tama", "Nourvukaiken", 25, camps[1]);
  const sujarento = id("Sujarento");
  const sujarentoGate = id("Tama");
  if (sujarento !== undefined && sujarentoGate !== undefined) {
    kill(sujarento, sujarentoGate, new Date(now.getTime() - 40 * 60_000), [camps[1].crew[0]], camps[1]);
  }

  const rows = gateKillRows(entries);
  for (let i = 0; i < rows.length; i += 500)
    await db
      .insert(gatecheckKills)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing();
  const oldest = rows.reduce((min, r) => (r.killmailTime < min ? r.killmailTime : min), now);
  await db
    .insert(gatecheckFeed)
    .values({
      id: 1,
      coverageSince: oldest,
      caughtUpAt: now,
      lastKillmailAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: gatecheckFeed.id,
      set: {
        coverageSince: oldest,
        caughtUpAt: now,
        lastKillmailAt: now,
        updatedAt: now,
      },
    });
  return { kills: rows.length };
}
