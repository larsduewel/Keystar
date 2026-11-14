import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/core/db/schema/core";

export type FleetTrackerStatus =
  | "tracking"
  | "not_boss"
  | "no_fleet"
  | "stopped";

/**
 * Characters whose owner chose to share their fleet. Only these are polled:
 * ESI answers "not in a fleet" with a 404, and 404s count against the error
 * limit, so polling every member would burn it quickly.
 */
export const fleetTrackers = pgTable("fleet_trackers", {
  characterId: bigint("character_id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status")
    .$type<FleetTrackerStatus>()
    .notNull()
    .default("tracking"),
  /** The fleet the character was last seen in. */
  fleetId: bigint("fleet_id", { mode: "number" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
});

export interface FleetWing {
  id: number;
  name: string;
  squads: { id: number; name: string }[];
}

/** Fleets seen through a tracker. `endedAt` is set once the boss is no longer in it. */
export const fleets = pgTable(
  "fleets",
  {
    fleetId: bigint("fleet_id", { mode: "number" }).primaryKey(),
    bossCharacterId: bigint("boss_character_id", { mode: "number" }).notNull(),
    motd: text("motd").notNull().default(""),
    isFreeMove: boolean("is_free_move").notNull().default(false),
    wings: jsonb("wings").$type<FleetWing[]>().notNull().default([]),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("fleets_first_seen_idx").on(t.firstSeenAt)],
);

/**
 * Everyone seen in a fleet, with their latest position. Members still in the
 * fleet have no `leftAt`; a pilot who rejoins gets `leftAt` cleared again.
 */
export const fleetMembers = pgTable(
  "fleet_members",
  {
    fleetId: bigint("fleet_id", { mode: "number" }).notNull(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    joinTime: timestamp("join_time", { withTimezone: true }).notNull(),
    role: text("role").notNull(),
    wingId: bigint("wing_id", { mode: "number" }).notNull(),
    squadId: bigint("squad_id", { mode: "number" }).notNull(),
    shipTypeId: integer("ship_type_id").notNull(),
    solarSystemId: bigint("solar_system_id", { mode: "number" }).notNull(),
    takesFleetWarp: boolean("takes_fleet_warp").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.fleetId, t.characterId] }),
    index("fleet_members_character_idx").on(t.characterId),
  ],
);

/** Each ESI join-time identifies a distinct visit; leaving/rejoining must not erase attendance. */
export const fleetAttendance = pgTable(
  "fleet_attendance",
  {
    fleetId: bigint("fleet_id", { mode: "number" }).notNull(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    endReason: text("end_reason").$type<"left" | "tracking_stopped">(),
  },
  (t) => [
    primaryKey({ columns: [t.fleetId, t.characterId, t.joinedAt] }),
    index("fleet_attendance_window_idx").on(t.fleetId, t.joinedAt),
  ],
);
