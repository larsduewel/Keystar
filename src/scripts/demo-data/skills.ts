import { sql } from "drizzle-orm";
import {
  esiTokens,
  eveGroups,
  eveTypes,
  skillsCharacter,
  skillsCharacterSkills,
  skillsQueue,
  skillsTypeAttributes,
  syncJobs,
  type Db,
} from "@/core/db";
import { SKILLS_SCOPES } from "@/modules/skills/module";
import { ATTRIBUTE_IDS, type AttributeName } from "@/modules/skills/queue";

/** Real skills (ids, groups, attributes and ranks as ESI lists them). */
const SKILLS = [
  { typeId: 3386, name: "Mining", groupId: 1218, primary: "memory", secondary: "intelligence", rank: 1 },
  { typeId: 3410, name: "Astrogeology", groupId: 1218, primary: "intelligence", secondary: "memory", rank: 3 },
  { typeId: 22578, name: "Mining Upgrades", groupId: 1218, primary: "memory", secondary: "intelligence", rank: 4 },
  { typeId: 16281, name: "Ice Harvesting", groupId: 1218, primary: "memory", secondary: "intelligence", rank: 1 },
  { typeId: 3385, name: "Reprocessing", groupId: 1218, primary: "memory", secondary: "intelligence", rank: 1 },
  { typeId: 17940, name: "Mining Barge", groupId: 257, primary: "perception", secondary: "willpower", rank: 4 },
  { typeId: 22551, name: "Exhumers", groupId: 257, primary: "willpower", secondary: "perception", rank: 5 },
  { typeId: 3327, name: "Spaceship Command", groupId: 257, primary: "perception", secondary: "willpower", rank: 1 },
  { typeId: 3436, name: "Drones", groupId: 273, primary: "memory", secondary: "perception", rank: 1 },
  { typeId: 33699, name: "Medium Drone Operation", groupId: 273, primary: "memory", secondary: "perception", rank: 2 },
  { typeId: 3442, name: "Drone Interfacing", groupId: 273, primary: "memory", secondary: "perception", rank: 5 },
  { typeId: 3300, name: "Gunnery", groupId: 255, primary: "perception", secondary: "willpower", rank: 1 },
  { typeId: 3318, name: "Weapon Upgrades", groupId: 1216, primary: "willpower", secondary: "intelligence", rank: 2 },
  { typeId: 3413, name: "Power Grid Management", groupId: 1216, primary: "intelligence", secondary: "memory", rank: 1 },
  { typeId: 3426, name: "CPU Management", groupId: 1216, primary: "intelligence", secondary: "memory", rank: 1 },
  { typeId: 3449, name: "Navigation", groupId: 275, primary: "intelligence", secondary: "perception", rank: 1 },
  { typeId: 3455, name: "Warp Drive Operation", groupId: 275, primary: "intelligence", secondary: "perception", rank: 1 },
] as const;

const GROUPS = [
  { groupId: 1218, name: "Resource Processing", categoryId: 16 },
  { groupId: 257, name: "Spaceship Command", categoryId: 16 },
  { groupId: 273, name: "Drones", categoryId: 16 },
  { groupId: 255, name: "Gunnery", categoryId: 16 },
  { groupId: 1216, name: "Engineering", categoryId: 16 },
  { groupId: 275, name: "Navigation", categoryId: 16 },
];

/** Skill points of level 0..5 at rank 1. */
const LEVEL_SP = [0, 250, 1415, 8000, 45255, 256000];
type SkillName = (typeof SKILLS)[number]["name"];
type Attributes = Record<AttributeName, number>;

type Profile =
  | { kind: "training"; queue: [SkillName, number][]; progress: number }
  | { kind: "paused"; queue: [SkillName, number][]; progress: number }
  | { kind: "empty" };

const MINER: Attributes = { charisma: 19, intelligence: 24, memory: 27, perception: 20, willpower: 20 };
const PILOT: Attributes = { charisma: 17, intelligence: 20, memory: 20, perception: 27, willpower: 26 };

/** Which demo characters share their skills, and what they train. Others keep sharing off. */
const PROFILES: Record<string, { attributes: Attributes; profile: Profile }> = {
  "Aria Vexmoor": {
    attributes: MINER,
    profile: {
      kind: "training",
      progress: 0.35,
      queue: [["Mining Upgrades", 5], ["Astrogeology", 5], ["Exhumers", 4], ["Drone Interfacing", 4], ["Reprocessing", 5]],
    },
  },
  "Aria Ironveil": { attributes: MINER, profile: { kind: "training", progress: 0.97, queue: [["Ice Harvesting", 4]] } },
  "Tovan Rhask": {
    attributes: PILOT,
    profile: { kind: "training", progress: 0.6, queue: [["Gunnery", 5], ["Weapon Upgrades", 5], ["Navigation", 5]] },
  },
  "Mira Rhask": { attributes: MINER, profile: { kind: "empty" } },
  "Ishani Calder": {
    attributes: MINER,
    profile: { kind: "training", progress: 0.1, queue: [["Exhumers", 5], ["Mining Barge", 5], ["Medium Drone Operation", 5]] },
  },
  "Ishani Deepcore": { attributes: MINER, profile: { kind: "paused", progress: 0.4, queue: [["Astrogeology", 4], ["Mining", 5]] } },
  "Zahra Imren": {
    attributes: PILOT,
    profile: { kind: "training", progress: 0.8, queue: [["Spaceship Command", 5], ["CPU Management", 5], ["Power Grid Management", 5]] },
  },
};

/** Queue, trained skills and attributes for the demo characters listed in PROFILES. */
export async function seedSkills(db: Db, opts: { characters: { characterId: number; name: string }[]; now: Date }): Promise<number> {
  await db.insert(eveGroups).values(GROUPS).onConflictDoNothing();
  await db
    .insert(eveTypes)
    .values(SKILLS.map((s) => ({ typeId: s.typeId, name: s.name, groupId: s.groupId, volume: 0.01, published: true })))
    .onConflictDoNothing();
  await db.insert(skillsTypeAttributes).values(
    SKILLS.map((s) => ({
      typeId: s.typeId,
      primaryAttribute: ATTRIBUTE_IDS[s.primary],
      secondaryAttribute: ATTRIBUTE_IDS[s.secondary],
      rank: s.rank,
    })),
  );
  const byName = new Map(SKILLS.map((s) => [s.name as string, s]));
  const now = opts.now.getTime();
  let queued = 0;

  for (const c of opts.characters) {
    const entry = PROFILES[c.name];
    if (!entry) continue;
    const { attributes, profile } = entry;
    const queue = profile.kind === "empty" ? [] : profile.queue;

    // Trained skills: every skill one level below what is queued, the rest at IV.
    const trained = new Map<number, number>(SKILLS.map((s) => [s.typeId, 4]));
    for (const [name, level] of queue) trained.set(byName.get(name)!.typeId, level - 1);
    const skillRows = SKILLS.map((s) => ({
      characterId: c.characterId,
      skillId: s.typeId,
      trainedLevel: trained.get(s.typeId)!,
      activeLevel: trained.get(s.typeId)!,
      skillpoints: LEVEL_SP[trained.get(s.typeId)!] * s.rank,
    }));
    await db.insert(skillsCharacterSkills).values(skillRows);
    const skillSp = skillRows.reduce((sum, r) => sum + r.skillpoints, 0);

    // Queue entries back to back, timed with the character's attributes like the game does.
    let start = now;
    const rows = queue.map(([name, level], position) => {
      const s = byName.get(name)!;
      const levelStartSp = LEVEL_SP[level - 1] * s.rank;
      const levelEndSp = LEVEL_SP[level] * s.rank;
      const spPerMinute = attributes[s.primary] + attributes[s.secondary] / 2;
      const first = position === 0 && profile.kind !== "empty";
      const trainingStartSp = first ? Math.round(levelStartSp + (levelEndSp - levelStartSp) * profile.progress) : levelStartSp;
      const minutes = (levelEndSp - trainingStartSp) / spPerMinute;
      const paused = profile.kind === "paused";
      const row = {
        characterId: c.characterId,
        queuePosition: position,
        skillId: s.typeId,
        finishedLevel: level,
        // ESI reports the current skill as started at the last login with the SP it had then.
        startDate: paused ? null : new Date(first ? now - 3 * 3600_000 : start),
        finishDate: paused ? null : new Date(start + minutes * 60_000),
        // A paused skill stays at the SP it has; a training one is reported as of the last login three hours ago.
        trainingStartSp: first && !paused ? Math.max(levelStartSp, Math.round(trainingStartSp - 3 * 60 * spPerMinute)) : trainingStartSp,
        levelStartSp,
        levelEndSp,
      };
      start += minutes * 60_000;
      return row;
    });
    if (rows.length) await db.insert(skillsQueue).values(rows);
    queued += rows.length;

    await db.insert(skillsCharacter).values({
      characterId: c.characterId,
      totalSp: skillSp + 38_000_000 + (c.characterId % 7) * 3_100_000,
      unallocatedSp: c.name === "Ishani Calder" ? 125_000 : 0,
      ...attributes,
      bonusRemaps: c.name === "Aria Vexmoor" ? 1 : 0,
      lastRemapDate: new Date(now - 200 * 86400_000),
      accruedRemapCooldownDate: new Date(now + (c.name === "Tovan Rhask" ? -5 : 165) * 86400_000),
      queueSyncedAt: new Date(now - 6 * 60_000),
      skillsSyncedAt: new Date(now - 20 * 60_000),
    });
    for (const scope of SKILLS_SCOPES) {
      await db
        .update(esiTokens)
        .set({ scopes: sql`array_append(${esiTokens.scopes}, ${scope})` })
        .where(sql`${esiTokens.characterId} = ${c.characterId}`);
    }
    await db.insert(syncJobs).values(
      (["skills.queue", "skills.character"] as const).map((jobKey) => ({
        jobKey,
        ownerType: "character" as const,
        ownerId: c.characterId,
        lastStatus: "ok" as const,
        lastSummary: jobKey === "skills.queue" ? `${rows.length} queued skills` : `${skillRows.length} trained skills`,
        lastRunAt: new Date(now - 6 * 60_000),
        lastSuccessAt: new Date(now - 6 * 60_000),
        nextRunAt: new Date(now + 9 * 60_000),
      })),
    );
  }
  return queued;
}
