"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { getSetting } from "@/core/settings";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { KILLBOARD_PERMISSIONS } from "@/modules/killboard/module";
import { generateSituationReport } from "@/modules/killboard/report/generate";

export type RewriteReportError = "forbidden" | "noCorporation";

/**
 * Rewrites the current week's situation report now (a single Claude call when
 * configured). When Claude fails the template is used and the report panel
 * says why.
 */
export async function rewriteSituationReport(): Promise<ActionResult<RewriteReportError>> {
  const actor = await assertPermission(KILLBOARD_PERMISSIONS.manage).catch(() => null);
  if (!actor) return refused("forbidden");
  const corporationId = await getSetting("corp.homeCorporationId");
  if (!corporationId) return refused("noCorporation");
  const out = await generateSituationReport(getDb(), corporationId, new Date(), { force: true });
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "killboard.report.rewritten",
    details: { from: out.week.from, to: out.week.to, source: out.source, error: out.error ?? null },
  });
  revalidatePath("/killboard");
  return ok;
}
