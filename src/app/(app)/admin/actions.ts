"use server";

import { refresh, revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { changeUserAccess, UserAccessError, type UserAccessErrorCode } from "@/core/auth/manage-users";
import { refreshCorporations } from "@/core/eve/resolver";
import { allPermissions } from "@/core/modules/registry";
import { isRole, type Role } from "@/core/rbac/roles";
import { getSettings, setSetting, type Settings } from "@/core/settings";
import { triggerJobs } from "@/core/sync/scheduler";
import { ok, refused, type ActionResult } from "@/lib/action-result";

export type RoleChangeResult = { ok: true; from: Role } | { ok: false; error: UserAccessErrorCode | "changed" };

/**
 * Returns a result instead of throwing so the role picker can show a translated
 * message and put the previous role back. The lockout guards live in `changeUserAccess`.
 * `expected` is the role the page showed: if someone changed it since (or an old
 * Undo comes in late), nothing is overwritten. Every refusal refreshes the page,
 * since it usually means the page is out of date.
 */
export async function updateUserRole(userId: string, role: Role, expected: Role): Promise<RoleChangeResult> {
  const actor = await assertPermission("users.manage").catch(() => null);
  if (!actor) {
    refresh();
    return { ok: false, error: "forbidden" };
  }
  if (!isRole(role) || !isRole(expected)) throw new Error("Unknown role");
  if (actor.id === userId) return { ok: false, error: "self" };
  let from: Role;
  try {
    const result = await changeUserAccess(actor.id, userId, { role }, { onlyFromRole: expected });
    if (!result.changed) {
      refresh();
      return { ok: false, error: "changed" };
    }
    from = result.from;
  } catch (err) {
    if (!(err instanceof UserAccessError)) throw err;
    refresh();
    return { ok: false, error: err.code };
  }
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "user.role.changed",
    targetType: "user",
    targetId: userId,
    details: { from, to: role },
  });
  revalidatePath("/admin/users");
  return { ok: true, from };
}

export type UserActionError = UserAccessErrorCode | "changed";

/** Approves a guest; returns a result for the toast (see `ActionForm`). */
export async function approveUser(userId: string): Promise<ActionResult<UserActionError>> {
  const actor = await assertPermission("users.manage").catch(() => null);
  if (!actor) return refused("forbidden");
  if (actor.id === userId) return refused("self");
  try {
    const { changed } = await changeUserAccess(actor.id, userId, { role: "member" }, { onlyFromRole: "guest" });
    if (!changed) {
      refresh();
      return refused("changed");
    }
  } catch (err) {
    if (!(err instanceof UserAccessError)) throw err;
    return refused(err.code);
  }
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "user.approved",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath("/admin/users");
  return ok;
}

export async function setUserDisabled(userId: string, disabled: boolean): Promise<ActionResult<UserActionError>> {
  const actor = await assertPermission("users.manage").catch(() => null);
  if (!actor) return refused("forbidden");
  if (actor.id === userId) return refused("self");
  try {
    await changeUserAccess(actor.id, userId, { isDisabled: disabled });
  } catch (err) {
    if (!(err instanceof UserAccessError)) throw err;
    return refused(err.code);
  }
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: disabled ? "user.disabled" : "user.enabled",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath("/admin/users");
  return ok;
}

export type SyncActionError = "forbidden" | "notFound";

export async function triggerSyncJob(jobId: number): Promise<ActionResult<SyncActionError>> {
  const actor = await assertPermission("sync.trigger").catch(() => null);
  if (!actor) return refused("forbidden");
  const [job] = await triggerJobs({ id: jobId });
  if (!job) {
    refresh();
    return refused("notFound");
  }
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "sync.triggered",
    targetType: "sync_job",
    targetId: job.id,
    details: { job: job.jobKey, ownerType: job.ownerType, ownerId: job.ownerId },
  });
  revalidatePath("/admin/sync");
  return ok;
}

export async function triggerAllSyncJobs(): Promise<ActionResult<SyncActionError>> {
  const actor = await assertPermission("sync.trigger").catch(() => null);
  if (!actor) return refused("forbidden");
  await triggerJobs({});
  await audit({ actorUserId: actor.id, actorName: actor.main?.name, action: "sync.triggered.all" });
  revalidatePath("/admin/sync");
  return ok;
}

export async function setSyncPaused(paused: boolean): Promise<ActionResult<SyncActionError>> {
  const actor = await assertPermission("app.settings.manage").catch(() => null);
  if (!actor) return refused("forbidden");
  await setSetting("sync.paused", paused, actor.id);
  await audit({ actorUserId: actor.id, actorName: actor.main?.name, action: paused ? "sync.paused" : "sync.resumed" });
  revalidatePath("/admin/sync");
  return ok;
}

export type SettingsSaveResult =
  | { ok: true; homeChanged: boolean }
  | { ok: false; error: "forbidden" | "invalidCorporation" };

/** Returns a result instead of throwing so the settings page can confirm or explain in a toast. */
export async function saveSettings(formData: FormData): Promise<SettingsSaveResult> {
  const actor = await assertPermission("app.settings.manage").catch(() => null);
  if (!actor) {
    refresh();
    return { ok: false, error: "forbidden" };
  }
  const before = await getSettings();

  const corpRaw = String(formData.get("homeCorporationId") ?? "").trim();
  const homeCorporationId = corpRaw ? Number(corpRaw) : null;
  if (homeCorporationId !== null && (!Number.isSafeInteger(homeCorporationId) || homeCorporationId <= 0)) {
    return { ok: false, error: "invalidCorporation" };
  }

  const valuationSource = String(formData.get("valuationSource")) as Settings["mining.valuationSource"];
  const valuationMode = String(formData.get("valuationMode")) as Settings["mining.valuationMode"];

  const overrides: Record<string, Role> = {};
  for (const def of allPermissions()) {
    if (def.locked) continue;
    const value = formData.get(`perm:${def.key}`);
    if (isRole(value) && value !== def.defaultMinRole) overrides[def.key] = value;
  }

  await setSetting("corp.homeCorporationId", homeCorporationId, actor.id);
  await setSetting("access.autoApproveCorpMembers", formData.get("autoApproveCorpMembers") === "on", actor.id);
  await setSetting("access.autoApproveAllianceMembers", formData.get("autoApproveAllianceMembers") === "on", actor.id);
  await setSetting("mining.valuationSource", valuationSource, actor.id);
  await setSetting("mining.valuationMode", valuationMode, actor.id);
  await setSetting("permissions.overrides", overrides, actor.id);
  const homeChanged = homeCorporationId !== null && homeCorporationId !== before["corp.homeCorporationId"];
  if (homeChanged) {
    await refreshCorporations([homeCorporationId]);
    // Import the new home corporation's killboard now instead of at the next hourly run.
    await triggerJobs({ jobKey: "killboard.zkill-sync" });
  }

  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "settings.updated",
    details: {
      homeCorporationId,
      valuationSource,
      valuationMode,
      overrides: Object.keys(overrides).length,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, homeChanged };
}
