import { and, eq, sql } from "drizzle-orm";
import { characters } from "@/core/db/schema/core";
import { ensureTypes } from "@/core/eve/resolver";
import type { JobDefinition } from "@/core/sync/types";
import { fetchJournalSince } from "./corp/fetch";
import { corporationDivisionsJob, corporationWalletsJob } from "./corp/sync";
import { WALLET_SCOPE } from "./module";
import { WALLET_FEE_REF_TYPES, walletFees, walletTransactions, type WalletFeeRefType } from "./schema";
import { fetchNewTransactions } from "./transactions";

const CHUNK = 1000;

/**
 * Personal market transactions for characters whose owner opted in to wallet
 * import. The summary deliberately carries no ISK amounts: sync status is
 * visible to admins, wallet contents are not.
 */
export const walletTransactionsJob: JobDefinition = {
  key: "wallet.character-transactions",
  label: (t) => t.wallet.module.jobs.transactions,
  module: "wallet",
  owner: "character",
  requiredScopes: [WALLET_SCOPE],
  // ESI caches wallet transactions for an hour.
  intervalSeconds: 3600,
  async run({ esi, db, characterId, meta }) {
    const [owner] = await db
      .select({ userId: characters.userId })
      .from(characters)
      .where(eq(characters.characterId, characterId!));
    if (!owner) return { summary: "Character is not linked" };

    // Resume after the newest transaction seen for this owner, including corporation-wallet ones that aren't stored.
    const [newest] = await db
      .select({ id: sql<string | null>`max(${walletTransactions.transactionId})` })
      .from(walletTransactions)
      .where(and(eq(walletTransactions.characterId, characterId!), eq(walletTransactions.userId, owner.userId)));
    const seen = meta.userId === owner.userId && typeof meta.newestSeenId === "number" ? meta.newestSeenId : null;
    const stored = newest?.id == null ? null : Number(newest.id);
    const cursor = stored === null ? seen : seen === null ? stored : Math.max(stored, seen);

    const res = await fetchNewTransactions(esi, characterId!, cursor);
    // Corporation-wallet transactions made by this character are out of scope.
    const rows = res.rows
      .filter((t) => t.is_personal)
      .map((t) => ({
        characterId: characterId!,
        transactionId: t.transaction_id,
        userId: owner.userId,
        date: new Date(t.date),
        typeId: t.type_id,
        quantity: t.quantity,
        unitPrice: t.unit_price,
        isBuy: t.is_buy,
        clientId: t.client_id,
        locationId: t.location_id,
        journalRefId: t.journal_ref_id,
      }));

    const stillOwned = await db.transaction(async (tx) => {
      // Removing or transferring the character meanwhile must not bring its wallet rows back.
      const [current] = await tx.execute<{ user_id: string }>(
        sql`SELECT user_id FROM characters WHERE character_id = ${characterId!} FOR SHARE`,
      );
      if (current?.user_id !== owner.userId) return false;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx
          .insert(walletTransactions)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: [walletTransactions.characterId, walletTransactions.transactionId],
            set: { userId: sql`excluded.user_id` },
            setWhere: sql`${walletTransactions.userId} IS DISTINCT FROM excluded.user_id`,
          });
      }
      return true;
    });
    if (!stillOwned) return { summary: "Character changed owner during the import" };

    await ensureTypes(rows.map((r) => r.typeId));
    const added = rows.filter((r) => cursor === null || r.transactionId > cursor).length;
    const newestSeenId = res.rows.reduce((max, t) => Math.max(max, t.transaction_id), cursor ?? 0);
    return {
      summary: `${added} new transaction${added === 1 ? "" : "s"}${res.truncated ? " (older ones skipped)" : ""}`,
      nextRunAt: res.expiresAt,
      meta: { userId: owner.userId, newestSeenId: newestSeenId || null },
    };
  },
};

const isFee = (refType: string): refType is WalletFeeRefType => (WALLET_FEE_REF_TYPES as readonly string[]).includes(refType);

/**
 * Sales tax and broker fees from the personal wallet journal, for the same opted-in characters and with the same
 * scope as the transactions. Only those entries are stored; the cursor is the newest journal id seen, so other
 * entries aren't fetched again. Like the transactions, the summary carries no ISK amounts.
 */
export const walletFeesJob: JobDefinition = {
  key: "wallet.character-fees",
  label: (t) => t.wallet.module.jobs.fees,
  module: "wallet",
  owner: "character",
  requiredScopes: [WALLET_SCOPE],
  // ESI caches the wallet journal for an hour.
  intervalSeconds: 3600,
  async run({ esi, db, characterId, meta }) {
    const [owner] = await db
      .select({ userId: characters.userId })
      .from(characters)
      .where(eq(characters.characterId, characterId!));
    if (!owner) return { summary: "Character is not linked" };

    const [newest] = await db
      .select({ id: sql<string | null>`max(${walletFees.journalId})` })
      .from(walletFees)
      .where(and(eq(walletFees.characterId, characterId!), eq(walletFees.userId, owner.userId)));
    const seen = meta.userId === owner.userId && typeof meta.newestSeenId === "number" ? meta.newestSeenId : null;
    const stored = newest?.id == null ? null : Number(newest.id);
    const latest = stored === null ? seen : seen === null ? stored : Math.max(stored, seen);
    // Fees imported before descriptions were kept get theirs from one full read of ESI's 30 days.
    const backfill = latest !== null && meta.descriptions !== true;
    const cursor = backfill ? null : latest;

    const res = await fetchJournalSince(esi, `/characters/${characterId}/wallet/journal`, characterId!, cursor);
    const rows = res.rows
      .filter((e) => isFee(e.ref_type) && (cursor === null || e.id > cursor) && (e.amount ?? 0) < 0)
      .map((e) => ({
        characterId: characterId!,
        journalId: e.id,
        userId: owner.userId,
        date: new Date(e.date),
        refType: e.ref_type as WalletFeeRefType,
        amount: Math.abs(e.amount ?? 0),
        contextId: e.context_id ?? null,
        contextIdType: e.context_id_type ?? null,
        description: e.description?.trim() || null,
      }));

    const stillOwned = await db.transaction(async (tx) => {
      // Removing or transferring the character meanwhile must not bring its wallet rows back.
      const [current] = await tx.execute<{ user_id: string }>(
        sql`SELECT user_id FROM characters WHERE character_id = ${characterId!} FOR SHARE`,
      );
      if (current?.user_id !== owner.userId) return false;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx
          .insert(walletFees)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: [walletFees.characterId, walletFees.journalId],
            set: { description: sql`excluded.description` },
            setWhere: sql`${walletFees.description} IS NULL AND ${walletFees.userId} = excluded.user_id`,
          });
      }
      return true;
    });
    if (!stillOwned) return { summary: "Character changed owner during the import" };

    const newestSeenId = res.rows.reduce((max, e) => Math.max(max, e.id), latest ?? 0);
    const added = rows.filter((r) => latest === null || r.journalId > latest).length;
    return {
      summary: `${added} new fee${added === 1 ? "" : "s"}${res.truncated ? " (older ones skipped)" : ""}`,
      nextRunAt: res.expiresAt,
      meta: { userId: owner.userId, newestSeenId: newestSeenId || null, descriptions: true },
    };
  },
};

export const walletJobs: JobDefinition[] = [walletTransactionsJob, walletFeesJob, corporationWalletsJob, corporationDivisionsJob];
