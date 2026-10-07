import { bigint, boolean, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { OrderRange, OrderState } from "./orders";

/*
 * Market orders of linked characters. Keyed by character with no foreign key to `characters`: pages only show
 * characters that are still linked to the viewer. Stations and structures are named in `industry_locations`, shared
 * with industry jobs.
 */

/**
 * Market orders as ESI last returned them (GET /characters/{id}/orders and /orders/history), upserted by order id.
 * ESI lists closed orders for 90 days; Keystar keeps an order once it has seen it.
 */
export const marketOrders = pgTable(
  "market_orders",
  {
    orderId: bigint("order_id", { mode: "number" }).primaryKey(),
    /** The character whose token the order was read with (who placed it, also for corporation orders). */
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    typeId: integer("type_id").notNull(),
    regionId: integer("region_id").notNull(),
    /** Station or structure the order is placed in (`industry_locations`). */
    locationId: bigint("location_id", { mode: "number" }).notNull(),
    isBuyOrder: boolean("is_buy_order").notNull(),
    /** Placed on behalf of the corporation. */
    isCorporation: boolean("is_corporation").notNull(),
    /** ISK per unit. */
    price: doublePrecision("price").notNull(),
    volumeTotal: bigint("volume_total", { mode: "number" }).notNull(),
    volumeRemain: bigint("volume_remain", { mode: "number" }).notNull(),
    /** Buy orders: the smallest quantity a seller must fill at once. */
    minVolume: bigint("min_volume", { mode: "number" }),
    /** Buy orders: ISK held in escrow. */
    escrow: doublePrecision("escrow"),
    range: text("range").$type<OrderRange>().notNull(),
    /** Days from `issued` until the order expires. */
    duration: integer("duration").notNull(),
    /** When the order was placed or last modified in game. */
    issued: timestamp("issued", { withTimezone: true }).notNull(),
    state: text("state").$type<OrderState>().notNull(),
    /** When Keystar noticed the order was no longer open; null while open or if it was first seen closed. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("market_orders_character_idx").on(t.characterId, t.state), index("market_orders_location_idx").on(t.locationId)],
);
