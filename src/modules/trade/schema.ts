import { index, integer, jsonb, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Saved appraisals: a snapshot of items and Jita prices at the time of the
 * appraisal, shareable by its unguessable id. See appraisal/types.ts for the
 * JSON shapes.
 */
export const appraisals = pgTable(
  "appraisals",
  {
    id: text("id").primaryKey(),
    createdBy: uuid("created_by"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Percentage applied to the totals (e.g. 90 for a buyback offer). */
    pricePercent: integer("price_percent").notNull().default(100),
    items: jsonb("items").notNull(),
    totals: jsonb("totals").notNull(),
    unparsed: jsonb("unparsed").notNull(),
    input: text("input").notNull(),
  },
  (t) => [index("appraisals_created_by_idx").on(t.createdBy, t.createdAt)],
);

/**
 * One row per appraisal a user started, saved or not, for the per-user rate
 * limit. Kept apart from `appraisals` so deleting a snapshot (or an appraisal
 * that failed or found nothing) still counts. Pruned by trade.housekeeping.
 */
export const appraisalAttempts = pgTable(
  "appraisal_attempts",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("appraisal_attempts_user_idx").on(t.userId, t.createdAt)],
);
