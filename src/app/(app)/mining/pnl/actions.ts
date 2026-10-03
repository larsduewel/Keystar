"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertPermission, type CurrentUser } from "@/core/auth/dal";
import {
  esiTokens,
  eveTypes,
  getDb,
  miningPnlCharacters,
  miningPnlEntries,
  miningPnlPriceRules,
  miningPnlSettings,
  miningPnlTxOverrides,
  walletTransactions,
} from "@/core/db";
import { getSettings } from "@/core/settings";
import { isValidIsoDate } from "@/lib/dates";
import { parseLocaleNumber } from "@/modules/mining/estimator/parse";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { miningValuation } from "@/modules/mining/page-context";
import { classifyPurchase, isExpenseCategory } from "@/modules/mining/pnl/categories";
import { parsePnlFilters } from "@/modules/mining/pnl/filters";
import { getPurchases } from "@/modules/mining/pnl/queries";
import { pnlScope } from "@/modules/mining/pnl/scope";
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

/** The per-character "count tagged purchases automatically" switch (off by default). */
export async function setAutoInclude(characterId: number, on: boolean) {
  const user = await pnlUser();
  const id = ownCharacter(user, characterId);
  await getDb()
    .insert(miningPnlCharacters)
    .values({ userId: user.id, characterId: id, autoIncludeExpenses: on === true })
    .onConflictDoUpdate({
      target: [miningPnlCharacters.userId, miningPnlCharacters.characterId],
      set: { autoIncludeExpenses: on === true, updatedAt: new Date() },
    });
  revalidate();
}

/** A wallet purchase of the account's own character, with its auto-tag. */
async function ownPurchase(user: CurrentUser, characterId: number, transactionId: number) {
  const charId = ownCharacter(user, characterId);
  const txId = positiveId(transactionId, "transaction");
  const [row] = await getDb()
    .select({ typeId: walletTransactions.typeId, groupId: eveTypes.groupId, isBuy: walletTransactions.isBuy })
    .from(walletTransactions)
    .leftJoin(eveTypes, eq(eveTypes.typeId, walletTransactions.typeId))
    .where(
      and(
        eq(walletTransactions.characterId, charId),
        eq(walletTransactions.transactionId, txId),
        eq(walletTransactions.userId, user.id),
      ),
    );
  if (!row || !row.isBuy) throw new Error("Purchase not found");
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
  return { charId, txId, autoCategory: classifyPurchase(row.typeId, row.groupId), category: override?.category ?? null };
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

/** Sets a purchase's category ("" = automatic). Tagging a purchase Keystar didn't recognise also counts it. */
export async function setPurchaseCategory(characterId: number, transactionId: number, formData: FormData) {
  const user = await pnlUser();
  const { charId, txId, autoCategory } = await ownPurchase(user, characterId, transactionId);
  const raw = String(formData.get("category") ?? "");
  if (raw && !isExpenseCategory(raw)) throw new Error("Unknown category");
  const category = raw || null;
  const patch: { category: string | null; included?: boolean | null } = { category };
  if (autoCategory === null) patch.included = category ? true : null;
  await writeOverride(user, charId, txId, patch);
  revalidate();
}

/** Include (true), exclude (false) or reset to automatic (null) one purchase. */
export async function setPurchaseIncluded(characterId: number, transactionId: number, included: boolean | null) {
  const user = await pnlUser();
  const { charId, txId, autoCategory, category } = await ownPurchase(user, characterId, transactionId);
  const patch: { included: boolean | null; category?: string } = { included: included === null ? null : included === true };
  // An unrecognised purchase needs a category to count: "Other" until the user picks one.
  if (included === true && autoCategory === null && category === null) patch.category = "other";
  await writeOverride(user, charId, txId, patch);
  revalidate();
}

/** Includes every suggested purchase matching the expenses page filters. */
export async function includeAllSuggested(formData: FormData) {
  const user = await pnlUser();
  const filters = parsePnlFilters({
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
    chars: String(formData.get("chars") ?? ""),
  });
  const valuation = miningValuation(await getSettings());
  const scope = pnlScope(user, filters, valuation, 100);
  const { rows } = await getPurchases(scope, { status: "suggested", limit: 5000, offset: 0 });
  if (rows.length) {
    await getDb()
      .insert(miningPnlTxOverrides)
      .values(rows.map((r) => ({ userId: user.id, characterId: r.characterId, transactionId: r.transactionId, included: true })))
      .onConflictDoUpdate({
        target: [miningPnlTxOverrides.userId, miningPnlTxOverrides.characterId, miningPnlTxOverrides.transactionId],
        set: { included: true, updatedAt: new Date() },
      });
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
  revalidate();
  return ok;
}
