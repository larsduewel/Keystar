import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/core/env";
import * as core from "./schema/core";
import * as eve from "./schema/eve";
import * as sync from "./schema/sync";
import * as fleet from "@/modules/fleet/schema";
import * as gatecheck from "@/modules/gatecheck/schema";
import * as industry from "@/modules/industry/schema";
import * as intel from "@/modules/intel/schema";
import * as killboard from "@/modules/killboard/schema";
import * as map from "@/modules/map/schema";
import * as market from "@/modules/market/schema";
import * as mining from "@/modules/mining/schema";
import * as skills from "@/modules/skills/schema";
import * as social from "@/modules/social/schema";
import * as trade from "@/modules/trade/schema";
import * as wallet from "@/modules/wallet/schema";

export const schema = { ...core, ...eve, ...map, ...sync, ...mining, ...killboard, ...fleet, ...trade, ...intel, ...wallet, ...social, ...skills, ...industry, ...gatecheck, ...market };

export type Db = PostgresJsDatabase<typeof schema>;

type DbHolder = { client: postgres.Sql; db: Db };

// Survive Next.js dev hot reloads without leaking connection pools.
const globalForDb = globalThis as unknown as { __keystarDb?: DbHolder };

function create(): DbHolder {
  const client = postgres(env().DATABASE_URL, {
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    onnotice: () => {},
  });
  return { client, db: drizzle(client, { schema }) };
}

function holder(): DbHolder {
  if (!globalForDb.__keystarDb) globalForDb.__keystarDb = create();
  return globalForDb.__keystarDb;
}

/** Lazily-initialised Drizzle instance. */
export function getDb(): Db {
  return holder().db;
}

export function getSqlClient(): postgres.Sql {
  return holder().client;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__keystarDb) {
    await globalForDb.__keystarDb.client.end({ timeout: 5 });
    globalForDb.__keystarDb = undefined;
  }
}

export * from "./schema/core";
export * from "./schema/eve";
export * from "./schema/sync";
export * from "@/modules/mining/schema";
export * from "@/modules/killboard/schema";
export * from "@/modules/fleet/schema";
export * from "@/modules/gatecheck/schema";
export * from "@/modules/trade/schema";
export * from "@/modules/intel/schema";
export * from "@/modules/wallet/schema";
export * from "@/modules/social/schema";
export * from "@/modules/skills/schema";
export * from "@/modules/industry/schema";

export * from "@/modules/map/schema";
export * from "@/modules/market/schema";
