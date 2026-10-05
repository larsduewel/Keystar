import { EsiError, type EsiClient } from "@/core/esi/client";
import type { MailRecipient, MailRecipientType } from "./schema";

/** GET /characters/{id}/mail. Every field is optional in ESI's schema. */
export interface EsiMailHeader {
  mail_id?: number;
  from?: number;
  subject?: string;
  timestamp?: string;
  is_read?: boolean;
  labels?: number[];
  recipients?: { recipient_id: number; recipient_type: MailRecipientType }[];
}

/** GET /characters/{id}/mail/{mail_id}. Note `read`, not `is_read`. */
export interface EsiMail {
  body?: string;
  from?: number;
  subject?: string;
  timestamp?: string;
  read?: boolean;
  labels?: number[];
  recipients?: { recipient_id: number; recipient_type: MailRecipientType }[];
}

export interface EsiMailLabels {
  labels?: { label_id?: number; name?: string; color?: string; unread_count?: number }[];
  total_unread_count?: number;
}

export interface EsiMailingList {
  mailing_list_id: number;
  name: string;
}

/** A mail header with ESI's optional fields filled in. */
export interface MailHeader {
  mailId: number;
  fromId: number;
  subject: string;
  sentAt: Date;
  isRead: boolean;
  labels: number[];
  recipients: MailRecipient[];
}

export const BUILTIN_LABELS = { inbox: 1, sent: 2, corp: 4, alliance: 8 } as const;
const MAIL_HEADER_PAGE_SIZE = 50;

/** The 18 label colours ESI allows; anything else is not used as a colour. */
export const LABEL_COLORS = new Set([
  "#0000fe",
  "#006634",
  "#0099ff",
  "#00ff33",
  "#01ffff",
  "#349800",
  "#660066",
  "#666666",
  "#999999",
  "#99ffff",
  "#9a0000",
  "#ccff9a",
  "#e6e6e6",
  "#fe0000",
  "#ff6600",
  "#ffff01",
  "#ffffcd",
  "#ffffff",
]);

export function labelColor(value: string | null | undefined): string | null {
  const v = value?.toLowerCase() ?? "";
  return LABEL_COLORS.has(v) ? v : null;
}

function recipients(list: EsiMailHeader["recipients"]): MailRecipient[] {
  const seen = new Set<string>();
  const out: MailRecipient[] = [];
  for (const r of list ?? []) {
    if (!Number.isSafeInteger(r.recipient_id)) continue;
    const key = `${r.recipient_type}:${r.recipient_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: r.recipient_id, type: r.recipient_type });
  }
  return out;
}

export function normalizeHeader(h: EsiMailHeader): MailHeader | null {
  if (!Number.isSafeInteger(h.mail_id) || !h.mail_id) return null;
  const sentAt = h.timestamp ? new Date(h.timestamp) : null;
  return {
    mailId: h.mail_id,
    fromId: h.from ?? 0,
    subject: h.subject ?? "",
    sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : new Date(0),
    isRead: h.is_read ?? false,
    labels: [...new Set(h.labels ?? [])],
    recipients: recipients(h.recipients),
  };
}

export interface FetchedHeaders {
  rows: MailHeader[];
  /** ESI requests made. */
  pages: number;
  /** Stopped at `maxPages` before reaching known (or the oldest) mail. */
  truncated: boolean;
  /**
   * Lowest mail id of the contiguous range ESI listed in full: stored mail at or
   * above it that ESI didn't return was deleted in game. 0 when the whole
   * mailbox was listed, null when nothing came back.
   */
  windowMin: number | null;
  expiresAt: Date | null;
}

/**
 * Mail headers newer than `newestStoredId`. ESI returns the 50 newest; older
 * ones are paged with `last_mail_id` ("only mail with a lower id") until a
 * page reaches mail already stored, comes back empty after a partial page or
 * `maxPages` is hit.
 * The first page is always read, so read state and labels of recent mail stay
 * current. Mail bypasses the ESI response cache: private content is only kept
 * in the mail tables, which the owner can delete.
 */
export async function fetchMailHeaders(
  esi: EsiClient,
  characterId: number,
  newestStoredId: number | null,
  maxPages = 20,
): Promise<FetchedHeaders> {
  const path = `/characters/${characterId}/mail`;
  const first = await esi.get<EsiMailHeader[]>(path, { characterId, noCache: true });
  const firstRaw = first.data ?? [];
  let batch = firstRaw.map(normalizeHeader).filter((h): h is MailHeader => h !== null);
  const rows = [...batch];
  let pages = 1;
  let truncated = false;
  let previousRawWasShort = firstRaw.length > 0 && firstRaw.length < MAIL_HEADER_PAGE_SIZE;
  let reachedEnd = false;
  while (batch.length) {
    const cursor = Math.min(...batch.map((h) => h.mailId));
    if (newestStoredId !== null && cursor <= newestStoredId) break;
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
    const res = await esi.get<EsiMailHeader[]>(path, { characterId, query: { last_mail_id: cursor }, noCache: true });
    pages++;
    const raw = res.data ?? [];
    // Guard against a cursor that is ignored: only strictly older mail advances.
    batch = raw
      .map(normalizeHeader)
      .filter((h): h is MailHeader => h !== null && h.mailId < cursor);
    rows.push(...batch);
    reachedEnd = raw.length === 0 && previousRawWasShort;
    previousRawWasShort = raw.length > 0 && raw.length < MAIL_HEADER_PAGE_SIZE;
  }
  const windowMin = !rows.length ? null : reachedEnd ? 0 : Math.min(...rows.map((h) => h.mailId));
  return { rows, pages, truncated, windowMin, expiresAt: first.expiresAt };
}

/** Stored mail ids (of one mailbox) that ESI no longer lists inside the window it returned in full. */
export function deletedInGame(storedIds: number[], fetched: FetchedHeaders): number[] {
  if (fetched.windowMin === null) return [];
  const listed = new Set(fetched.rows.map((h) => h.mailId));
  return storedIds.filter((id) => id >= fetched.windowMin! && !listed.has(id));
}

export interface FetchedBody {
  body: string;
  isRead: boolean | null;
  labels: number[] | null;
}

/** One mail's body; null when the mail no longer exists (deleted in game). */
export async function fetchMailBody(esi: EsiClient, characterId: number, mailId: number): Promise<FetchedBody | null> {
  try {
    const res = await esi.get<EsiMail>(`/characters/${characterId}/mail/${mailId}`, { characterId, noCache: true });
    return {
      body: res.data?.body ?? "",
      isRead: typeof res.data?.read === "boolean" ? res.data.read : null,
      labels: Array.isArray(res.data?.labels) ? [...new Set(res.data.labels)] : null,
    };
  } catch (err) {
    if (err instanceof EsiError && err.status === 404) return null;
    throw err;
  }
}

export async function fetchMailLabels(esi: EsiClient, characterId: number) {
  const res = await esi.get<EsiMailLabels>(`/characters/${characterId}/mail/labels`, { characterId, noCache: true });
  return (res.data?.labels ?? [])
    .filter((l) => Number.isSafeInteger(l.label_id))
    .map((l) => ({ labelId: l.label_id!, name: l.name ?? "", color: labelColor(l.color) }));
}

export async function fetchMailingLists(esi: EsiClient, characterId: number) {
  const res = await esi.get<EsiMailingList[]>(`/characters/${characterId}/mail/lists`, { characterId, noCache: true });
  return (res.data ?? [])
    .filter((l) => Number.isSafeInteger(l.mailing_list_id))
    .map((l) => ({ mailingListId: l.mailing_list_id, name: l.name ?? "" }));
}
