"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/core/auth/dal";
import { appraisals, getDb } from "@/core/db";
import { getI18n } from "@/i18n/server";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { TRADE_PERMISSIONS } from "@/modules/trade/module";
import {
  appraise,
  AppraisalLimitError,
  AppraisalUnavailableError,
  MAX_INPUT_CHARS,
  reserveAppraisalAttempt,
  saveAppraisal,
} from "@/modules/trade/appraisal/appraise";
import { countItemLines, MAX_LINES } from "@/modules/trade/appraisal/parse";

export interface AppraisalFormState {
  error: string | null;
}

/** Appraises pasted items at current Jita prices, saves the snapshot and opens it. */
export async function createAppraisal(_prev: AppraisalFormState, formData: FormData): Promise<AppraisalFormState> {
  const user = await assertPermission(TRADE_PERMISSIONS.appraisal);
  const { t } = await getI18n();
  const errors = t.trade.errors;
  const input = String(formData.get("input") ?? "");
  if (!input.trim()) return { error: errors.empty };
  if (input.length > MAX_INPUT_CHARS) return { error: errors.tooLong(MAX_INPUT_CHARS) };
  const lines = countItemLines(input);
  if (lines > MAX_LINES) return { error: errors.tooManyLines(lines, MAX_LINES) };
  const percent = Math.round(Number(formData.get("percent") ?? 100));
  const pricePercent = Number.isFinite(percent) ? Math.min(200, Math.max(1, percent)) : 100;
  if (!(await reserveAppraisalAttempt(user.id))) return { error: errors.rateLimited };

  let result: Awaited<ReturnType<typeof appraise>>;
  try {
    result = await appraise(input);
  } catch (err) {
    if (err instanceof AppraisalLimitError) return { error: errors.tooManyTypes(err.types, err.max) };
    if (err instanceof AppraisalUnavailableError) return { error: errors.esiUnavailable };
    throw err;
  }
  if (!result.items.length) return { error: errors.noItems };
  const id = await saveAppraisal(result, { input, pricePercent, userId: user.id, userName: user.main?.name ?? null });
  redirect(`/trade/appraisal/${id}`);
}

export type DeleteAppraisalError = "notOwned" | "notFound";

/**
 * Deletes one of the caller's own appraisals; its share link stops working.
 * Returns a result instead of throwing so the button can explain a refusal
 * in a translated toast.
 */
export async function deleteAppraisal(id: string): Promise<ActionResult<DeleteAppraisalError>> {
  const user = await assertPermission(TRADE_PERMISSIONS.appraisal);
  const db = getDb();
  const deleted = await db
    .delete(appraisals)
    .where(and(eq(appraisals.id, id), eq(appraisals.createdBy, user.id)))
    .returning({ id: appraisals.id });
  if (!deleted.length) {
    const [other] = await db.select({ id: appraisals.id }).from(appraisals).where(eq(appraisals.id, id));
    return refused(other ? "notOwned" : "notFound");
  }
  revalidatePath("/trade/appraisal");
  return ok;
}
