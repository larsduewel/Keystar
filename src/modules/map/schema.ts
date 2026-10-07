import { bigint, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
/** Durable, deduplicated work shared by web processes and the name-resolution worker. */
export const mapNameQueue = pgTable("map_name_queue", {
 id: bigint("id",{mode:"number"}).notNull(),
 kind: text("kind").$type<"character"|"type">().notNull(),
}, t=>[primaryKey({columns:[t.id,t.kind]})]);
