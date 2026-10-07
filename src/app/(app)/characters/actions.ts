"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit, auditInTx } from "@/core/audit";
import { assertPermission, getCurrentUser, type CurrentUser } from "@/core/auth/dal";
import { disableOptionalScope, enableOptionalScope } from "@/core/auth/scope-switch";
import { revokeRefreshToken } from "@/core/auth/sso";
import { decryptToken } from "@/core/crypto";
import {
  characters,
  esiTokens,
  fleetTrackers,
  getDb,
  mailLabels,
  mailLists,
  mailMessages,
  miningPnlFeeOverrides,
  syncJobs,
  users,
  walletFees,
  industryJobs,
  marketOrders,
  walletTransactions,
} from "@/core/db";
import { forgetCharacterEsiCache } from "@/core/esi";
import { optionalScopePermission, optionalScopes } from "@/core/modules/registry";
import { triggerJobs } from "@/core/sync/scheduler";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { FLEET_SCOPE } from "@/modules/fleet/logic";

/*
 * Every action returns a result instead of throwing, so the page can confirm
 * or explain it in a translated toast (`ActionForm`).
 */

export type CharacterActionError = "notOwned" | "onlyCharacter";
export type ScopeSwitchError = "forbidden" | "notOwned" | "unknownScope" | "notHeld" | "active";

async function ownedCharacter(characterId: number): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user?.characterIds.includes(characterId) ? user : null;
}

export async function setMainCharacter(characterId: number): Promise<ActionResult<CharacterActionError>> {
  const user = await ownedCharacter(characterId);
  if (!user) return refused("notOwned");
  await getDb().update(users).set({ mainCharacterId: characterId, updatedAt: new Date() }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return ok;
}

export async function syncCharacterNow(characterId: number): Promise<ActionResult<CharacterActionError>> {
  if (!(await ownedCharacter(characterId))) return refused("notOwned");
  await triggerJobs({ ownerType: "character", ownerId: characterId });
  revalidatePath("/characters");
  return ok;
}

/**
 * Unlinks a character, deletes its token and revokes it at CCP. Mining history
 * is kept; the character's imported wallet transactions, mail, industry jobs and
 * market orders are deleted.
 */
export async function removeCharacter(characterId: number): Promise<ActionResult<CharacterActionError>> {
  const user = await ownedCharacter(characterId);
  if (!user) return refused("notOwned");
  if (user.characterIds.length <= 1) return refused("onlyCharacter");
  const db = getDb();
  const [token] = await db.select().from(esiTokens).where(eq(esiTokens.characterId, characterId));
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(characters)
      .where(and(eq(characters.characterId, characterId), eq(characters.userId, user.id)))
      .returning({ characterId: characters.characterId });
    // Industry jobs and market orders have no owner column: delete them only if this account's link was the one
    // removed, so a character that changed hands meanwhile keeps its new owner's jobs and orders.
    if (removed.length) {
      await tx.delete(industryJobs).where(eq(industryJobs.characterId, characterId));
      await tx.delete(marketOrders).where(eq(marketOrders.characterId, characterId));
      await forgetCharacterEsiCache(tx, characterId);
      await tx
        .update(syncJobs)
        .set({ meta: null })
        .where(
          and(
            eq(syncJobs.ownerType, "character"),
            eq(syncJobs.ownerId, characterId),
            inArray(syncJobs.jobKey, ["wallet.character-transactions", "wallet.character-fees"]),
          ),
        );
    }
    // This account's imported data goes in the same transaction, so a crash can't leave it behind to resurface on relink.
    await tx
      .delete(walletTransactions)
      .where(and(eq(walletTransactions.characterId, characterId), eq(walletTransactions.userId, user.id)));
    await tx.delete(walletFees).where(and(eq(walletFees.characterId, characterId), eq(walletFees.userId, user.id)));
    await tx
      .delete(miningPnlFeeOverrides)
      .where(and(eq(miningPnlFeeOverrides.characterId, characterId), eq(miningPnlFeeOverrides.userId, user.id)));
    await tx.delete(mailMessages).where(and(eq(mailMessages.characterId, characterId), eq(mailMessages.userId, user.id)));
    await tx.delete(mailLabels).where(and(eq(mailLabels.characterId, characterId), eq(mailLabels.userId, user.id)));
    await tx.delete(mailLists).where(and(eq(mailLists.characterId, characterId), eq(mailLists.userId, user.id)));
  });
  if (user.main?.characterId === characterId) {
    const next = user.characterIds.find((id) => id !== characterId) ?? null;
    await db.update(users).set({ mainCharacterId: next }).where(eq(users.id, user.id));
  }
  if (token) {
    try {
      await revokeRefreshToken(decryptToken(token.refreshTokenEnc));
    } catch {
      // Revocation is best effort; the token is deleted locally either way.
    }
  }
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "character.removed",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/", "layout");
  return ok;
}

/**
 * Switches an opt-in scope (fleet, wallet import, mail) off or back on in
 * Keystar without an EVE login; see core/auth/scope-switch.ts. Switching on
 * only works while the token still holds the scope, otherwise the page links
 * to the EVE login instead.
 */
export async function setOptionalScope(
  characterId: number,
  scope: string,
  enabled: boolean,
): Promise<ActionResult<ScopeSwitchError>> {
  if (!optionalScopes().includes(scope)) return refused("unknownScope");
  // The module's own permission, as on the page that offers the switch.
  const permission = optionalScopePermission(scope);
  if (permission && !(await assertPermission(permission).catch(() => null))) return refused("forbidden");
  const user = await ownedCharacter(characterId);
  if (!user) return refused("notOwned");
  const outcome = await getDb().transaction(async (tx) => {
    // Lock the token row: startFleetTracking takes the same lock, so tracking can't start between the check and the switch.
    await tx.select({ id: esiTokens.characterId }).from(esiTokens).where(eq(esiTokens.characterId, characterId)).for("update");
    if (!enabled && scope === FLEET_SCOPE) {
      // Stop sharing first, so a fleet isn't left open without anyone reading it.
      const [tracker] = await tx
        .select({ status: fleetTrackers.status })
        .from(fleetTrackers)
        .where(eq(fleetTrackers.characterId, characterId));
      if (tracker?.status === "tracking" || tracker?.status === "not_boss") return "active" as const;
    }
    const result = enabled ? await enableOptionalScope(characterId, scope, tx) : await disableOptionalScope(characterId, scope, tx);
    if (result === "ok") {
      await auditInTx(tx, {
        actorUserId: user.id,
        actorName: user.main?.name,
        action: enabled ? "esi.scope.enabled" : "esi.scope.disabled",
        targetType: "character",
        targetId: characterId,
        details: { scope },
      });
    }
    return result;
  });
  if (outcome !== "ok") return refused(outcome);
  // The worker's planner (every 30 seconds) starts or stops the scope's background jobs.
  revalidatePath("/", "layout");
  return ok;
}
