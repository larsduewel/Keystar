import { sql } from "drizzle-orm";
import { esiTokens, eveGroups, eveTypes, industryJobs, industryLocations, syncJobs, type Db } from "@/core/db";
import { activityOf, type JobStatus } from "@/modules/industry/activities";
import { INDUSTRY_SCOPES } from "@/modules/industry/module";

/** Blueprints and products used by the demo jobs (real type ids). */
const GROUPS = [
  { groupId: 489, name: "Mining Barge Blueprint", categoryId: 9 },
  { groupId: 1255, name: "Expedition Frigate Blueprint", categoryId: 9 },
  { groupId: 1201, name: "Mining Upgrade Blueprint", categoryId: 9 },
  { groupId: 136, name: "Mining Laser Blueprint", categoryId: 9 },
  { groupId: 177, name: "Combat Drone Blueprint", categoryId: 9 },
  { groupId: 176, name: "Mining Drone Blueprint", categoryId: 9 },
  { groupId: 463, name: "Mining Barge", categoryId: 6 },
  { groupId: 1283, name: "Expedition Frigate", categoryId: 6 },
  { groupId: 1202, name: "Mining Upgrade", categoryId: 7 },
  { groupId: 54, name: "Mining Laser", categoryId: 7 },
  { groupId: 100, name: "Combat Drone", categoryId: 18 },
  { groupId: 101, name: "Mining Drone", categoryId: 18 },
];

const TYPES = [
  { typeId: 17481, name: "Procurer Blueprint", groupId: 489 },
  { typeId: 17480, name: "Procurer", groupId: 463 },
  { typeId: 17479, name: "Retriever Blueprint", groupId: 489 },
  { typeId: 17478, name: "Retriever", groupId: 463 },
  { typeId: 32881, name: "Venture Blueprint", groupId: 1255 },
  { typeId: 32880, name: "Venture", groupId: 1283 },
  { typeId: 22543, name: "Mining Laser Upgrade I Blueprint", groupId: 1201 },
  { typeId: 22542, name: "Mining Laser Upgrade I", groupId: 1202 },
  { typeId: 17483, name: "Strip Miner I Blueprint", groupId: 136 },
  { typeId: 17482, name: "Strip Miner I", groupId: 54 },
  { typeId: 2455, name: "Hobgoblin I Blueprint", groupId: 177 },
  { typeId: 2454, name: "Hobgoblin I", groupId: 100 },
  { typeId: 10247, name: "Mining Drone I Blueprint", groupId: 176 },
  { typeId: 10246, name: "Mining Drone I", groupId: 101 },
  { typeId: 28208, name: "Mining Laser Upgrade II Blueprint", groupId: 1201 },
  { typeId: 28207, name: "Mining Laser Upgrade II", groupId: 1202 },
];

/** Where the demo jobs run: two NPC stations, a named corporation structure and one the character can't dock at. */
const LOCATIONS: (typeof industryLocations.$inferInsert)[] = [
  { locationId: 60014845, kind: "station", name: "Osmon II - Moon 1 - Sisters of EVE Bureau", solarSystemId: 30000180, typeId: 1529 },
  { locationId: 60011740, kind: "station", name: "Hek VIII - Moon 12 - Boundless Creation Factory", solarSystemId: 30002053, typeId: 1531 },
  { locationId: 1_035_000_000_777, kind: "structure", name: "Sirseshin - Keystar Raitaru", solarSystemId: 30000127, typeId: 35825 },
  { locationId: 1_035_000_000_778, kind: "structure", name: null, solarSystemId: null, typeId: null },
];

interface Spec {
  activityId: number;
  blueprint: number;
  product: number | null;
  runs: number;
  /** Hours; negative start means the job began that long ago. */
  startH: number;
  durationH: number;
  status: JobStatus;
  location: number;
  cost: number;
  probability?: number;
  successfulRuns?: number;
  pausedH?: number;
}

const H = 3600_000;

/** Jobs per demo character: a spread of activities, locations and states around `now`. */
const JOBS: Record<string, Spec[]> = {
  "Aria Vexmoor": [
    { activityId: 1, blueprint: 17481, product: 17480, runs: 2, startH: -30, durationH: 44, status: "active", location: 1_035_000_000_777, cost: 1_840_000 },
    { activityId: 1, blueprint: 22543, product: 22542, runs: 20, startH: -5, durationH: 9, status: "active", location: 1_035_000_000_777, cost: 212_000 },
    { activityId: 4, blueprint: 17479, product: null, runs: 1, startH: -70, durationH: 160, status: "active", location: 60014845, cost: 95_000 },
    { activityId: 5, blueprint: 2455, product: 2455, runs: 10, startH: -20, durationH: 18, status: "active", location: 60014845, cost: 8_000 },
    { activityId: 1, blueprint: 17483, product: 17482, runs: 6, startH: -60, durationH: 50, status: "delivered", location: 1_035_000_000_777, cost: 640_000, successfulRuns: 6 },
    { activityId: 8, blueprint: 22543, product: 28208, runs: 4, startH: -40, durationH: 30, status: "delivered", location: 60011740, cost: 420_000, probability: 0.38, successfulRuns: 2 },
  ],
  "Aria Ironveil": [
    { activityId: 1, blueprint: 32881, product: 32880, runs: 3, startH: -8, durationH: 6, status: "active", location: 60014845, cost: 310_000 },
    { activityId: 3, blueprint: 17481, product: null, runs: 1, startH: -100, durationH: 240, status: "paused", location: 1_035_000_000_777, cost: 150_000, pausedH: -30 },
    { activityId: 1, blueprint: 10247, product: 10246, runs: 50, startH: -90, durationH: 40, status: "delivered", location: 60011740, cost: 95_000, successfulRuns: 50 },
  ],
  "Kestrel Vexmoor": [
    { activityId: 8, blueprint: 22543, product: 28208, runs: 2, startH: -3, durationH: 26, status: "active", location: 1_035_000_000_778, cost: 230_000, probability: 0.38 },
    { activityId: 1, blueprint: 2455, product: 2454, runs: 100, startH: -200, durationH: 60, status: "cancelled", location: 60011740, cost: 60_000 },
  ],
  "Tovan Rhask": [
    { activityId: 1, blueprint: 17479, product: 17478, runs: 1, startH: -26, durationH: 22, status: "active", location: 60011740, cost: 1_210_000 },
    { activityId: 9, blueprint: 17483, product: 17482, runs: 5, startH: -1, durationH: 36, status: "active", location: 1_035_000_000_777, cost: 48_000 },
  ],
  "Ishani Calder": [
    { activityId: 5, blueprint: 17481, product: 17481, runs: 3, startH: -50, durationH: 30, status: "ready", location: 60014845, cost: 42_000 },
    { activityId: 1, blueprint: 22543, product: 22542, runs: 10, startH: -2, durationH: 5, status: "active", location: 60014845, cost: 106_000 },
  ],
  "Jorek Taln": [
    { activityId: 1, blueprint: 10247, product: 10246, runs: 25, startH: -36, durationH: 20, status: "delivered", location: 60011740, cost: 47_000, successfulRuns: 25 },
  ],
};

/** Industry jobs for a few demo characters, which also get the opt-in industry scopes. Returns the number of jobs seeded. */
export async function seedIndustry(db: Db, opts: { characters: { characterId: number; name: string }[]; now: Date }): Promise<number> {
  await db.insert(eveGroups).values(GROUPS).onConflictDoNothing();
  await db.insert(eveTypes).values(TYPES.map((t) => ({ ...t, published: true }))).onConflictDoNothing();
  await db.insert(industryLocations).values(LOCATIONS.map((l) => ({ ...l, resolvedAt: opts.now }))).onConflictDoNothing();

  const rows: (typeof industryJobs.$inferInsert)[] = [];
  let jobId = 540_100_000;
  for (const c of opts.characters) {
    const specs = JOBS[c.name];
    if (!specs) continue;
    for (const s of specs) {
      const start = new Date(opts.now.getTime() + s.startH * H);
      const end = new Date(start.getTime() + s.durationH * H);
      const finished = s.status === "delivered" || s.status === "cancelled" || s.status === "reverted";
      rows.push({
        jobId: jobId++,
        characterId: c.characterId,
        installerId: c.characterId,
        locationId: s.location,
        facilityId: s.location,
        stationId: s.location < 2_147_483_647 ? s.location : null,
        activityId: s.activityId,
        activity: activityOf(s.activityId),
        blueprintId: 1_020_000_000 + jobId,
        blueprintTypeId: s.blueprint,
        blueprintLocationId: s.location,
        outputLocationId: s.location,
        productTypeId: s.product,
        runs: s.runs,
        licensedRuns: s.activityId === 5 ? s.runs * 10 : null,
        successfulRuns: s.successfulRuns ?? null,
        probability: s.probability ?? null,
        cost: s.cost,
        duration: s.durationH * 3600,
        status: s.status,
        startDate: start,
        endDate: end,
        pauseDate: s.pausedH !== undefined ? new Date(opts.now.getTime() + s.pausedH * H) : null,
        completedDate: finished ? new Date(end.getTime() + (s.status === "cancelled" ? -s.durationH * H * 0.5 : 2 * H)) : null,
        completedCharacterId: finished && s.status !== "cancelled" ? c.characterId : null,
        firstSeenAt: start,
        updatedAt: opts.now,
      });
    }
  }
  if (rows.length) await db.insert(industryJobs).values(rows);
  const enabled = opts.characters.filter((c) => JOBS[c.name]);
  for (const c of enabled) {
    for (const scope of INDUSTRY_SCOPES) {
      await db
        .update(esiTokens)
        .set({ scopes: sql`array_append(${esiTokens.scopes}, ${scope})` })
        .where(sql`${esiTokens.characterId} = ${c.characterId}`);
    }
  }
  await db.insert(syncJobs).values(
    enabled.map((c) => ({
      jobKey: "industry.character-jobs",
      ownerType: "character" as const,
      ownerId: c.characterId,
      lastStatus: "ok" as const,
      lastSuccessAt: new Date(opts.now.getTime() - 4 * 60_000),
      lastSummary: `${JOBS[c.name].filter((s) => !["delivered", "cancelled", "reverted"].includes(s.status)).length} running jobs, ${JOBS[c.name].length} listed`,
    })),
  );
  return rows.length;
}
