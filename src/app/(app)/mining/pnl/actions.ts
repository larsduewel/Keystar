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
 * from the page are validated like any other input.
 */

async function pnlUser(): Promise<CurrentUser> {
  return assertPermission(MINING_PERMISSIONS.pnl);
}

function ownCharacter(user: CurrentUser, value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || !user.characterIds.includes(id)) {
    throw new Error("That character is not linked to your account");
  }
  return id;
}

function positiveId(value: unknown, what: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid ${what}`);
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

function optionalDate(value: FormDataEntryValue | null, label: string): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (!isValidIsoDate(s)) throw new Error(`${label} must be a date (YYYY-MM-DD)`);
  return s;
}

function revalidate() {
  revalidatePath("/mining/pnl", "layout");
}

export async function setIncomeRate(formData: FormData) {
  const user = await pnlUser();
  const rate = parseAmount(formData.get("rate"));
  if (!(rate > 0 && rate <= 1000)) throw new Error("Enter a rate between 1 and 1000 %");
  await getDb()
    .insert(miningPnlSettings)
    .values({ userId: user.id, incomeRatePct: rate })
    .onConflictDoUpdate({ target: miningPnlSettings.userId, set: { incomeRatePct: rate, updatedAt: new Date() } });
  revalidate();
}

/** Income basis: the mined ore at the valuation, or the counted wallet sales. */
export async function setIncomeSource(formData: FormData) {
  const user = await pnlUser();
  const source = String(formData.get("source") ?? "");
  if (!isIncomeSource(source)) throw new Error("Pick how income is counted");
  await getDb()
    .insert(miningPnlSettings)
    .values({ userId: user.id, incomeSource: source })
    .onConflictDoUpdate({ target: miningPnlSettings.userId, set: { incomeSource: source, updatedAt: new Date() } });
  revalidate();
}

async function knownType(typeId: number) {
  const [type] = await getDb().select({ id: eveTypes.typeId }).from(eveTypes).where(eq(eveTypes.typeId, typeId));
  if (!type) throw new Error("Unknown item type");
}

export async function addPriceRule(formData: FormData) {
  const user = await pnlUser();
  const typeId = positiveId(formData.get("typeId"), "ore");
  const unitPrice = parseAmount(formData.get("unitPrice"));
  if (!(unitPrice >= 0) || unitPrice > 1e12) throw new Error("Enter the ISK you get per unit");
  const validFrom = optionalDate(formData.get("validFrom"), "From");
  const validTo = optionalDate(formData.get("validTo"), "To");
  if (validFrom && validTo && validFrom > validTo) throw new Error("The rule ends before it starts");
  await knownType(typeId);
  await getDb().insert(miningPnlPriceRules).values({ userId: user.id, typeId, unitPrice, validFrom, validTo });
  revalidate();
}

/** "Use" on a wallet sale hint: sets (or updates) the open-ended price rule of that ore. */
export async function applyPriceHint(typeId: number, unitPrice: number) {
  const user = await pnlUser();
  const id = positiveId(typeId, "ore");
  if (!(Number.isFinite(unitPrice) && unitPrice >= 0 && unitPrice <= 1e12)) throw new Error("Invalid price");
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
  revalidate();
}

export async function deletePriceRule(ruleId: number) {
  const user = await pnlUser();
  const id = positiveId(ruleId, "rule");
  await getDb()
    .delete(miningPnlPriceRules)
    .where(and(eq(miningPnlPriceRules.id, id), eq(miningPnlPriceRules.userId, user.id)));
  revalidate();
}

async function setCharacterSwitch(characterId: number, set: { autoIncludeExpenses: boolean } | { autoIncludeSales: boolean }) {
  const user = await pnlUser();
  const id = ownCharacter(user, characterId);
  await getDb()
    .insert(miningPnlCharacters)
    .values({ userId: user.id, characterId: id, ...set })
    .onConflictDoUpdate({
      target: [miningPnlCharacters.userId, miningPnlCharacters.characterId],
      set: { ...set, updatedAt: new Date() },
    });
  revalidate();
}

/** The per-character "count tagged purchases automatically" switch (off by default). */
export async function setAutoInclude(characterId: number, on: boolean) {
  await setCharacterSwitch(characterId, { autoIncludeExpenses: on === true });
}

/** The per-character "count tagged sales automatically" switch (off by default). */
export async function setAutoIncludeSales(characterId: number, on: boolean) {
  await setCharacterSwitch(characterId, { autoIncludeSales: on === true });
}

/** A wallet purchase or sale of the account's own character, with its auto-tag. */
async function ownTransaction(user: CurrentUser, characterId: number, transactionId: number, side: WalletSide) {
  const charId = ownCharacter(user, characterId);
  const txId = positiveId(transactionId, "transaction");
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
  if (!row || row.isBuy !== (side === "buy")) throw new Error(side === "buy" ? "Purchase not found" : "Sale not found");
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
async function setCategory(side: WalletSide, characterId: number, transactionId: number, formData: FormData) {
  const user = await pnlUser();
  const { charId, txId, autoCategory } = await ownTransaction(user, characterId, transactionId, side);
  const raw = String(formData.get("category") ?? "");
  if (raw && !(side === "buy" ? isExpenseCategory(raw) : isIncomeCategory(raw))) throw new Error("Unknown category");
  const category = raw || null;
  const patch: { category: string | null; included?: boolean | null } = { category };
  if (autoCategory === null) patch.included = category ? true : null;
  await writeOverride(user, charId, txId, patch);
  revalidate();
}

/** Include (true), exclude (false) or reset to automatic (null) one transaction. */
async function setIncluded(side: WalletSide, characterId: number, transactionId: number, included: boolean | null) {
  const user = await pnlUser();
  const { charId, txId, autoCategory, category } = await ownTransaction(user, characterId, transactionId, side);
  const patch: { included: boolean | null; category?: string } = { included: included === null ? null : included === true };
  // An unrecognised transaction needs a category to count: "Other" until the user picks one.
  if (included === true && autoCategory === null && category === null) patch.category = "other";
  await writeOverride(user, charId, txId, patch);
  revalidate();
}

export async function setPurchaseCategory(characterId: number, transactionId: number, formData: FormData) {
  await setCategory("buy", characterId, transactionId, formData);
}

export async function setPurchaseIncluded(characterId: number, transactionId: number, included: boolean | null) {
  await setIncluded("buy", characterId, transactionId, included);
}

export async function setSaleCategory(characterId: number, transactionId: number, formData: FormData) {
  await setCategory("sell", characterId, transactionId, formData);
}

export async function setSaleIncluded(characterId: number, transactionId: number, included: boolean | null) {
  await setIncluded("sell", characterId, transactionId, included);
}

/** Includes every suggested purchase matching the expenses page filters. */
export async function includeAllSuggested(formData: FormData) {
  await includeAllSuggestedOf("buy", formData);
}

/** Includes every suggested sale matching the income page filters. */
export async function includeAllSuggestedSales(formData: FormData) {
  await includeAllSuggestedOf("sell", formData);
}

const INCLUDE_BATCH = 5000;
/** Safety stop for "include all" (250,000 transactions). */
const MAX_INCLUDE_BATCHES = 50;

async function includeAllSuggestedOf(side: WalletSide, formData: FormData) {
  const user = await pnlUser();
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
  revalidate();
}

export async function addManualEntry(formData: FormData) {
  const user = await pnlUser();
  const date = optionalDate(formData.get("date"), "Date");
  if (!date) throw new Error("Pick a date");
  const amount = parseAmount(formData.get("amount"));
  if (!(amount > 0 && amount < 1e15)) throw new Error("Enter an amount in ISK");
  const category = String(formData.get("category") ?? "");
  if (!isExpenseCategory(category)) throw new Error("Pick a category");
  const spreadDays = Number(formData.get("spreadDays") ?? 1);
  if (!SPREAD_DAYS.includes(spreadDays)) throw new Error("Invalid spread");
  const rawChar = String(formData.get("characterId") ?? "");
  const characterId = rawChar ? ownCharacter(user, rawChar) : null;
  const description = String(formData.get("description") ?? "").trim().slice(0, 200);
  await getDb().insert(miningPnlEntries).values({ userId: user.id, characterId, date, spreadDays, category, description, amount });
  revalidate();
}

export async function deleteManualEntry(entryId: number) {
  const user = await pnlUser();
  const id = positiveId(entryId, "entry");
  await getDb().delete(miningPnlEntries).where(and(eq(miningPnlEntries.id, id), eq(miningPnlEntries.userId, user.id)));
  revalidate();
}

/** Include (true), exclude (false) or reset to automatic (null) one broker fee. Sales tax follows its sale. */
export async function setFeeIncluded(characterId: number, journalId: number, included: boolean | null) {
  const user = await pnlUser();
  const charId = ownCharacter(user, characterId);
  const id = positiveId(journalId, "fee");
  const db = getDb();
  const [fee] = await db
    .select({ id: walletFees.journalId, refType: walletFees.refType })
    .from(walletFees)
    .where(and(eq(walletFees.characterId, charId), eq(walletFees.journalId, id), eq(walletFees.userId, user.id)));
  if (!fee) throw new Error("Fee not found");
  if (fee.refType !== "brokers_fee") throw new Error("Sales tax counts with its sale; include or exclude the sale instead");
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
  revalidate();
}

/** Includes every suggested broker fee matching the expenses page filters. */
export async function includeAllSuggestedFees(formData: FormData) {
  const user = await pnlUser();
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
  revalidate();
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
