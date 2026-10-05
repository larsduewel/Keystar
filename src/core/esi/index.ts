import { eq, like } from "drizzle-orm";
import { esiCache, getDb, type Db } from "@/core/db";
import { env } from "@/core/env";
import { EsiClient, type EsiCacheStore, type EsiClientStats } from "./client";
import { KEYSTAR_VERSION } from "@/core/version";
import { getAccessToken } from "./tokens";

export * from "./client";

export { KEYSTAR_VERSION } from "@/core/version";

const dbCache: EsiCacheStore = {
  async get(key) {
    const rows = await getDb().select().from(esiCache).where(eq(esiCache.key, key));
    const row = rows[0];
    if (!row) return null;
    return { etag: row.etag, body: row.body, pages: row.pages, expiresAt: row.expiresAt };
  },
  async set(key, entry) {
    const values = {
      key,
      etag: entry.etag,
      body: entry.body as object,
      pages: entry.pages,
      expiresAt: entry.expiresAt,
      updatedAt: new Date(),
    };
    await getDb()
      .insert(esiCache)
      .values(values)
      .onConflictDoUpdate({ target: esiCache.key, set: values });
  },
};

/**
 * Deletes the cached ESI responses read with a character's token (keys start with `${characterId}:`), or only those
 * under `pathPrefix`. For unlinking, transfers and deleted data: the bodies are that owner's private data, and a
 * cached entry would answer the next sync with "not modified" although nothing is stored for the character any more.
 */
export async function forgetCharacterEsiCache(db: Pick<Db, "delete">, characterId: number, pathPrefix = ""): Promise<void> {
  await db.delete(esiCache).where(like(esiCache.key, `${characterId}:GET ${pathPrefix}%`));
}

let client: EsiClient | undefined;

/** Shared ESI client backed by the database cache and stored tokens. */
export function getEsi(): EsiClient {
  if (!client) {
    const e = env();
    client = new EsiClient({
      baseUrl: e.ESI_BASE_URL,
      compatibilityDate: e.ESI_COMPATIBILITY_DATE,
      userAgent: `Keystar/${KEYSTAR_VERSION} (${e.ESI_CONTACT}; +https://github.com/theragus/keystar)`,
      cache: dbCache,
      tokenProvider: getAccessToken,
    });
  }
  return client;
}

/** Counters of the shared client in this process; null when it hasn't been used yet. */
export function esiStats(): EsiClientStats | null {
  return client?.stats() ?? null;
}
