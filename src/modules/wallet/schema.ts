import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/core/db/schema/core";

/**
 * Personal market transactions (GET /characters/{id}/wallet/transactions),
 * imported only for characters whose owner granted the opt-in wallet scope.
 * ESI keeps 30 days; Keystar keeps what it has seen. `user_id` is the account
 * that owned the character at import time: wallet data is only ever shown to
 * that account, so it doesn't follow a sold character to its new owner.
 */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    /** Unique per wallet; the two sides of a trade between your own characters share it. */
    transactionId: bigint("transaction_id", { mode: "number" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    typeId: integer("type_id").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
    isBuy: boolean("is_buy").notNull(),
    clientId: bigint("client_id", { mode: "number" }).notNull(),
    locationId: bigint("location_id", { mode: "number" }).notNull(),
    journalRefId: bigint("journal_ref_id", { mode: "number" }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.transactionId] }),
    index("wallet_transactions_user_date_idx").on(t.userId, t.date),
  ],
);

/** Personal wallet journal entries Keystar keeps: market fees only (`ref_type` of WALLET_FEE_REF_TYPES). */
export const WALLET_FEE_REF_TYPES = ["transaction_tax", "brokers_fee"] as const;

export type WalletFeeRefType = (typeof WALLET_FEE_REF_TYPES)[number];

/**
 * Sales tax and broker fees from the personal wallet journal (GET /characters/{id}/wallet/journal), imported with
 * the same opt-in wallet scope and kept like `wallet_transactions`: shown only to `user_id`, deleted with the wallet
 * history. Other journal entries (bounties, transfers …) are not stored.
 */
export const walletFees = pgTable(
  "wallet_fees",
  {
    characterId: bigint("character_id", { mode: "number" }).notNull(),
    /** Journal reference id. */
    journalId: bigint("journal_id", { mode: "number" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    refType: text("ref_type").$type<WalletFeeRefType>().notNull(),
    /** ISK paid (positive). */
    amount: doublePrecision("amount").notNull(),
    contextId: bigint("context_id", { mode: "number" }),
    contextIdType: text("context_id_type"),
    /** The journal's own description, as the EVE client shows it (null for entries imported before it was kept). */
    description: text("description"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.journalId] }),
    index("wallet_fees_user_date_idx").on(t.userId, t.date),
  ],
);

/*
 * Corporation wallets. ESI only returns about 30 days (and at most 10,000 journal entries) per division, so these
 * tables are the long-term archive: rows are never deleted and carry no foreign keys to characters, so they outlive
 * the members and tokens they were read with. Everything is keyed by corporation; pages show the home corporation.
 */

/** Current balance and custom name of each wallet division (1 = master wallet). */
export const corpWalletDivisions = pgTable(
  "corp_wallet_divisions",
  {
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    division: smallint("division").notNull(),
    /** Custom name from /divisions; null while the division keeps its default name (or no Director token read it). */
    name: text("name"),
    balance: doublePrecision("balance"),
    balanceAt: timestamp("balance_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.division] })],
);

/** Last balance seen on each EVE day, so balance trends also cover days without journal entries. */
export const corpWalletBalanceHistory = pgTable(
  "corp_wallet_balance_history",
  {
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    division: smallint("division").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    balance: doublePrecision("balance").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.division, t.date] })],
);

/**
 * Wallet journal (GET /corporations/{id}/wallets/{division}/journal). Entries are immutable: inserted once, never
 * updated. `ref_type` is text because CCP adds values without a new compatibility date.
 */
export const corpWalletJournal = pgTable(
  "corp_wallet_journal",
  {
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    division: smallint("division").notNull(),
    id: bigint("id", { mode: "number" }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    refType: text("ref_type").notNull(),
    /** Positive: into the division; negative: out of it. */
    amount: doublePrecision("amount"),
    /** Division balance after the entry. */
    balance: doublePrecision("balance"),
    firstPartyId: bigint("first_party_id", { mode: "number" }),
    secondPartyId: bigint("second_party_id", { mode: "number" }),
    contextId: bigint("context_id", { mode: "number" }),
    contextIdType: text("context_id_type"),
    reason: text("reason"),
    description: text("description").notNull(),
    tax: doublePrecision("tax"),
    taxReceiverId: bigint("tax_receiver_id", { mode: "number" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.corporationId, t.division, t.id] }),
    index("corp_wallet_journal_corp_date_idx").on(t.corporationId, t.date),
    index("corp_wallet_journal_corp_ref_date_idx").on(t.corporationId, t.refType, t.date),
  ],
);

/** Market transactions of the corporation wallets, archived for item-level spending reports. */
export const corpWalletTransactions = pgTable(
  "corp_wallet_transactions",
  {
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    division: smallint("division").notNull(),
    transactionId: bigint("transaction_id", { mode: "number" }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    typeId: integer("type_id").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
    isBuy: boolean("is_buy").notNull(),
    clientId: bigint("client_id", { mode: "number" }).notNull(),
    locationId: bigint("location_id", { mode: "number" }).notNull(),
    /** -1 when ESI has no matching journal entry. */
    journalRefId: bigint("journal_ref_id", { mode: "number" }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.corporationId, t.division, t.transactionId] }),
    index("corp_wallet_transactions_corp_date_idx").on(t.corporationId, t.date),
  ],
);

export type CorpWalletStream = "journal" | "transactions";

/** A stretch of time Keystar has no entries for because ESI no longer returned them. */
export interface CorpWalletGap {
  /** Newest entry stored before the gap. */
  from: string;
  /** Oldest entry ESI still returned after it. */
  to: string;
  detectedAt: string;
}

/** Archive coverage per division and stream: where the history starts and where it has holes. */
export const corpWalletSyncState = pgTable(
  "corp_wallet_sync_state",
  {
    corporationId: bigint("corporation_id", { mode: "number" }).notNull(),
    division: smallint("division").notNull(),
    stream: text("stream").$type<CorpWalletStream>().notNull(),
    /** Oldest entry ever imported. */
    historyStartsAt: timestamp("history_starts_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    gaps: jsonb("gaps").$type<CorpWalletGap[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.division, t.stream] })],
);
