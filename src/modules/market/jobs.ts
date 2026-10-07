import { and, eq, notInArray, sql } from "drizzle-orm";
import { characters, esiTokens } from "@/core/db";
import { ensureNames, ensureTypes } from "@/core/eve/resolver";
import type { JobDefinition } from "@/core/sync/types";
import { ensureIndustryLocations } from "@/modules/industry/jobs";
import { MARKET_SCOPES } from "./module";
import { orderRows, type EsiMarketOrder, type EsiMarketOrderHistory } from "./orders";
import { marketOrders } from "./schema";

const CHUNK = 500;

export const characterMarketOrdersJob: JobDefinition = {
  key: "market.character-orders",
  label: (t) => t.market.module.jobs.characterOrders,
  module: "market",
  owner: "character",
  // Both scopes: the access page turns them on together, and a token holding only one is not "enabled".
  requiredScopes: [...MARKET_SCOPES],
  // ESI caches the open orders for 20 minutes (the history for an hour).
  intervalSeconds: 1200,
  async run({ esi, db, characterId }) {
    const id = characterId!;
    // Whose character this is at the start (a transfer to another account meanwhile must not get this snapshot), and
    // whether access is still on: switching it off promises to stop reading at once, and the planner only disables
    // this schedule on its next pass.
    const [owner] = await db
      .select({ userId: characters.userId, status: esiTokens.status, scopes: esiTokens.scopes })
      .from(characters)
      .leftJoin(esiTokens, eq(esiTokens.characterId, characters.characterId))
      .where(eq(characters.characterId, id));
    if (!owner) return { summary: "Character is no longer linked" };
    if (owner.status !== "active" || !MARKET_SCOPES.every((s) => owner.scopes?.includes(s))) {
      return { summary: "Market access is switched off" };
    }
    const open = await esi.get<EsiMarketOrder[]>(`/characters/${id}/orders`, { characterId: id });
    const history = await esi.getAllPages<EsiMarketOrderHistory>(`/characters/${id}/orders/history`, { characterId: id });
    const now = new Date();
    const rows = orderRows(id, open.data, history.data, now);
    const openIds = rows.filter((r) => r.state === "open").map((r) => r.orderId);
    // Written on every run, also when ESI answers "not modified" (see industry.character-jobs); unchanged rows are
    // skipped by the upsert's condition.
    const stillLinked = await db.transaction(async (tx) => {
      // Unlinking or transferring the character meanwhile deletes its orders, and switching access off (then deleting
      // the stored orders) must stay deleted; the share locks make those actions wait for this write, or this write
      // see them.
      const [current] = await tx.execute<{ user_id: string }>(
        sql`SELECT user_id FROM characters WHERE character_id = ${id} FOR SHARE`,
      );
      if (current?.user_id !== owner.userId) return false;
      const [token] = await tx.execute<{ status: string; scopes: string[] }>(
        sql`SELECT status, scopes FROM esi_tokens WHERE character_id = ${id} FOR SHARE`,
      );
      if (token?.status !== "active" || !MARKET_SCOPES.every((s) => token.scopes.includes(s))) return false;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx
          .insert(marketOrders)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: marketOrders.orderId,
            set: {
              characterId: sql`excluded.character_id`,
              price: sql`excluded.price`,
              volumeTotal: sql`excluded.volume_total`,
              volumeRemain: sql`excluded.volume_remain`,
              minVolume: sql`excluded.min_volume`,
              escrow: sql`excluded.escrow`,
              range: sql`excluded.range`,
              duration: sql`excluded.duration`,
              issued: sql`excluded.issued`,
              state: sql`excluded.state`,
              // Open again (it was only presumed closed), or closed now: noticed at this run unless noticed before.
              closedAt: sql`CASE WHEN excluded.state = 'open' THEN NULL
                ELSE COALESCE(${marketOrders.closedAt}, CASE WHEN ${marketOrders.state} = 'open' THEN excluded.updated_at END) END`,
              updatedAt: sql`excluded.updated_at`,
            },
            // A cancelled or expired order is final; anything else is only rewritten when it changed.
            setWhere: sql`${marketOrders.state} NOT IN ('cancelled', 'expired')
              AND (${marketOrders.state}, ${marketOrders.price}, ${marketOrders.volumeRemain}, ${marketOrders.escrow}, ${marketOrders.issued},
                  ${marketOrders.duration})
                IS DISTINCT FROM (excluded.state, excluded.price, excluded.volume_remain, excluded.escrow, excluded.issued,
                  excluded.duration)`,
          });
      }
      // Gone from the open list and not (yet) in the history: filled, or closed in game since the history was read.
      await tx
        .update(marketOrders)
        .set({ state: "closed", closedAt: now, updatedAt: now })
        .where(and(eq(marketOrders.characterId, id), eq(marketOrders.state, "open"), notInArray(marketOrders.orderId, openIds)));
      return true;
    });
    if (!stillLinked) return { summary: "Character changed owner or switched market access off during the sync" };
    await ensureTypes(rows.map((r) => r.typeId));
    await ensureNames(rows.map((r) => r.regionId));
    await ensureIndustryLocations(esi, db, id, rows.map((r) => r.locationId));
    return {
      summary: `${openIds.length} open order${openIds.length === 1 ? "" : "s"}, ${rows.length} listed${open.notModified && history.notModified ? " (unchanged)" : ""}`,
      nextRunAt: open.expiresAt,
    };
  },
};

export const marketJobs: JobDefinition[] = [characterMarketOrdersJob];
