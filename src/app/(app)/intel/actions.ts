"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { getDb, intelScans } from "@/core/db";
import { getI18n } from "@/i18n/server";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { writeBriefing, writeDossier as writeDossierNote, writeDscanRead } from "@/modules/intel/ai/generate";
import { dscanShips, MAX_DSCAN_CHARS } from "@/modules/intel/dscan";
import { nameScanEntities } from "@/modules/intel/names";
import { getScan, profileRemaining, startScan, type StartScanInput } from "@/modules/intel/scans";
import { scanErrorText } from "@/modules/intel/text";

export interface ScanFormState {
  error: string | null;
}

function scanIdFrom(formData: FormData): string {
  const id = String(formData.get("scanId") ?? "");
  if (!SHARE_ID_PATTERN.test(id)) throw new Error("Unknown scan");
  return id;
}

async function start(input: Omit<StartScanInput, "userId" | "userName" | "aiAllowed" | "locale">): Promise<ScanFormState> {
  const user = await assertPermission(INTEL_PERMISSIONS.use);
  const { locale, t } = await getI18n();
  const result = await startScan({
    ...input,
    userId: user.id,
    userName: user.main?.name ?? null,
    aiAllowed: user.can(INTEL_PERMISSIONS.ai),
    locale,
  });
  if (!result.ok) return { error: scanErrorText(t, result.error) };
  after(() => nameScanEntities(result.id, result.naming));
  redirect(`/intel/${result.id}`);
}

/** Scans a pasted pilot list (and optional d-scan) and opens the result. */
export async function createScan(_prev: ScanFormState, formData: FormData): Promise<ScanFormState> {
  const user = await assertPermission(INTEL_PERMISSIONS.use);
  const { t } = await getI18n();
  const dscanText = String(formData.get("dscan") ?? "");
  let dscan = null;
  if (dscanText.trim()) {
    if (dscanText.length > MAX_DSCAN_CHARS) return { error: t.intel.errors.dscanTooLong };
    const parsed = await dscanShips(dscanText, { userId: user.id });
    if (!parsed.lines) return { error: t.intel.errors.notDscan };
    dscan = parsed.ships;
  }
  return start({
    text: String(formData.get("pilots") ?? ""),
    systemName: String(formData.get("system") ?? ""),
    dscan,
  });
}

/** Adds or replaces the scan's d-scan. */
export async function setDscan(_prev: ScanFormState, formData: FormData): Promise<ScanFormState> {
  const user = await assertPermission(INTEL_PERMISSIONS.use);
  const { t } = await getI18n();
  const id = scanIdFrom(formData);
  const text = String(formData.get("dscan") ?? "");
  if (text.length > MAX_DSCAN_CHARS) return { error: t.intel.errors.dscanTooLong };
  const parsed = await dscanShips(text, { userId: user.id });
  if (!parsed.lines) return { error: t.intel.errors.pasteDscan };
  // dscanAt hides d-scan reads of the previous d-scan.
  const now = new Date();
  await getDb().update(intelScans).set({ dscan: parsed.ships, dscanAt: now, updatedAt: now }).where(eq(intelScans.id, id));
  refresh();
  return { error: null };
}

export type IntelActionError = "forbidden" | "notFound" | "notAllowed";

/** The signed-in user if they hold `permission`; null otherwise (the action refuses). */
async function intelUser(permission: string) {
  return assertPermission(permission).catch(() => null);
}

/** Claude's read of who is flying what on the d-scan, in the asker's language. */
export async function readDscan(scanId: string): Promise<ActionResult<IntelActionError>> {
  const user = await intelUser(INTEL_PERMISSIONS.ai);
  if (!user) return refused("forbidden");
  if (!SHARE_ID_PATTERN.test(scanId)) return refused("notFound");
  const { locale } = await getI18n();
  if (!(await writeDscanRead(scanId, { createdBy: user.id, locale }))) return refused("notFound");
  refresh();
  return ok;
}

/** Profiles the pilots of a scan that were skipped (friendlies, very large lists). */
export async function profileScanPilots(scanId: string): Promise<ActionResult<IntelActionError>> {
  if (!(await intelUser(INTEL_PERMISSIONS.use))) return refused("forbidden");
  if (!SHARE_ID_PATTERN.test(scanId)) return refused("notFound");
  await profileRemaining(scanId);
  refresh();
  return ok;
}

/** Deletes a scan (its creator or an intel manager); the page then leaves for /intel. */
export async function deleteScan(scanId: string): Promise<ActionResult<IntelActionError>> {
  const user = await intelUser(INTEL_PERMISSIONS.use);
  if (!user) return refused("forbidden");
  const scan = SHARE_ID_PATTERN.test(scanId) ? await getScan(scanId) : null;
  if (!scan) return refused("notFound");
  if (scan.createdBy !== user.id && !user.can(INTEL_PERMISSIONS.manage)) return refused("notAllowed");
  await getDb().delete(intelScans).where(eq(intelScans.id, scan.id));
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name ?? null,
    action: "intel.scan.delete",
    targetType: "intel_scan",
    targetId: scan.id,
    details: { pilots: scan.pilotCount, createdBy: scan.createdByName },
  });
  // No revalidation: that would render this scan's page again; the button navigates to /intel, which renders fresh.
  return ok;
}

/** Writes the scan's briefing again with the latest data (Claude when configured), in the asker's language. */
export async function rewriteBriefing(scanId: string): Promise<ActionResult<IntelActionError>> {
  const user = await intelUser(INTEL_PERMISSIONS.ai);
  if (!user) return refused("forbidden");
  if (!SHARE_ID_PATTERN.test(scanId)) return refused("notFound");
  const { locale } = await getI18n();
  if (!(await writeBriefing(scanId, { createdBy: user.id, automatic: false, locale }))) return refused("notFound");
  refresh();
  return ok;
}

/** A dossier on one pilot of the scan, in the asker's language. */
export async function writeDossier(scanId: string, characterId: number): Promise<ActionResult<IntelActionError>> {
  const user = await intelUser(INTEL_PERMISSIONS.ai);
  if (!user) return refused("forbidden");
  if (!SHARE_ID_PATTERN.test(scanId) || !Number.isSafeInteger(characterId) || characterId <= 0) return refused("notFound");
  const { locale } = await getI18n();
  if (!(await writeDossierNote(scanId, characterId, { createdBy: user.id, locale }))) return refused("notFound");
  refresh();
  return ok;
}
