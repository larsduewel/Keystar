import { bigint, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
/** Durable, deduplicated work shared by web processes and the name-resolution worker. */
export const mapNameQueue = pgTable("map_name_queue", {
 id: bigint("id",{mode:"number"}).notNull(),
 kind: text("kind").$type<"character"|"type">().notNull(),
}, t=>[primaryKey({columns:[t.id,t.kind]})]);

/** Last successful public ESI feed. Failed refreshes leave this snapshot intact. */
export const mapSkyhookSnapshot = pgTable("map_skyhook_snapshot", {
 id: integer("id").primaryKey(),
 skyhooks: jsonb("skyhooks").$type<import("./skyhooks").Skyhook[]>().notNull(),
 checkedAt: timestamp("checked_at", {withTimezone:true}).notNull(),
 sourceAt: timestamp("source_at", {withTimezone:true}).notNull(),
});
