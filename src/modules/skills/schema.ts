import { bigint, index, integer, pgTable, primaryKey, smallint, timestamp } from "drizzle-orm/pg-core";

/*
 * Skills of characters whose owner opted in. Keyed by character with no foreign keys to `characters`: pages only show
 * characters that are still linked (own view) or in the home corporation (corporation view).
 */

/**
 * The skill queue as ESI last returned it (GET /characters/{id}/skillqueue), replaced on every sync. ESI only updates
 * the queue when the character logs in, so entries whose `finish_date` has passed are finished, not training. A
 * paused queue has no dates.
 */
export const skillsQueue = pgTable(
  "skills_queue",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    queuePosition: smallint("queue_position").notNull(),
    skillId: integer("skill_id").notNull(),
    finishedLevel: smallint("finished_level").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }),
    finishDate: timestamp("finish_date", { withTimezone: true }),
    trainingStartSp: integer("training_start_sp"),
    levelStartSp: integer("level_start_sp"),
    levelEndSp: integer("level_end_sp"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.queuePosition] })],
);

/** Trained skills (GET /characters/{id}/skills); what corporation skill plans will be checked against. */
export const skillsCharacterSkills = pgTable(
  "skills_character_skills",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    skillId: integer("skill_id").notNull(),
    trainedLevel: smallint("trained_level").notNull(),
    /** Lower than the trained level for alpha clones. */
    activeLevel: smallint("active_level").notNull(),
    skillpoints: bigint("skillpoints", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.skillId] }), index("skills_character_skills_skill_idx").on(t.skillId, t.trainedLevel)],
);

/**
 * Per-character totals and attributes (GET /characters/{id}/skills and /attributes). The attributes and remap dates
 * are what a remap optimiser needs to know which remaps are available.
 */
export const skillsCharacter = pgTable("skills_character", {
  characterId: bigint("character_id", { mode: "number" }).primaryKey(),
  totalSp: bigint("total_sp", { mode: "number" }),
  unallocatedSp: bigint("unallocated_sp", { mode: "number" }),
  charisma: smallint("charisma"),
  intelligence: smallint("intelligence"),
  memory: smallint("memory"),
  perception: smallint("perception"),
  willpower: smallint("willpower"),
  bonusRemaps: smallint("bonus_remaps"),
  lastRemapDate: timestamp("last_remap_date", { withTimezone: true }),
  /** When the yearly remap is available again. */
  accruedRemapCooldownDate: timestamp("accrued_remap_cooldown_date", { withTimezone: true }),
  queueSyncedAt: timestamp("queue_synced_at", { withTimezone: true }),
  skillsSyncedAt: timestamp("skills_synced_at", { withTimezone: true }),
});

/**
 * Static training data per skill, from the dogma attributes of GET /universe/types/{id}: the primary and secondary
 * attribute (as dogma attribute ids, see ATTRIBUTE_IDS) and the rank. Training speed is primary + secondary / 2 SP
 * per minute; a level needs rank × the base SP of that level.
 */
export const skillsTypeAttributes = pgTable("skills_type_attributes", {
  typeId: integer("type_id").primaryKey(),
  primaryAttribute: integer("primary_attribute").notNull(),
  secondaryAttribute: integer("secondary_attribute").notNull(),
  rank: integer("rank").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
