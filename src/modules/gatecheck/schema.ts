import { bigint, boolean, doublePrecision, index, integer, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Killmails in known-space systems with stargates, from zKillboard's live feed
 * (every killmail in New Eden passes by; see ingest.ts). `gate_id` is the
 * stargate the kill happened at (within GATE_RADIUS_METRES), null for kills
 * elsewhere in the system. Kills at gates are kept GATE_HISTORY_DAYS, the rest
 * OTHER_KILL_DAYS. The player attackers (at most MAX_ATTACKERS, by damage) are
 * kept as aligned arrays, attacker i being character_ids[i] in corporation_ids[i]
 * flying ship_type_ids[i] with weapon_type_ids[i] (0 = unknown): enough to tell
 * who camps where, when and in what, without a row per attacker.
 */
export const gatecheckKills = pgTable(
  "gatecheck_kills",
  {
    killmailId: bigint("killmail_id", { mode: "number" }).primaryKey(),
    hash: text("hash").notNull(),
    killmailTime: timestamp("killmail_time", { withTimezone: true }).notNull(),
    solarSystemId: bigint("solar_system_id", { mode: "number" }).notNull(),
    gateId: bigint("gate_id", { mode: "number" }),
    /** Distance from the gate; null when only zKillboard's location says it was at the gate. */
    gateDistanceM: doublePrecision("gate_distance_m"),
    victimCharacterId: bigint("victim_character_id", { mode: "number" }),
    victimCorporationId: bigint("victim_corporation_id", { mode: "number" }),
    victimAllianceId: bigint("victim_alliance_id", { mode: "number" }),
    victimShipTypeId: integer("victim_ship_type_id").notNull(),
    totalValue: doublePrecision("total_value").notNull().default(0),
    /** Every attacker, NPCs included. */
    attackerCount: smallint("attacker_count").notNull(),
    attackerCharacterIds: bigint("attacker_character_ids", { mode: "number" }).array().notNull(),
    attackerCorporationIds: bigint("attacker_corporation_ids", {
      mode: "number",
    })
      .array()
      .notNull(),
    attackerAllianceIds: bigint("attacker_alliance_ids", { mode: "number" }).array().notNull(),
    attackerShipTypeIds: integer("attacker_ship_type_ids").array().notNull(),
    attackerWeaponTypeIds: integer("attacker_weapon_type_ids").array().notNull(),
    /** Only NPCs on the mail (zKillboard's flag). */
    npc: boolean("npc").notNull().default(false),
    /** CONCORD on the mail: the attackers were CONCORDed (a suicide gank). */
    concord: boolean("concord").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("gatecheck_kills_system_time_idx").on(t.solarSystemId, t.killmailTime),
    index("gatecheck_kills_time_idx").on(t.killmailTime),
  ],
);

/**
 * How far the live feed has been read (one row, id 1): since when it has read
 * every killmail without a gap, and when it last caught up with zKillboard.
 * Without a recent catch-up, "no kills" on a route means nothing.
 */
export const gatecheckFeed = pgTable("gatecheck_feed", {
  id: smallint("id").primaryKey(),
  coverageSince: timestamp("coverage_since", { withTimezone: true }).notNull(),
  caughtUpAt: timestamp("caught_up_at", { withTimezone: true }),
  lastKillmailAt: timestamp("last_killmail_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GatecheckKillRow = typeof gatecheckKills.$inferSelect;
export type GatecheckKillInsert = typeof gatecheckKills.$inferInsert;
