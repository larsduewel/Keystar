import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/core/db";
import type { EsiClient } from "@/core/esi/client";
import { ensureTypes } from "@/core/eve/resolver";
import { createLogger } from "@/core/logger";
import type { JobDefinition } from "@/core/sync/types";
import { mapLimit } from "@/lib/concurrency";
import { IMPLANTS_SCOPE, SKILLQUEUE_SCOPE, SKILLS_SCOPE } from "./module";
import { parseSkillDogma } from "./queue";
import { parseImplantDogma, zeroAttributes } from "./remap";
import {
  skillsCharacter,
  skillsCharacterSkills,
  skillsImplantAttributes,
  skillsImplants,
  skillsQueue,
  skillsTypeAttributes,
} from "./schema";

const log = createLogger("skills");
const CHUNK = 1000;

export interface EsiQueueEntry {
  queue_position: number;
  skill_id: number;
  finished_level: number;
  start_date?: string;
  finish_date?: string;
  training_start_sp?: number;
  level_start_sp?: number;
  level_end_sp?: number;
}

interface EsiSkills {
  skills: { skill_id: number; trained_skill_level: number; active_skill_level: number; skillpoints_in_skill: number }[];
  total_sp: number;
  unallocated_sp?: number;
}

interface EsiAttributes {
  charisma: number;
  intelligence: number;
  memory: number;
  perception: number;
  willpower: number;
  bonus_remaps?: number;
  last_remap_date?: string;
  accrued_remap_cooldown_date?: string;
}

const date = (value: string | undefined) => (value ? new Date(value) : null);

export function queueRows(characterId: number, entries: EsiQueueEntry[], now: Date) {
  return entries.map((e) => ({
    characterId,
    queuePosition: e.queue_position,
    skillId: e.skill_id,
    finishedLevel: e.finished_level,
    startDate: date(e.start_date),
    finishDate: date(e.finish_date),
    trainingStartSp: e.training_start_sp ?? null,
    levelStartSp: e.level_start_sp ?? null,
    levelEndSp: e.level_end_sp ?? null,
    updatedAt: now,
  }));
}

type Dogma = { attribute_id: number; value: number }[] | undefined;

/**
 * Caches data read from the dogma attributes of /universe/types/{id} for types not seen before: `known` lists the ids
 * already stored, `parse` turns a type's dogma into a row (null to skip it), `store` inserts the new rows. `ensureTypes`
 * has often just fetched the same responses, so these usually come from the ESI cache.
 */
async function ensureTypeDogma<Row>(
  esi: EsiClient,
  typeIds: number[],
  what: string,
  known: (ids: number[]) => Promise<number[]>,
  parse: (typeId: number, dogma: Dogma) => Row | null,
  store: (rows: Row[]) => Promise<unknown>,
): Promise<void> {
  const wanted = [...new Set(typeIds)];
  if (!wanted.length) return;
  const knownSet = new Set(await known(wanted));
  const rows: Row[] = [];
  await mapLimit(
    wanted.filter((id) => !knownSet.has(id)),
    6,
    async (typeId) => {
      try {
        const res = await esi.get<{ dogma_attributes?: Dogma }>(`/universe/types/${typeId}`);
        const row = parse(typeId, res.data.dogma_attributes);
        if (row) rows.push(row);
      } catch (err) {
        log.warn(`Could not read ${what}`, { typeId, error: (err as Error).message });
      }
    },
  );
  if (rows.length) await store(rows);
}

/** Stores primary/secondary attribute and rank for skills not seen before. */
export function ensureSkillAttributes(esi: EsiClient, db: Db, skillIds: number[]): Promise<void> {
  return ensureTypeDogma(
    esi,
    skillIds,
    "skill attributes",
    async (ids) =>
      (
        await db.select({ id: skillsTypeAttributes.typeId }).from(skillsTypeAttributes).where(inArray(skillsTypeAttributes.typeId, ids))
      ).map((r) => r.id),
    (typeId, dogma) => {
      const parsed = parseSkillDogma(dogma);
      return parsed ? { typeId, ...parsed } : null;
    },
    (rows) => db.insert(skillsTypeAttributes).values(rows).onConflictDoNothing(),
  );
}

/** Stores the attribute bonuses of implant types not seen before (zeros for implants without one). */
export function ensureImplantAttributes(esi: EsiClient, db: Db, typeIds: number[]): Promise<void> {
  return ensureTypeDogma(
    esi,
    typeIds,
    "implant attributes",
    async (ids) =>
      (
        await db
          .select({ id: skillsImplantAttributes.typeId })
          .from(skillsImplantAttributes)
          .where(inArray(skillsImplantAttributes.typeId, ids))
      ).map((r) => r.id),
    (typeId, dogma) => ({ typeId, ...(parseImplantDogma(dogma) ?? zeroAttributes()) }),
    (rows) => db.insert(skillsImplantAttributes).values(rows).onConflictDoNothing(),
  );
}

export const skillQueueJob: JobDefinition = {
  key: "skills.queue",
  label: (t) => t.skills.module.jobs.queue,
  module: "skills",
  owner: "character",
  requiredScopes: [SKILLQUEUE_SCOPE],
  // ESI caches the queue for a couple of minutes; it only changes when the character logs in.
  intervalSeconds: 900,
  async run({ esi, db, characterId }) {
    const id = characterId!;
    const res = await esi.get<EsiQueueEntry[]>(`/characters/${id}/skillqueue`, { characterId: id });
    const now = new Date();
    const rows = queueRows(id, res.data, now);
    await db.transaction(async (tx) => {
      await tx.delete(skillsQueue).where(eq(skillsQueue.characterId, id));
      if (rows.length) await tx.insert(skillsQueue).values(rows);
      await tx
        .insert(skillsCharacter)
        .values({ characterId: id, queueSyncedAt: now })
        .onConflictDoUpdate({ target: skillsCharacter.characterId, set: { queueSyncedAt: now } });
    });
    const skillIds = rows.map((r) => r.skillId);
    await ensureTypes(skillIds);
    await ensureSkillAttributes(esi, db, skillIds);
    return { summary: `${rows.length} queued skill${rows.length === 1 ? "" : "s"}`, nextRunAt: res.expiresAt };
  },
};

export const characterSkillsJob: JobDefinition = {
  key: "skills.character",
  label: (t) => t.skills.module.jobs.character,
  module: "skills",
  owner: "character",
  requiredScopes: [SKILLS_SCOPE],
  intervalSeconds: 3600,
  async run({ esi, db, characterId }) {
    const id = characterId!;
    const [skills, attributes] = await Promise.all([
      esi.get<EsiSkills>(`/characters/${id}/skills`, { characterId: id }),
      esi.get<EsiAttributes>(`/characters/${id}/attributes`, { characterId: id }),
    ]);
    const now = new Date();
    const rows = skills.data.skills.map((s) => ({
      characterId: id,
      skillId: s.skill_id,
      trainedLevel: s.trained_skill_level,
      activeLevel: s.active_skill_level,
      skillpoints: s.skillpoints_in_skill,
      updatedAt: now,
    }));
    const a = attributes.data;
    const character = {
      totalSp: skills.data.total_sp,
      unallocatedSp: skills.data.unallocated_sp ?? 0,
      charisma: a.charisma,
      intelligence: a.intelligence,
      memory: a.memory,
      perception: a.perception,
      willpower: a.willpower,
      bonusRemaps: a.bonus_remaps ?? 0,
      lastRemapDate: date(a.last_remap_date),
      accruedRemapCooldownDate: date(a.accrued_remap_cooldown_date),
      skillsSyncedAt: now,
    };

    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx
          .insert(skillsCharacterSkills)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: [skillsCharacterSkills.characterId, skillsCharacterSkills.skillId],
            set: {
              trainedLevel: sql`excluded.trained_level`,
              activeLevel: sql`excluded.active_level`,
              skillpoints: sql`excluded.skillpoints`,
              updatedAt: sql`excluded.updated_at`,
            },
            setWhere: sql`(${skillsCharacterSkills.trainedLevel}, ${skillsCharacterSkills.activeLevel}, ${skillsCharacterSkills.skillpoints})
              IS DISTINCT FROM (excluded.trained_level, excluded.active_level, excluded.skillpoints)`,
          });
      }
      // Skills can disappear (CCP removes or merges them).
      const ids = rows.map((r) => r.skillId);
      await tx
        .delete(skillsCharacterSkills)
        .where(
          ids.length
            ? and(eq(skillsCharacterSkills.characterId, id), notInArray(skillsCharacterSkills.skillId, ids))
            : eq(skillsCharacterSkills.characterId, id),
        );
      await tx
        .insert(skillsCharacter)
        .values({ characterId: id, ...character })
        .onConflictDoUpdate({ target: skillsCharacter.characterId, set: character });
    });
    await ensureTypes(rows.map((r) => r.skillId));
    const expires = [skills.expiresAt, attributes.expiresAt].filter((d): d is Date => d !== null);
    return {
      summary: `${rows.length} trained skill${rows.length === 1 ? "" : "s"}`,
      nextRunAt: expires.length ? new Date(Math.max(...expires.map((d) => d.getTime()))) : null,
    };
  },
};

export const implantsJob: JobDefinition = {
  key: "skills.implants",
  label: (t) => t.skills.module.jobs.implants,
  module: "skills",
  owner: "character",
  requiredScopes: [IMPLANTS_SCOPE],
  // Implants only change when the pilot plugs one in or jumps clones.
  intervalSeconds: 3600,
  async run({ esi, db, characterId }) {
    const id = characterId!;
    const res = await esi.get<number[]>(`/characters/${id}/implants`, { characterId: id });
    const now = new Date();
    const typeIds = [...new Set(res.data)];
    await db.transaction(async (tx) => {
      await tx.delete(skillsImplants).where(eq(skillsImplants.characterId, id));
      if (typeIds.length) await tx.insert(skillsImplants).values(typeIds.map((typeId) => ({ characterId: id, typeId, updatedAt: now })));
      await tx
        .insert(skillsCharacter)
        .values({ characterId: id, implantsSyncedAt: now })
        .onConflictDoUpdate({ target: skillsCharacter.characterId, set: { implantsSyncedAt: now } });
    });
    // The bonuses are what the remap optimiser needs; names are a nicety, so their failure doesn't fail the run.
    await ensureImplantAttributes(esi, db, typeIds);
    await ensureTypes(typeIds).catch((err: Error) => log.warn("Could not resolve implant names", { characterId: id, error: err.message }));
    return { summary: `${typeIds.length} implant${typeIds.length === 1 ? "" : "s"}`, nextRunAt: res.expiresAt };
  },
};

export const skillsJobs: JobDefinition[] = [skillQueueJob, characterSkillsJob, implantsJob];
