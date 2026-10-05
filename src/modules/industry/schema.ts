import { bigint, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { IndustryActivity, JobStatus } from "./activities";

/*
 * Industry jobs of linked characters. Keyed by character with no foreign key to `characters`: pages only show
 * characters that are still linked to the viewer.
 */

/**
 * Industry jobs as ESI last returned them (GET /characters/{id}/industry/jobs?include_completed=true), upserted by
 * job id. ESI lists finished jobs for 90 days; Keystar keeps a job once it has seen it.
 */
export const industryJobs = pgTable(
  "industry_jobs",
  {
    jobId: bigint("job_id", { mode: "number" }).primaryKey(),
    /** The character whose token the job was read with (the installer). */
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    installerId: bigint("installer_id", { mode: "number" }).notNull(),
    /** Station or structure the job runs in (`industry_locations`): ESI's `facility_id`. */
    locationId: bigint("location_id", { mode: "number" }).notNull(),
    facilityId: bigint("facility_id", { mode: "number" }).notNull(),
    /** ESI's legacy `station_id`, kept as reported (may be missing for structure jobs). */
    stationId: bigint("station_id", { mode: "number" }),
    activityId: integer("activity_id").notNull(),
    activity: text("activity").$type<IndustryActivity>().notNull(),
    blueprintId: bigint("blueprint_id", { mode: "number" }).notNull(),
    blueprintTypeId: integer("blueprint_type_id").notNull(),
    blueprintLocationId: bigint("blueprint_location_id", { mode: "number" }).notNull(),
    outputLocationId: bigint("output_location_id", { mode: "number" }).notNull(),
    productTypeId: integer("product_type_id"),
    runs: integer("runs").notNull(),
    licensedRuns: integer("licensed_runs"),
    successfulRuns: integer("successful_runs"),
    /** Chance of success (invention). */
    probability: doublePrecision("probability"),
    /** Installation fee plus facility tax, ISK. */
    cost: doublePrecision("cost").notNull().default(0),
    /** Seconds. */
    duration: integer("duration").notNull(),
    status: text("status").$type<JobStatus>().notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    pauseDate: timestamp("pause_date", { withTimezone: true }),
    completedDate: timestamp("completed_date", { withTimezone: true }),
    completedCharacterId: bigint("completed_character_id", { mode: "number" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("industry_jobs_character_idx").on(t.characterId, t.status),
    index("industry_jobs_location_idx").on(t.locationId),
    index("industry_jobs_end_idx").on(t.endDate),
  ],
);

/**
 * Names and systems of the stations and structures jobs run in. NPC stations come from the public station endpoint;
 * player structures need a token whose character can dock there, so a structure may stay unnamed (name null) until a
 * later sync with such a token resolves it.
 */
export const industryLocations = pgTable("industry_locations", {
  locationId: bigint("location_id", { mode: "number" }).primaryKey(),
  kind: text("kind").$type<"station" | "structure">().notNull(),
  name: text("name"),
  solarSystemId: bigint("solar_system_id", { mode: "number" }),
  typeId: integer("type_id"),
  /** When the last resolution attempt was made (also for failed ones, so they are retried later and not every sync). */
  resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull().defaultNow(),
});
