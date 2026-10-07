"use server";

import { auditInTx } from "@/core/audit";
import { getDb } from "@/core/db";
import { assertPermission } from "@/core/auth/dal";
import { refreshCorporations } from "@/core/eve/resolver";
import { isSettingValue, setSetting } from "@/core/settings";
import { triggerJobs } from "@/core/sync/scheduler";
import { ok, refused, type ActionResult } from "@/lib/action-result";

/**
 * The setup steps. Each returns a result instead of throwing or redirecting,
 * so the page can explain a refusal in a toast and move on to the next step itself.
 */
export type SetupError = "forbidden" | "invalidCorporation" | "invalidValuation";

async function setupAdmin() {
  return assertPermission("app.settings.manage").catch(() => null);
}

export async function saveSetupCorporation(formData: FormData): Promise<ActionResult<SetupError>> {
  const actor = await setupAdmin();
  if (!actor) return refused("forbidden");
  // The free-text ID field comes after the radio options, so a typed value wins.
  const values = formData
    .getAll("corporationId")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const id = Number(values[values.length - 1]);
  if (!Number.isSafeInteger(id) || id <= 0) return refused("invalidCorporation");
  await refreshCorporations([id]);
  await getDb().transaction(async (tx) => {
    await setSetting("corp.homeCorporationId", id, actor.id, tx);
    await auditInTx(tx, {
      actorUserId: actor.id,
      actorName: actor.main?.name,
      action: "settings.updated",
      details: { source: "setup", homeCorporationId: id },
    });
  });
  // The killboard sync is a global job that may have run (and skipped) before setup: run it now.
  await triggerJobs({ jobKey: "killboard.zkill-sync" });
  return ok;
}

export async function saveSetupAccess(formData: FormData): Promise<ActionResult<SetupError>> {
  const actor = await setupAdmin();
  if (!actor) return refused("forbidden");
  const autoApproveCorpMembers = formData.get("autoApproveCorpMembers") === "on";
  const autoApproveAllianceMembers = formData.get("autoApproveAllianceMembers") === "on";
  const valuationSource = formData.get("valuationSource");
  if (!isSettingValue("mining.valuationSource", valuationSource)) return refused("invalidValuation");
  await getDb().transaction(async (tx) => {
    await setSetting("access.autoApproveCorpMembers", autoApproveCorpMembers, actor.id, tx);
    await setSetting("access.autoApproveAllianceMembers", autoApproveAllianceMembers, actor.id, tx);
    await setSetting("mining.valuationSource", valuationSource, actor.id, tx);
    await auditInTx(tx, {
      actorUserId: actor.id,
      actorName: actor.main?.name,
      action: "settings.updated",
      details: { source: "setup", autoApproveCorpMembers, autoApproveAllianceMembers, valuationSource },
    });
  });
  return ok;
}

export async function finishSetup(): Promise<ActionResult<SetupError>> {
  const actor = await setupAdmin();
  if (!actor) return refused("forbidden");
  await getDb().transaction(async (tx) => {
    await setSetting("setup.completedAt", new Date().toISOString(), actor.id, tx);
    await auditInTx(tx, { actorUserId: actor.id, actorName: actor.main?.name, action: "setup.completed" });
  });
  return ok;
}
