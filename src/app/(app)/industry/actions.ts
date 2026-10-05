"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit, auditInTx } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { disableOptionalScope, enableOptionalScope } from "@/core/auth/scope-switch";
import { esiTokens, getDb, industryJobs, type Db } from "@/core/db";
import { forgetCharacterEsiCache } from "@/core/esi";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { INDUSTRY_PERMISSIONS, INDUSTRY_SCOPES } from "@/modules/industry/module";

export type IndustryAccessError = "forbidden" | "notOwned" | "notHeld";

class NotHeld extends Error {}
class NotOwned extends Error {}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Re-checks, under a share lock on the character row, that the character still belongs to `userId`: the check on
 * `user.characterIds` happened before the transaction, and a transfer to another account may have landed since.
 */
async function lockOwnedCharacter(tx: Tx, characterId: number, userId: string): Promise<void> {
  const [row] = await tx.execute<{ user_id: string }>(sql`SELECT user_id FROM characters WHERE character_id = ${characterId} FOR SHARE`);
  if (row?.user_id !== userId) throw new NotOwned();
}

/**
 * Switches industry access (both industry scopes together) off or back on in Keystar without an EVE login; see
 * core/auth/scope-switch.ts. Switching on only works while the token still holds both scopes, otherwise the page
 * links to the EVE login instead.
 */
export async function setIndustryAccess(characterId: number, enabled: boolean): Promise<ActionResult<IndustryAccessError>> {
  const user = await assertPermission(INDUSTRY_PERMISSIONS.viewOwn).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  try {
    await getDb().transaction(async (tx) => {
      await lockOwnedCharacter(tx, characterId, user.id);
      await tx.select({ id: esiTokens.characterId }).from(esiTokens).where(eq(esiTokens.characterId, characterId)).for("update");
      const outcomes = [];
      for (const scope of INDUSTRY_SCOPES) {
        outcomes.push(enabled ? await enableOptionalScope(characterId, scope, tx) : await disableOptionalScope(characterId, scope, tx));
      }
      // On: both scopes or neither. Off: a partly enabled character only holds one of them.
      if (enabled ? outcomes.some((o) => o !== "ok") : outcomes.every((o) => o !== "ok")) throw new NotHeld();
      for (const scope of INDUSTRY_SCOPES) {
        await auditInTx(tx, {
          actorUserId: user.id,
          actorName: user.main?.name,
          action: enabled ? "esi.scope.enabled" : "esi.scope.disabled",
          targetType: "character",
          targetId: characterId,
          details: { scope },
        });
      }
    });
  } catch (err) {
    if (err instanceof NotHeld) return refused("notHeld");
    if (err instanceof NotOwned) return refused("notOwned");
    throw err;
  }
  // The worker's planner (every 30 seconds) starts or stops the industry job.
  revalidatePath("/", "layout");
  return ok;
}

export type DeleteIndustryDataError = "forbidden" | "notOwned" | "stillEnabled";

class StillEnabled extends Error {}

/** Deletes a character's stored industry jobs from Keystar (only once industry access is off). */
export async function deleteIndustryData(characterId: number): Promise<ActionResult<DeleteIndustryDataError>> {
  const user = await assertPermission(INDUSTRY_PERMISSIONS.viewOwn).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  try {
    await getDb().transaction(async (tx) => {
      await lockOwnedCharacter(tx, characterId, user.id);
      // The token lock waits for a sync that is writing, which then sees access off and won't write again.
      const [token] = await tx.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId)).for("update");
      if (INDUSTRY_SCOPES.some((s) => token?.scopes.includes(s))) throw new StillEnabled();
      await tx.delete(industryJobs).where(eq(industryJobs.characterId, characterId));
      // The cached ESI copy is the same data, and would answer the next sync with "not modified".
      await forgetCharacterEsiCache(tx, characterId, `/characters/${characterId}/industry/`);
    });
  } catch (err) {
    if (err instanceof StillEnabled) return refused("stillEnabled");
    if (err instanceof NotOwned) return refused("notOwned");
    throw err;
  }
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "industry.deleted",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/industry", "layout");
  return ok;
}
