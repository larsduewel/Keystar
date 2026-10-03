import {
  bigint,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * Cached EVE static/public data resolved from ESI on demand, plus market
 * prices and the ESI HTTP cache. Shared by every module.
 */

/** Names for any EVE id (characters, corporations, alliances, systems, ...). */
export const eveEntities = pgTable("eve_entities", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eveCorporations = pgTable("eve_corporations", {
  corporationId: bigint("corporation_id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  allianceId: bigint("alliance_id", { mode: "number" }),
  memberCount: integer("member_count"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eveGroups = pgTable("eve_groups", {
  groupId: integer("group_id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eveTypes = pgTable(
  "eve_types",
  {
    typeId: integer("type_id").primaryKey(),
    name: text("name").notNull(),
    groupId: integer("group_id").notNull(),
    volume: doublePrecision("volume"),
    packagedVolume: doublePrecision("packaged_volume"),
    portionSize: integer("portion_size"),
    marketGroupId: integer("market_group_id"),
    published: boolean("published").notNull().default(true),
    /** For raw ores/ice/gas: the compressed variant, used as a price fallback. */
    compressedTypeId: integer("compressed_type_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eve_types_group_idx").on(t.groupId)],
);

export const eveSystems = pgTable("eve_systems", {
  systemId: bigint("system_id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  securityStatus: doublePrecision("security_status").notNull(),
  constellationId: bigint("constellation_id", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Constellations with their region (region names live in eve_entities). */
export const eveConstellations = pgTable("eve_constellations", {
  constellationId: bigint("constellation_id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  regionId: bigint("region_id", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PriceSource = "esi_average" | "esi_adjusted" | "jita_buy" | "jita_sell";

/** Raw market prices as reported by a source. */
export const marketPrices = pgTable(
  "market_prices",
  {
    typeId: integer("type_id").notNull(),
    source: text("source").$type<PriceSource>().notNull(),
    price: doublePrecision("price").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.typeId, t.source] })],
);

export type ValuationSource = "jita_buy" | "jita_sell" | "jita_split" | "esi_average";

/**
 * Derived per-unit valuation for a type under a valuation source, after
 * fallbacks (e.g. compressed variant price / compression ratio).
 */
export const typeValues = pgTable(
  "type_values",
  {
    typeId: integer("type_id").notNull(),
    source: text("source").$type<ValuationSource>().notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
    /** How the value was derived: direct | compressed | esi_average | esi_adjusted */
    basis: text("basis").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.typeId, t.source] })],
);

/**
 * Types someone priced on demand (appraisal, field estimator). The hourly price
 * job keeps them fresh until nobody has asked for them in PRICE_INTEREST_DAYS.
 */
export const priceInterest = pgTable("price_interest", {
  typeId: integer("type_id").primaryKey(),
  lastRequestedAt: timestamp("last_requested_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Daily snapshot of type_values, used for "value at time of mining". */
export const typeValueHistory = pgTable(
  "type_value_history",
  {
    typeId: integer("type_id").notNull(),
    source: text("source").$type<ValuationSource>().notNull(),
    date: date("date", { mode: "string" }).notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
  },
  (t) => [primaryKey({ columns: [t.typeId, t.source, t.date] })],
);

/** HTTP cache for ESI responses (ETag + body), keyed per token owner and URL. */
export const esiCache = pgTable(
  "esi_cache",
  {
    key: text("key").primaryKey(),
    etag: text("etag"),
    body: jsonb("body"),
    pages: integer("pages"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("esi_cache_expires_idx").on(t.expiresAt)],
);
