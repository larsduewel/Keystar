import type { EsiClient } from "@/core/esi/client";
import { fetchTransactionsSince, type FetchedTransactions } from "../transactions";

export interface EsiCorpJournalEntry {
  id: number;
  date: string;
  ref_type: string;
  description: string;
  amount?: number;
  balance?: number;
  first_party_id?: number;
  second_party_id?: number;
  context_id?: number;
  context_id_type?: string;
  reason?: string;
  tax?: number;
  tax_receiver_id?: number;
}

export interface EsiCorpTransaction {
  transaction_id: number;
  date: string;
  type_id: number;
  quantity: number;
  unit_price: number;
  is_buy: boolean;
  client_id: number;
  location_id: number;
  journal_ref_id: number;
}

/** ESI serves at most this many journal pages per division (10 × 1,000 entries; CCP won't change it). */
export const JOURNAL_MAX_PAGES = 10;

/** How far back ESI's corporation wallet journal and transactions go. */
export const ESI_WALLET_WINDOW_DAYS = 30;

/** Wallet routes are cached for an hour: a response can be that much older than the request. */
const ESI_WALLET_CACHE_MS = 3_600_000;

const DAY_MS = 86_400_000;

export interface FetchedJournal {
  /** De-duplicated, newest first. */
  rows: EsiCorpJournalEntry[];
  /** ESI requests made. */
  pages: number;
  /** A page reached entries that are already stored. */
  overlapped: boolean;
  /** Reached the page limit without finding stored entries: older entries may have been cut off. */
  truncated: boolean;
  expiresAt: Date | null;
}

/**
 * Journal entries of one division newer than `newestStoredId`. ESI pages the journal with `page`/`X-Pages`, newest
 * first. Paging stops at the first page that reaches stored entries, at the last page, or at the page limit. New
 * entries push older ones onto later pages while we page, so entries are de-duplicated by id. Corporation wallet
 * responses bypass the ESI response cache: the archive tables are the copy that matters.
 */
export function fetchNewJournal(
  esi: EsiClient,
  corporationId: number,
  division: number,
  characterId: number,
  newestStoredId: number | null,
  maxPages = JOURNAL_MAX_PAGES,
): Promise<FetchedJournal> {
  return fetchJournalSince(esi, `/corporations/${corporationId}/wallets/${division}/journal`, characterId, newestStoredId, maxPages);
}

/**
 * `page` paging shared by corporation and character wallet journals: `path` is the journal route, `characterId` the
 * character whose token reads it.
 */
export async function fetchJournalSince(
  esi: EsiClient,
  path: string,
  characterId: number,
  newestStoredId: number | null,
  maxPages = JOURNAL_MAX_PAGES,
): Promise<FetchedJournal> {
  const byId = new Map<number, EsiCorpJournalEntry>();
  let pages = 0;
  let total = 1;
  let overlapped = false;
  let expiresAt: Date | null = null;
  while (pages < total && pages < maxPages) {
    const res = await esi.get<EsiCorpJournalEntry[]>(path, { characterId, page: pages + 1, noCache: true });
    pages++;
    if (pages === 1) {
      total = res.pages;
      expiresAt = res.expiresAt;
    }
    const batch = res.data ?? [];
    for (const e of batch) if (!byId.has(e.id)) byId.set(e.id, e);
    if (newestStoredId !== null && batch.some((e) => e.id <= newestStoredId)) {
      overlapped = true;
      break;
    }
    if (!batch.length) break;
  }
  // ESI's own cap is 10 pages and X-Pages doesn't say whether more entries were cut off: reaching the limit without
  // finding stored entries means the history may continue further back than we could read.
  const truncated = !overlapped && pages >= maxPages;
  const rows = [...byId.values()].sort((a, b) => b.id - a.id);
  return { rows, pages, overlapped, truncated, expiresAt };
}

export interface FetchedCorpTransactions extends FetchedTransactions<EsiCorpTransaction> {
  overlapped: boolean;
}

/** Market transactions of one division newer than `newestStoredId` (`from_id` paging, like personal wallets). */
export async function fetchNewCorpTransactions(
  esi: EsiClient,
  corporationId: number,
  division: number,
  characterId: number,
  newestStoredId: number | null,
  maxPages = 10,
): Promise<FetchedCorpTransactions> {
  const res = await fetchTransactionsSince<EsiCorpTransaction>(
    esi,
    `/corporations/${corporationId}/wallets/${division}/transactions`,
    characterId,
    newestStoredId,
    maxPages,
  );
  const overlapped = newestStoredId !== null && res.rows.some((t) => t.transaction_id <= newestStoredId);
  return { ...res, overlapped };
}

export interface GapInput {
  /** When the previous successful import of this stream fetched from ESI. */
  lastSyncedAt: Date | null;
  /** Date of the newest stored entry. */
  newestStoredAt: Date | null;
  /** Date of the oldest entry this import fetched. */
  oldestFetchedAt: Date | null;
  overlapped: boolean;
  truncated: boolean;
  now: Date;
}

/**
 * The stretch of history this import could not fill, or null when the archive is continuous. The archive is
 * complete up to the last import (minus ESI's cache time) or its newest entry; this import covers ESI's window
 * (30 days, with a day of margin) — or, when it hit the page limit, only back to its oldest entry. A gap is the space
 * between the two. Nothing is a gap on the first import or once fetched entries reach stored ones.
 */
export function detectGap(input: GapInput): { from: Date; to: Date } | null {
  if (input.overlapped) return null;
  const synced = input.lastSyncedAt ? input.lastSyncedAt.getTime() - ESI_WALLET_CACHE_MS : null;
  const stored = input.newestStoredAt?.getTime() ?? null;
  const complete = synced === null ? stored : stored === null ? synced : Math.max(synced, stored);
  if (complete === null) return null;

  let covered: number;
  if (input.truncated && input.oldestFetchedAt) {
    covered = input.oldestFetchedAt.getTime();
  } else {
    if (complete >= input.now.getTime() - (ESI_WALLET_WINDOW_DAYS - 1) * DAY_MS) return null;
    const windowStart = input.now.getTime() - ESI_WALLET_WINDOW_DAYS * DAY_MS;
    const oldest = input.oldestFetchedAt?.getTime();
    covered = oldest !== undefined && oldest < windowStart ? oldest : windowStart;
  }
  return covered > complete ? { from: new Date(complete), to: new Date(covered) } : null;
}
