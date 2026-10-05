"use server";

import { refresh, revalidatePath } from "next/cache";
import { audit, auditInTx } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { changeUserAccess, outsideGuestIds, UserAccessError, type UserAccessErrorCode } from "@/core/auth/manage-users";
import { getDb } from "@/core/db";
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
    const result = await changeUserAccess(
      actor.id,
      userId,
      { role },
      {
        onlyFromRole: expected,
        audit: (from) => ({
          actorUserId: actor.id,
          actorName: actor.main?.name,
          action: "user.role.changed",
          targetType: "user",
          targetId: userId,
          details: { from, to: role },
        }),
      },
    );
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
    const { changed } = await changeUserAccess(
      actor.id,
      userId,
      { role: "member" },
      {
        onlyFromRole: "guest",
        audit: () => ({ actorUserId: actor.id, actorName: actor.main?.name, action: "user.approved", targetType: "user", targetId: userId }),
      },
    );
    if (!changed) {
      refresh();
      return refused("changed");
    }
  } catch (err) {
    if (!(err instanceof UserAccessError)) throw err;
    return refused(err.code);
  }
  revalidatePath("/admin/users");
  return ok;
}

export async function setUserDisabled(userId: string, disabled: boolean): Promise<ActionResult<UserActionError>> {
  const actor = await assertPermission("users.manage").catch(() => null);
  if (!actor) return refused("forbidden");
  if (actor.id === userId) return refused("self");
  try {
    await changeUserAccess(
      actor.id,
      userId,
      { isDisabled: disabled },
      {
        audit: () => ({
          actorUserId: actor.id,
          actorName: actor.main?.name,
          action: disabled ? "user.disabled" : "user.enabled",
          targetType: "user",
          targetId: userId,
        }),
      },
    );
  } catch (err) {
    if (!(err instanceof UserAccessError)) throw err;
    return refused(err.code);
  }
  revalidatePath("/admin/users");
  return ok;
}

/**
 * Disables every guest account outside the corporation, for when sign-ups were
 * restricted to members after outsiders had already registered. Only accounts
 * still waiting as guests are touched: anyone approved or promoted in the
 * meantime stays as they are. Disabling keeps the account and can be undone.
 */
export async function disableOutsideGuests(): Promise<ActionResult<"forbidden" | "notRestricted">> {
  const actor = await assertPermission("users.manage").catch(() => null);
  if (!actor) return refused("forbidden");
  // The panel only shows while sign-ups are restricted; a page left open since then mustn't still clear guests.
  if (!(await getSettings())["access.restrictToMembers"]) {
    refresh();
    return refused("notRestricted");
  }
  for (const userId of await outsideGuestIds()) {
    if (userId === actor.id) continue;
    try {
      await changeUserAccess(
        actor.id,
        userId,
        { isDisabled: true },
        {
          onlyFromRole: "guest",
          audit: () => ({
            actorUserId: actor.id,
            actorName: actor.main?.name,
            action: "user.disabled",
            targetType: "user",
            targetId: userId,
            details: { reason: "outsideCorporation" },
          }),
        },
      );
    } catch (err) {
      if (!(err instanceof UserAccessError)) throw err;
      if (err.code === "forbidden") return refused("forbidden");
    }
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin/settings");
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
  await getDb().transaction(async (tx) => {
    await setSetting("sync.paused", paused, actor.id, tx);
    await auditInTx(tx, { actorUserId: actor.id, actorName: actor.main?.name, action: paused ? "sync.paused" : "sync.resumed" });
  });
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

  await getDb().transaction(async (tx) => {
    await setSetting("corp.homeCorporationId", homeCorporationId, actor.id, tx);
    await setSetting("access.autoApproveCorpMembers", formData.get("autoApproveCorpMembers") === "on", actor.id, tx);
    await setSetting("access.autoApproveAllianceMembers", formData.get("autoApproveAllianceMembers") === "on", actor.id, tx);
    await setSetting("access.restrictToMembers", formData.get("restrictToMembers") === "on", actor.id, tx);
    await setSetting("mining.valuationSource", valuationSource, actor.id, tx);
    await setSetting("mining.valuationMode", valuationMode, actor.id, tx);
    await setSetting("permissions.overrides", overrides, actor.id, tx);
    await auditInTx(tx, {
      actorUserId: actor.id,
      actorName: actor.main?.name,
      action: "settings.updated",
      details: {
        homeCorporationId,
        restrictToMembers: formData.get("restrictToMembers") === "on",
        valuationSource,
        valuationMode,
        overrides: Object.keys(overrides).length,
      },
    });
  });
  const homeChanged = homeCorporationId !== null && homeCorporationId !== before["corp.homeCorporationId"];
  if (homeChanged) {
    await refreshCorporations([homeCorporationId]);
    // Import the new home corporation's killboard now instead of at the next hourly run.
    await triggerJobs({ jobKey: "killboard.zkill-sync" });
  }
  revalidatePath("/", "layout");
  return { ok: true, homeChanged };
}

/**
 * Records a support package download in the audit log. The browser saves the
 * package the admin previewed (System Info), so this only receives its name.
 */
export async function recordSupportPackageDownload(filename: string): Promise<ActionResult<"forbidden">> {
  const actor = await assertPermission("system.view").catch(() => null);
  if (!actor) return refused("forbidden");
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "system.support_package",
    details: { filename: /^keystar-support-[\w.-]{1,80}\.json$/.test(filename) ? filename : "unknown" },
  });
  return ok;
}
