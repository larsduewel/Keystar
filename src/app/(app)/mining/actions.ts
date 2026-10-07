"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { esiTokens, getDb, miningActivity, miningActivityCoverage, miningCharacterLedger } from "@/core/db";
import { forgetCharacterEsiCache } from "@/core/esi";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { MINING_LEDGER_SCOPE, MINING_PERMISSIONS } from "@/modules/mining/module";

/*
 * Switching the mining ledger on and off uses the generic `setOptionalScope` (characters/actions.ts); only deleting
 * the stored ledger is mining's own.
 */

export type DeleteMiningDataError = "forbidden" | "notOwned" | "stillEnabled";

class NotOwned extends Error {}
class StillEnabled extends Error {}

/**
 * Deletes a character's stored personal mining ledger and the mining activity measured from it (only once the ledger
 * is switched off). Moon-drill records of corporation refineries stay: they belong to the corporation.
 */
export async function deleteMiningData(characterId: number): Promise<ActionResult<DeleteMiningDataError>> {
  const user = await assertPermission(MINING_PERMISSIONS.viewOwn).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  try {
    await getDb().transaction(async (tx) => {
      // The ownership check above happened before the transaction; a transfer to another account may have landed since.
      const [owner] = await tx.execute<{ user_id: string }>(
        sql`SELECT user_id FROM characters WHERE character_id = ${characterId} FOR SHARE`,
      );
      if (owner?.user_id !== user.id) throw new NotOwned();
      // The token lock waits for a sync that is writing, which then sees the ledger off and won't write again.
      const [token] = await tx.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId)).for("update");
      if (token?.scopes.includes(MINING_LEDGER_SCOPE)) throw new StillEnabled();
      await tx.delete(miningCharacterLedger).where(eq(miningCharacterLedger.characterId, characterId));
      await tx.delete(miningActivity).where(eq(miningActivity.characterId, characterId));
      await tx.delete(miningActivityCoverage).where(eq(miningActivityCoverage.characterId, characterId));
      // The cached ESI copy is the same data; a sync after switching back on would skip it as already applied.
      await forgetCharacterEsiCache(tx, characterId, `/characters/${characterId}/mining`);
    });
  } catch (err) {
    if (err instanceof StillEnabled) return refused("stillEnabled");
    if (err instanceof NotOwned) return refused("notOwned");
    throw err;
  }
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "mining.deleted",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/mining", "layout");
  return ok;
}
