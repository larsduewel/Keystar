"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertPermission, type CurrentUser } from "@/core/auth/dal";
import {
  esiTokens,
  eveGroups,
  eveTypes,
  getDb,
  miningPnlCharacters,
  miningPnlEntries,
  miningPnlFeeOverrides,
  miningPnlPriceRules,
  miningPnlSettings,
  miningPnlTxOverrides,
  syncJobs,
  walletFees,
  walletTransactions,
} from "@/core/db";
import { getSettings } from "@/core/settings";
import { isValidIsoDate } from "@/lib/dates";
import { parseLocaleNumber } from "@/modules/mining/estimator/parse";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { miningValuation } from "@/modules/mining/page-context";
import { classifyPurchase, classifySale, isExpenseCategory, isIncomeCategory } from "@/modules/mining/pnl/categories";
import { parsePnlFilters } from "@/modules/mining/pnl/filters";
import { getFees, getPurchases, getSales, type WalletSide } from "@/modules/mining/pnl/queries";
import { isIncomeSource, pnlScope } from "@/modules/mining/pnl/scope";
import { SPREAD_DAYS } from "@/modules/mining/pnl/spread";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { WALLET_SCOPE } from "@/modules/wallet/module";

/**
 * Mining P&L mutations. Every action checks the permission itself and only
 * touches rows of the signed-in account and its own characters; ids bound
 * from the page are validated like any other input. Refusals come back as
 * codes the page shows in a toast (`ActionForm`).
 */

export type PnlActionError =
  | "forbidden"
  | "notOwned"
  | "notFound"
  | "invalidRate"
  | "invalidSource"
  | "invalidPrice"
  | "invalidDate"
  | "invalidRange"
  | "invalidAmount"
  | "invalidCategory"
  | "invalidSpread"
  | "unknownType"
  | "salesTaxFollowsSale";

export type PnlActionResult = ActionResult<PnlActionError>;

class Refusal extends Error {
  constructor(readonly code: PnlActionError) {
    super(code);
  }
}

function refuse(code: PnlActionError): never {
  throw new Refusal(code);
}

async function pnlUser(): Promise<CurrentUser> {
  return assertPermission(MINING_PERMISSIONS.pnl);
}

/** Runs a change for the signed-in user and refreshes the P&L pages; a `refuse()` inside becomes the result. */
async function change(run: (user: CurrentUser) => Promise<void>): Promise<PnlActionResult> {
  const user = await pnlUser().catch(() => null);
  if (!user) return refused("forbidden");
  try {
    await run(user);
  } catch (error) {
    if (error instanceof Refusal) return refused(error.code);
    throw error;
  }
  revalidate();
  return ok;
}

function ownCharacter(user: CurrentUser, value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || !user.characterIds.includes(id)) refuse("notOwned");
  return id;
}

function positiveId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) refuse("notFound");
  return id;
}

/** ISK input in English or German notation, with an optional k/m/b suffix ("5.4b", "1.234,5"). */
function parseAmount(value: FormDataEntryValue | null): number {
  const s = String(value ?? "").trim().toLowerCase().replace(/isk$/, "").trim();
  const suffix = s.match(/[kmb]$/)?.[0];
  const n = parseLocaleNumber(suffix ? s.slice(0, -1) : s);
  if (n === null) return NaN;
  return n * (suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1);
}

function optionalDate(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (!isValidIsoDate(s)) refuse("invalidDate");
  return s;
}

function revalidate() {
  revalidatePath("/mining/pnl", "layout");
}

export async function setIncomeRate(formData: FormData): Promise<PnlActionResult> {
  return change(async (user) => {
    const rate = parseAmount(formData.get("rate"));
    if (!(rate > 0 && rate <= 1000)) refuse("invalidRate");
    await getDb()
      .insert(miningPnlSettings)
      .values({ userId: user.id, incomeRatePct: rate })
      .onConflictDoUpdate({ target: miningPnlSettings.userId, set: { incomeRatePct: rate, updatedAt: new Date() } });
  });
}

/** Income basis: the mined ore at the valuation, or the counted wallet sales. */
export async function setIncomeSource(formData: FormData): Promise<PnlActionResult> {
  return change(async (user) => {
    const source = String(formData.get("source") ?? "");
    if (!isIncomeSource(source)) refuse("invalidSource");
    await getDb()
      .insert(miningPnlSettings)
      .values({ userId: user.id, incomeSource: source })
      .onConflictDoUpdate({ target: miningPnlSettings.userId, set: { incomeSource: source, updatedAt: new Date() } });
  });
}

async function knownType(typeId: number) {
  const [type] = await getDb().select({ id: eveTypes.typeId }).from(eveTypes).where(eq(eveTypes.typeId, typeId));
  if (!type) refuse("unknownType");
}

export async function addPriceRule(formData: FormData): Promise<PnlActionResult> {
  return change(async (user) => {
    const typeId = Number(formData.get("typeId"));
    if (!Number.isSafeInteger(typeId) || typeId <= 0) refuse("unknownType");
    const unitPrice = parseAmount(formData.get("unitPrice"));
    if (!(unitPrice >= 0) || unitPrice > 1e12) refuse("invalidPrice");
    const validFrom = optionalDate(formData.get("validFrom"));
    const validTo = optionalDate(formData.get("validTo"));
    if (validFrom && validTo && validFrom > validTo) refuse("invalidRange");
    await knownType(typeId);
    await getDb().insert(miningPnlPriceRules).values({ userId: user.id, typeId, unitPrice, validFrom, validTo });
  });
}

/** "Use" on a wallet sale hint: sets (or updates) the open-ended price rule of that ore. */
export async function applyPriceHint(typeId: number, unitPrice: number): Promise<PnlActionResult> {
  return change(async (user) => {
    const id = Number(typeId);
    if (!Number.isSafeInteger(id) || id <= 0) refuse("unknownType");
    if (!(Number.isFinite(unitPrice) && unitPrice >= 0 && unitPrice <= 1e12)) refuse("invalidPrice");
    await knownType(id);
    const db = getDb();
    const open = and(
      eq(miningPnlPriceRules.userId, user.id),
      eq(miningPnlPriceRules.typeId, id),
      isNull(miningPnlPriceRules.validFrom),
      isNull(miningPnlPriceRules.validTo),
    );
    const updated = await db.update(miningPnlPriceRules).set({ unitPrice }).where(open).returning({ id: miningPnlPriceRules.id });
    if (!updated.length) await db.insert(miningPnlPriceRules).values({ userId: user.id, typeId: id, unitPrice });
  });
}

export async function deletePriceRule(ruleId: number): Promise<PnlActionResult> {
  return change(async (user) => {
    const id = positiveId(ruleId);
    const deleted = await getDb()
      .delete(miningPnlPriceRules)
      .where(and(eq(miningPnlPriceRules.id, id), eq(miningPnlPriceRules.userId, user.id)))
      .returning({ id: miningPnlPriceRules.id });
    if (!deleted.length) refuse("notFound");
  });
}

async function setCharacterSwitch(
  characterId: number,
  set: { autoIncludeExpenses: boolean } | { autoIncludeSales: boolean },
): Promise<PnlActionResult> {
  return change(async (user) => {
    const id = ownCharacter(user, characterId);
    await getDb()
      .insert(miningPnlCharacters)
      .values({ userId: user.id, characterId: id, ...set })
      .onConflictDoUpdate({
        target: [miningPnlCharacters.userId, miningPnlCharacters.characterId],
        set: { ...set, updatedAt: new Date() },
      });
  });
}

/** The per-character "count tagged purchases automatically" switch (off by default). */
export async function setAutoInclude(characterId: number, on: boolean): Promise<PnlActionResult> {
  return setCharacterSwitch(characterId, { autoIncludeExpenses: on === true });
}

/** The per-character "count tagged sales automatically" switch (off by default). */
export async function setAutoIncludeSales(characterId: number, on: boolean): Promise<PnlActionResult> {
  return setCharacterSwitch(characterId, { autoIncludeSales: on === true });
}

/** A wallet purchase or sale of the account's own character, with its auto-tag. */
async function ownTransaction(user: CurrentUser, characterId: number, transactionId: number, side: WalletSide) {
  const charId = ownCharacter(user, characterId);
  const txId = positiveId(transactionId);
  const [row] = await getDb()
    .select({
      typeId: walletTransactions.typeId,
      groupId: eveTypes.groupId,
      categoryId: eveGroups.categoryId,
      isBuy: walletTransactions.isBuy,
    })
    .from(walletTransactions)
    .leftJoin(eveTypes, eq(eveTypes.typeId, walletTransactions.typeId))
    .leftJoin(eveGroups, eq(eveGroups.groupId, eveTypes.groupId))
    .where(
      and(
        eq(walletTransactions.characterId, charId),
        eq(walletTransactions.transactionId, txId),
        eq(walletTransactions.userId, user.id),
      ),
    );
  if (!row || row.isBuy !== (side === "buy")) refuse("notFound");
  const [override] = await getDb()
    .select({ category: miningPnlTxOverrides.category })
    .from(miningPnlTxOverrides)
    .where(
      and(
        eq(miningPnlTxOverrides.userId, user.id),
        eq(miningPnlTxOverrides.characterId, charId),
        eq(miningPnlTxOverrides.transactionId, txId),
      ),
    );
  const autoCategory = side === "buy" ? classifyPurchase(row.typeId, row.groupId) : classifySale(row.groupId, row.categoryId);
  return { charId, txId, autoCategory, category: override?.category ?? null };
}

async function writeOverride(
  user: CurrentUser,
  charId: number,
  txId: number,
  patch: { category?: string | null; included?: boolean | null },
) {
  const db = getDb();
  await db
    .insert(miningPnlTxOverrides)
    .values({ userId: user.id, characterId: charId, transactionId: txId, ...patch })
    .onConflictDoUpdate({
      target: [miningPnlTxOverrides.userId, miningPnlTxOverrides.characterId, miningPnlTxOverrides.transactionId],
      set: { ...patch, updatedAt: new Date() },
    });
  // Back to fully automatic: drop the row.
  await db
    .delete(miningPnlTxOverrides)
    .where(
      and(
        eq(miningPnlTxOverrides.userId, user.id),
        eq(miningPnlTxOverrides.characterId, charId),
        eq(miningPnlTxOverrides.transactionId, txId),
        isNull(miningPnlTxOverrides.category),
        isNull(miningPnlTxOverrides.included),
      ),
    );
}

/** Sets a transaction's category ("" = automatic). Tagging one Keystar didn't recognise also counts it. */
async function setCategory(side: WalletSide, characterId: number, transactionId: number, formData: FormData): Promise<PnlActionResult> {
  return change(async (user) => {
    const { charId, txId, autoCategory } = await ownTransaction(user, characterId, transactionId, side);
    const raw = String(formData.get("category") ?? "");
    if (raw && !(side === "buy" ? isExpenseCategory(raw) : isIncomeCategory(raw))) refuse("invalidCategory");
    const category = raw || null;
    const patch: { category: string | null; included?: boolean | null } = { category };
    if (autoCategory === null) patch.included = category ? true : null;
    await writeOverride(user, charId, txId, patch);
  });
}

/** Include (true), exclude (false) or reset to automatic (null) one transaction. */
async function setIncluded(side: WalletSide, characterId: number, transactionId: number, included: boolean | null): Promise<PnlActionResult> {
  return change(async (user) => {
    const { charId, txId, autoCategory, category } = await ownTransaction(user, characterId, transactionId, side);
    const patch: { included: boolean | null; category?: string } = { included: included === null ? null : included === true };
    // An unrecognised transaction needs a category to count: "Other" until the user picks one.
    if (included === true && autoCategory === null && category === null) patch.category = "other";
    await writeOverride(user, charId, txId, patch);
  });
}

export async function setPurchaseCategory(characterId: number, transactionId: number, formData: FormData): Promise<PnlActionResult> {
  return setCategory("buy", characterId, transactionId, formData);
}

export async function setPurchaseIncluded(characterId: number, transactionId: number, included: boolean | null): Promise<PnlActionResult> {
  return setIncluded("buy", characterId, transactionId, included);
}

export async function setSaleCategory(characterId: number, transactionId: number, formData: FormData): Promise<PnlActionResult> {
  return setCategory("sell", characterId, transactionId, formData);
}

export async function setSaleIncluded(characterId: number, transactionId: number, included: boolean | null): Promise<PnlActionResult> {
  return setIncluded("sell", characterId, transactionId, included);
}

/** Includes every suggested purchase matching the expenses page filters. */
export async function includeAllSuggested(formData: FormData): Promise<PnlActionResult> {
  return includeAllSuggestedOf("buy", formData);
}

/** Includes every suggested sale matching the income page filters. */
export async function includeAllSuggestedSales(formData: FormData): Promise<PnlActionResult> {
  return includeAllSuggestedOf("sell", formData);
}

const INCLUDE_BATCH = 5000;
/** Safety stop for "include all" (250,000 transactions). */
const MAX_INCLUDE_BATCHES = 50;

async function includeAllSuggestedOf(side: WalletSide, formData: FormData): Promise<PnlActionResult> {
  return change(async (user) => {
    const filters = parsePnlFilters({
      from: String(formData.get("from") ?? ""),
      to: String(formData.get("to") ?? ""),
      chars: String(formData.get("chars") ?? ""),
    });
    const valuation = miningValuation(await getSettings());
    const scope = pnlScope(user, filters, valuation, 100);
    // In batches: included rows leave "suggested", so each query returns the next ones until none are left.
    const opts = { status: "suggested", limit: INCLUDE_BATCH, offset: 0 } as const;
    for (let batch = 0; batch < MAX_INCLUDE_BATCHES; batch++) {
      const { rows } = side === "buy" ? await getPurchases(scope, opts) : await getSales(scope, opts);
      if (!rows.length) break;
      await getDb()
        .insert(miningPnlTxOverrides)
        .values(rows.map((r) => ({ userId: user.id, characterId: r.characterId, transactionId: r.transactionId, included: true })))
        .onConflictDoUpdate({
          target: [miningPnlTxOverrides.userId, miningPnlTxOverrides.characterId, miningPnlTxOverrides.transactionId],
          set: { included: true, updatedAt: new Date() },
        });
      if (rows.length < INCLUDE_BATCH) break;
    }
  });
}

export async function addManualEntry(formData: FormData): Promise<PnlActionResult> {
  return change(async (user) => {
    const date = optionalDate(formData.get("date"));
    if (!date) refuse("invalidDate");
    const amount = parseAmount(formData.get("amount"));
    if (!(amount > 0 && amount < 1e15)) refuse("invalidAmount");
    const category = String(formData.get("category") ?? "");
    if (!isExpenseCategory(category)) refuse("invalidCategory");
    const spreadDays = Number(formData.get("spreadDays") ?? 1);
    if (!SPREAD_DAYS.includes(spreadDays)) refuse("invalidSpread");
    const rawChar = String(formData.get("characterId") ?? "");
    const characterId = rawChar ? ownCharacter(user, rawChar) : null;
    const description = String(formData.get("description") ?? "").trim().slice(0, 200);
    await getDb().insert(miningPnlEntries).values({ userId: user.id, characterId, date, spreadDays, category, description, amount });
  });
}

export async function deleteManualEntry(entryId: number): Promise<PnlActionResult> {
  return change(async (user) => {
    const id = positiveId(entryId);
    const deleted = await getDb()
      .delete(miningPnlEntries)
      .where(and(eq(miningPnlEntries.id, id), eq(miningPnlEntries.userId, user.id)))
      .returning({ id: miningPnlEntries.id });
    if (!deleted.length) refuse("notFound");
  });
}

/** Include (true), exclude (false) or reset to automatic (null) one broker fee. Sales tax follows its sale. */
export async function setFeeIncluded(characterId: number, journalId: number, included: boolean | null): Promise<PnlActionResult> {
  return change(async (user) => {
    const charId = ownCharacter(user, characterId);
    const id = positiveId(journalId);
    const db = getDb();
    const [fee] = await db
      .select({ id: walletFees.journalId, refType: walletFees.refType })
      .from(walletFees)
      .where(and(eq(walletFees.characterId, charId), eq(walletFees.journalId, id), eq(walletFees.userId, user.id)));
    if (!fee) refuse("notFound");
    if (fee.refType !== "brokers_fee") refuse("salesTaxFollowsSale");
    const key = and(
      eq(miningPnlFeeOverrides.userId, user.id),
      eq(miningPnlFeeOverrides.characterId, charId),
      eq(miningPnlFeeOverrides.journalId, id),
    );
    if (included === null) {
      await db.delete(miningPnlFeeOverrides).where(key);
    } else {
      await db
        .insert(miningPnlFeeOverrides)
        .values({ userId: user.id, characterId: charId, journalId: id, included: included === true })
        .onConflictDoUpdate({
          target: [miningPnlFeeOverrides.userId, miningPnlFeeOverrides.characterId, miningPnlFeeOverrides.journalId],
          set: { included: included === true, updatedAt: new Date() },
        });
    }
  });
}

/** Includes every suggested broker fee matching the expenses page filters. */
export async function includeAllSuggestedFees(formData: FormData): Promise<PnlActionResult> {
  return change(async (user) => {
    const filters = parsePnlFilters({
      from: String(formData.get("from") ?? ""),
      to: String(formData.get("to") ?? ""),
      chars: String(formData.get("chars") ?? ""),
    });
    const valuation = miningValuation(await getSettings());
    const scope = pnlScope(user, filters, valuation, 100);
    // In batches: included fees leave "suggested", so each query returns the next ones until none are left.
    for (let batch = 0; batch < MAX_INCLUDE_BATCHES; batch++) {
      const { rows } = await getFees(scope, { status: "suggested", kind: "brokers_fee", limit: INCLUDE_BATCH, offset: 0 });
      if (!rows.length) break;
      await getDb()
        .insert(miningPnlFeeOverrides)
        .values(rows.map((r) => ({ userId: user.id, characterId: r.characterId, journalId: r.journalId, included: true })))
        .onConflictDoUpdate({
          target: [miningPnlFeeOverrides.userId, miningPnlFeeOverrides.characterId, miningPnlFeeOverrides.journalId],
          set: { included: true, updatedAt: new Date() },
        });
      if (rows.length < INCLUDE_BATCH) break;
    }
  });
}

export type DeleteWalletError = "forbidden" | "notOwned" | "stillImporting";

/** Deletes a character's imported wallet history (only once wallet access has been removed). */
export async function deleteWalletData(characterId: number): Promise<ActionResult<DeleteWalletError>> {
  const user = await pnlUser().catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  const db = getDb();
  const [token] = await db.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId));
  if (token?.scopes.includes(WALLET_SCOPE)) return refused("stillImporting");
  await db.delete(walletTransactions).where(and(eq(walletTransactions.characterId, characterId), eq(walletTransactions.userId, user.id)));
  await db.delete(miningPnlTxOverrides).where(and(eq(miningPnlTxOverrides.characterId, characterId), eq(miningPnlTxOverrides.userId, user.id)));
  await db.delete(walletFees).where(and(eq(walletFees.characterId, characterId), eq(walletFees.userId, user.id)));
  await db
    .delete(miningPnlFeeOverrides)
    .where(and(eq(miningPnlFeeOverrides.characterId, characterId), eq(miningPnlFeeOverrides.userId, user.id)));
  await db
    .update(syncJobs)
    .set({ meta: null })
    .where(
      and(
        eq(syncJobs.ownerType, "character"),
        eq(syncJobs.ownerId, characterId),
        inArray(syncJobs.jobKey, ["wallet.character-transactions", "wallet.character-fees"]),
      ),
    );
  revalidate();
  return ok;
}
