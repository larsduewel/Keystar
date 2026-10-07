"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit, auditInTx } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { disableOptionalScope, enableOptionalScope, type ScopeSwitchResult } from "@/core/auth/scope-switch";
import { esiTokens, getDb, skillsCharacter, skillsCharacterSkills, skillsImplants, skillsQueue } from "@/core/db";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { SKILLS_CORE_SCOPES, SKILLS_PERMISSIONS, SKILLS_SCOPES } from "@/modules/skills/module";

export type SkillsSharingError = "forbidden" | "notOwned" | "notHeld";

class NotHeld extends Error {}

/**
 * Switches skill sharing (both skills scopes together) off or back on in Keystar without an EVE login; see
 * core/auth/scope-switch.ts. Switching on only works while the token still holds both scopes, otherwise the page
 * links to the EVE login instead. The implants scope follows along where the token holds it (characters that shared
 * before it was added don't).
 */
export async function setSkillsSharing(characterId: number, enabled: boolean): Promise<ActionResult<SkillsSharingError>> {
  const user = await assertPermission(SKILLS_PERMISSIONS.viewOwn).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  try {
    await getDb().transaction(async (tx) => {
      const [token] = await tx
        .select({ scopes: esiTokens.scopes })
        .from(esiTokens)
        .where(eq(esiTokens.characterId, characterId))
        .for("update");
      const before = token?.scopes ?? [];
      const outcomes = new Map<string, ScopeSwitchResult>();
      for (const scope of SKILLS_SCOPES) {
        outcomes.set(
          scope,
          enabled ? await enableOptionalScope(characterId, scope, tx) : await disableOptionalScope(characterId, scope, tx),
        );
      }
      // On: both core scopes, with implants along when the token holds them. Off: whatever of the three it holds.
      const held = enabled ? SKILLS_CORE_SCOPES.every((s) => outcomes.get(s) === "ok") : [...outcomes.values()].some((o) => o === "ok");
      if (!held) throw new NotHeld();
      // Audit only what changed: an already-switched scope reports "ok" too.
      for (const scope of SKILLS_SCOPES) {
        if (outcomes.get(scope) !== "ok" || before.includes(scope) === enabled) continue;
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
    throw err;
  }
  // The worker's planner (every 30 seconds) starts or stops the skills jobs.
  revalidatePath("/", "layout");
  return ok;
}

export type DeleteSkillDataError = "forbidden" | "notOwned" | "stillSharing";

/** Deletes a character's stored skills from Keystar (only once skill sharing is off). */
export async function deleteSkillData(characterId: number): Promise<ActionResult<DeleteSkillDataError>> {
  const user = await assertPermission(SKILLS_PERMISSIONS.viewOwn, SKILLS_PERMISSIONS.viewCorp).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  const db = getDb();
  const [token] = await db.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId));
  if (SKILLS_SCOPES.some((s) => token?.scopes.includes(s))) return refused("stillSharing");
  await db.transaction(async (tx) => {
    await tx.delete(skillsQueue).where(eq(skillsQueue.characterId, characterId));
    await tx.delete(skillsCharacterSkills).where(eq(skillsCharacterSkills.characterId, characterId));
    await tx.delete(skillsImplants).where(eq(skillsImplants.characterId, characterId));
    await tx.delete(skillsCharacter).where(eq(skillsCharacter.characterId, characterId));
  });
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "skills.deleted",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/skills", "layout");
  return ok;
}
