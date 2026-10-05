import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/core/db/schema/core";

/**
 * Personal mining ledgers (GET /characters/{id}/mining). ESI only keeps 30
 * days; Keystar keeps everything it has ever seen. ESI aggregates per day, so
 * a row's quantity grows during the day and is overwritten on each sync.
 */
export const miningCharacterLedger = pgTable(
  "mining_character_ledger",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    solarSystemId: bigint("solar_system_id", { mode: "number" }).notNull(),
    typeId: integer("type_id").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.date, t.solarSystemId, t.typeId] }),
    index("mining_char_ledger_date_idx").on(t.date),
  ],
);

/** Corporation mining observers (moon drills on Upwell refineries). */
export const miningObservers = pgTable("mining_observers", {
  observerId: bigint("observer_id", { mode: "number" }).primaryKey(),
  corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
  observerType: text("observer_type").notNull(),
  lastUpdated: date("last_updated", { mode: "string" }),
  /** Filled from /corporations/{id}/structures when a Station_Manager token is available. */
  name: text("name"),
  solarSystemId: bigint("solar_system_id", { mode: "number" }),
  structureTypeId: integer("structure_type_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Observer ledgers: who mined what at a corp refinery, including non-members. */
export const miningObserverLedger = pgTable(
  "mining_observer_ledger",
  {
    observerId: bigint("observer_id", { mode: "number" }).notNull(),
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    recordedCorporationId: bigint("recorded_corporation_id", { mode: "number" }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    typeId: integer("type_id").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.observerId, t.characterId, t.date, t.typeId] }),
    index("mining_obs_ledger_date_idx").on(t.date),
    index("mining_obs_ledger_char_idx").on(t.characterId),
  ],
);

/**
 * Mining activity measured from ledger growth between syncs (see activity.ts):
 * the character's ledger grew by `quantity` of `type_id` on ledger day `date`
 * during [window_start, window_end). Used for active hours and ISK/hour.
 */
export const miningActivity = pgTable(
  "mining_activity",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    typeId: integer("type_id").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.windowEnd, t.date, t.typeId] }),
    index("mining_activity_char_date_idx").on(t.characterId, t.date),
  ],
);

/** Per character: since when ledger growth is observed, and the latest observation. */
export const miningActivityCoverage = pgTable("mining_activity_coverage", {
  characterId: bigint("character_id", { mode: "number" }).primaryKey(),
  since: timestamp("since", { withTimezone: true }).notNull(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  lastGrowthAt: timestamp("last_growth_at", { withTimezone: true }),
});

/*
 * Personal mining P&L. Everything below belongs to one Keystar account and is
 * only ever shown to it; rows go when the account is deleted.
 */
const owner = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/**
 * Income basis: "mined" values the mined ore at this % of the dashboard valuation (e.g. 90 for buyback) unless a
 * price rule applies; "sales" counts what the wallet sales of ore and its products actually brought in.
 */
export const miningPnlSettings = pgTable("mining_pnl_settings", {
  userId: owner().primaryKey(),
  incomeRatePct: doublePrecision("income_rate_pct").notNull().default(100),
  incomeSource: text("income_source").$type<"mined" | "sales">().notNull().default("mined"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per character: count auto-tagged wallet purchases (expenses) and sales (income) without reviewing them (off by default). */
export const miningPnlCharacters = pgTable(
  "mining_pnl_characters",
  {
    userId: owner(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    autoIncludeExpenses: boolean("auto_include_expenses").notNull().default(false),
    autoIncludeSales: boolean("auto_include_sales").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.characterId] })],
);

/** What an ore actually sells for: overrides the % rate for that type (optionally for a date range). */
export const miningPnlPriceRules = pgTable(
  "mining_pnl_price_rules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: owner(),
    typeId: integer("type_id").notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mining_pnl_price_rules_user_idx").on(t.userId, t.typeId)],
);

/**
 * The user's decision on a wallet purchase or sale: its category (an expense category for a purchase, an income
 * category for a sale) and whether it counts (null = automatic).
 */
export const miningPnlTxOverrides = pgTable(
  "mining_pnl_tx_overrides",
  {
    userId: owner(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    transactionId: bigint("transaction_id", { mode: "number" }).notNull(),
    category: text("category"),
    included: boolean("included"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.characterId, t.transactionId] })],
);

/** The user's include/exclude decision on a sales tax or broker fee from the wallet journal (`wallet_fees`). */
export const miningPnlFeeOverrides = pgTable(
  "mining_pnl_fee_overrides",
  {
    userId: owner(),
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    journalId: bigint("journal_id", { mode: "number" }).notNull(),
    included: boolean("included").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.characterId, t.journalId] })],
);

/**
 * Costs ESI can't see (PLEX/Omega for alts, contracts …). `spread_days` > 1
 * spreads the amount evenly over that many days from `date`, so a year of
 * Omega doesn't land on a single day.
 */
export const miningPnlEntries = pgTable(
  "mining_pnl_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: owner(),
    /** null: account-wide. */
    characterId: bigint("character_id", { mode: "number" }),
    date: date("date", { mode: "string" }).notNull(),
    spreadDays: smallint("spread_days").notNull().default(1),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    amount: doublePrecision("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mining_pnl_entries_user_date_idx").on(t.userId, t.date)],
);
