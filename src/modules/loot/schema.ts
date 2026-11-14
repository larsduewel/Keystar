import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  bigint,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import type { Ledger } from "./types";
export const lootOperations = pgTable(
  "loot_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    fleetId: bigint("fleet_id", { mode: "number" }),
    shared: boolean("shared").notNull().default(false),
    closed: boolean("closed").notNull().default(false),
    ledger: jsonb("ledger").$type<Ledger>().notNull(),
    revision: integer("revision").notNull().default(0),
    syncStatus: text("sync_status")
      .$type<"pending" | "ready" | "failed">()
      .notNull()
      .default("pending"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("loot_operations_owner_idx").on(t.ownerId, t.createdAt)],
);
