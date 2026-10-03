"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { esiTokens, fleetTrackers, getDb } from "@/core/db";
import { triggerJobs } from "@/core/sync/scheduler";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { FLEET_JOB_KEY, FLEET_SCOPE } from "@/modules/fleet/logic";
import { FLEET_PERMISSIONS } from "@/modules/fleet/module";
import { closeFleet } from "@/modules/fleet/sync";

export type FleetActionError = "forbidden" | "notOwned" | "noScope";

/** The signed-in user if they may track fleets with this character, else why not. */
async function ownedCharacter(characterId: number) {
  const user = await assertPermission(FLEET_PERMISSIONS.track).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  return user;
}

/** Starts sharing the fleet this character is in; the worker reads it within seconds. */
export async function startFleetTracking(characterId: number): Promise<ActionResult<FleetActionError>> {
  const user = await ownedCharacter(characterId);
  if ("ok" in user) return user;
  const started = await getDb().transaction(async (tx) => {
    // Same row lock as setOptionalScope, so fleet access can't be switched off between this check and the insert.
    const [token] = await tx
      .select({ scopes: esiTokens.scopes })
      .from(esiTokens)
      .where(eq(esiTokens.characterId, characterId))
      .for("update");
    if (!token?.scopes.includes(FLEET_SCOPE)) return false;
    const now = new Date();
    await tx
      .insert(fleetTrackers)
      .values({ characterId, userId: user.id, status: "tracking", startedAt: now, checkedAt: null })
      .onConflictDoUpdate({
        target: fleetTrackers.characterId,
        set: { userId: user.id, status: "tracking", fleetId: null, startedAt: now, checkedAt: null },
      });
    return true;
  });
  if (!started) return refused("noScope");
  await triggerJobs({ jobKey: FLEET_JOB_KEY, ownerType: "character", ownerId: characterId });
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "fleet.tracking.started",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/fleet");
  return ok;
}

/** Stops sharing; a fleet this character was boss of is closed. */
export async function stopFleetTracking(characterId: number): Promise<ActionResult<FleetActionError>> {
  const user = await ownedCharacter(characterId);
  if ("ok" in user) return user;
  const db = getDb();
  const [tracker] = await db.select().from(fleetTrackers).where(eq(fleetTrackers.characterId, characterId));
  if (!tracker) return ok;
  if (tracker.fleetId && tracker.status === "tracking") await closeFleet(db, tracker.fleetId, new Date());
  await db.update(fleetTrackers).set({ status: "stopped" }).where(eq(fleetTrackers.characterId, characterId));
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "fleet.tracking.stopped",
    targetType: "character",
    targetId: characterId,
    details: tracker.fleetId ? { fleetId: tracker.fleetId } : undefined,
  });
  revalidatePath("/fleet");
  return ok;
}
