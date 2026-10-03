"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { esiTokens, getDb, mailLabels, mailLists, mailMessages } from "@/core/db";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { MAIL_SCOPE, SOCIAL_PERMISSIONS } from "@/modules/social/module";

export type DeleteDataError = "forbidden" | "notOwned" | "stillImporting";

/** Deletes a character's imported mail from Keystar (only once mail access has been removed). */
export async function deleteMailData(characterId: number): Promise<ActionResult<DeleteDataError>> {
  const user = await assertPermission(SOCIAL_PERMISSIONS.mail).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  const db = getDb();
  const [token] = await db.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId));
  if (token?.scopes.includes(MAIL_SCOPE)) return refused("stillImporting");
  await db.transaction(async (tx) => {
    await tx.delete(mailMessages).where(and(eq(mailMessages.characterId, characterId), eq(mailMessages.userId, user.id)));
    await tx.delete(mailLabels).where(and(eq(mailLabels.characterId, characterId), eq(mailLabels.userId, user.id)));
    await tx.delete(mailLists).where(and(eq(mailLists.characterId, characterId), eq(mailLists.userId, user.id)));
  });
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "mail.deleted",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/mail");
  return ok;
}
