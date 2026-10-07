"use server";

import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/core/auth/dal";
import { getDb, users } from "@/core/db";
import { KEYSTAR_VERSION } from "@/core/version";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { shouldRecordSeen } from "./onboarding";

/**
 * Records that the viewer was shown the welcome tour or What's new for the running version,
 * so neither opens by itself again until the next update. Any signed-in account, guests too;
 * the version is the server's, never the caller's, and only ever raised.
 */
export async function markVersionSeen(): Promise<ActionResult<"signedOut">> {
  const user = await getCurrentUser();
  if (!user) return refused("signedOut");
  if (shouldRecordSeen(user.seenVersion, KEYSTAR_VERSION)) {
    await getDb().update(users).set({ seenVersion: KEYSTAR_VERSION }).where(eq(users.id, user.id));
  }
  return ok;
}
